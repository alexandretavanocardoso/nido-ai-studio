import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  type S3Client,
} from "@aws-sdk/client-s3";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import sharp from "sharp";
import {
  gerarImagemOpenAI,
  getOpenAIKey,
  OpenAIImagemError,
} from "@/lib/ai/openai-imagem";
import { cobrarOuResponder, estornarSeHouver } from "@/lib/creditos";
import {
  armazenamentoOuResponder,
  liberarVaga,
  somarArmazenamento,
  vagaOuResponder,
} from "@/lib/limites";
import { LADO_ARTE, PROMPT_ARTE_NFT } from "@/lib/nft/arte";
import { getBucket, getObjectBuffer, ownsKey, putObject } from "@/lib/storage/s3";
import { CREDITOS_PFP, LIMITE_PFPS, PROMPT_COLAR_PFP } from "./pfp";

/** A logo do pingente (vai junto na função: next.config → outputFileTracingIncludes). */
const LOGO = path.join(process.cwd(), "public", "logo", "NIDO AI STUDIO SEM FUNDO.png");

let logo: Promise<Buffer> | null = null;
/**
 * A logo como referência: amarela sobre fundo transparente, achatada sobre
 * preto (sobre o branco que o transparente costuma virar, o amarelo some).
 */
function logoDoPingente(): Promise<Buffer> {
  logo ??= readFile(LOGO)
    .then((png) =>
      sharp(png)
        .flatten({ background: "#000000" })
        .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer(),
    )
    .catch((e) => {
      logo = null;
      throw e;
    });
  return logo;
}

/**
 * Os PFPs ficam em users/{id}/pfp/. A limpeza de órfãos (lib/storage/cleanup)
 * não apaga esta pasta: são imagens da pessoa, não arquivos de um personagem.
 */
export const pastaPfp = (userId: string) => `users/${userId}/pfp/`;

const recusa = (error: string, code: string, status: number) =>
  NextResponse.json({ error, code }, { status });

/** Os PFPs gerados, do mais novo para o mais antigo. */
export async function listarPfps(
  s3: S3Client,
  userId: string,
): Promise<string[]> {
  const { Contents } = await s3.send(
    new ListObjectsV2Command({ Bucket: getBucket()!, Prefix: pastaPfp(userId) }),
  );
  return (Contents ?? [])
    .filter((o) => o.Key)
    .sort(
      (a, b) =>
        (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0),
    )
    .map((o) => o.Key!);
}

/** A conta já tem os PFPs que pode gerar (LIMITE_PFPS)? */
async function noLimite(s3: S3Client, userId: string): Promise<boolean> {
  return (await listarPfps(s3, userId)).length >= LIMITE_PFPS;
}

const recusaDoLimite = () =>
  recusa(
    `Você já gerou os ${LIMITE_PFPS} PFPs da sua conta.`,
    "LIMITE",
    403,
  );

/**
 * Apaga um PFP (só admin: para os outros, o limite de PFPs é da vida da conta). O que é a foto de perfil atual não sai (a foto ficaria
 * quebrada): primeiro a pessoa troca a foto.
 */
export async function excluirPfp(o: {
  s3: S3Client;
  userId: string;
  key: string;
  imagemDoPerfil: string | null;
}): Promise<NextResponse | null> {
  if (!o.key.startsWith(pastaPfp(o.userId)) || !ownsKey(o.userId, o.key))
    return recusa("PFP não encontrado.", "NOT_FOUND", 404);
  if (o.imagemDoPerfil === fileUrlDoServidor(o.key))
    return recusa(
      "Este PFP é a sua foto de perfil. Troque a foto antes de excluir.",
      "EM_USO",
      409,
    );
  const bucket = getBucket()!;
  const info = await o.s3
    .send(new HeadObjectCommand({ Bucket: bucket, Key: o.key }))
    .catch(() => null);
  if (!info) return recusa("PFP não encontrado.", "NOT_FOUND", 404);
  await o.s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: o.key }));
  await somarArmazenamento(o.userId, -(info.ContentLength ?? 0));
  return null;
}

/** O mesmo endereço que a tela usa para o arquivo (lib/storage/client → fileUrl). */
const fileUrlDoServidor = (key: string) =>
  `/api/storage/file/${key.split("/").map(encodeURIComponent).join("/")}`;

/**
 * A foto de perfil da conta, em bytes. Só lê de dois lugares: um arquivo da
 * própria conta (quando a foto é um PFP gerado aqui) ou a foto do Google. O
 * endereço da foto pode ser trocado pelo usuário, então nada de buscar
 * qualquer URL.
 */
async function fotoDoPerfil(
  s3: S3Client,
  userId: string,
  imagem: string | null,
): Promise<Buffer | null> {
  if (!imagem) return null;
  const local = "/api/storage/file/";
  if (imagem.startsWith(local)) {
    const key = decodeURIComponent(imagem.slice(local.length).split("?")[0]);
    return ownsKey(userId, key) ? getObjectBuffer(s3, key) : null;
  }
  let url: URL;
  try {
    url = new URL(imagem);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".googleusercontent.com"))
    return null;
  // O Google entrega a foto com 96 px (…=s96-c); pede uma maior.
  const grande = url.href.replace(/=s\d+(-c)?$/, "=s1024-c");
  const res = await fetch(grande, { redirect: "error" });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Gera um PFP a partir de uma foto enviada (`key`, em refs/) ou da foto de
 * perfil da conta. Cobra antes; se falhar, devolve os créditos.
 */
export async function gerarPfp(o: {
  userId: string;
  s3: S3Client;
  /** Foto enviada (key do upload) ou null para usar a foto de perfil. */
  key: string | null;
  /** A foto de perfil da sessão (user.image). */
  imagemDoPerfil: string | null;
}): Promise<{ key: string } | NextResponse> {
  const { userId, s3 } = o;
  if (!getOpenAIKey())
    return recusa(
      "A geração de PFP não está configurada (OPENAI_API_KEY).",
      "CONFIG_MISSING",
      500,
    );
  if (o.key && !(ownsKey(userId, o.key) && o.key.startsWith(`users/${userId}/refs/`)))
    return recusa("Foto não encontrada. Envie de novo.", "NOT_FOUND", 404);
  if (await noLimite(s3, userId)) return recusaDoLimite();

  let foto: Buffer | null;
  try {
    foto = o.key
      ? await getObjectBuffer(s3, o.key)
      : await fotoDoPerfil(s3, userId, o.imagemDoPerfil);
  } catch (e) {
    console.error("[pfp] foto de origem", e);
    foto = null;
  }
  if (!foto)
    return recusa(
      o.key
        ? "Foto não encontrada. Envie de novo."
        : "Não consegui usar a sua foto de perfil. Envie uma foto.",
      "SEM_FOTO",
      400,
    );

  // A foto vai como referência de identidade, reduzida para o envio.
  let referencia: Buffer;
  try {
    referencia = await sharp(foto)
      .rotate()
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
  } catch {
    return recusa("Não consegui ler essa imagem. Envie um JPG, PNG ou WebP.", "BAD_INPUT", 400);
  }

  const semEspaco = await armazenamentoOuResponder(userId);
  if (semEspaco) return semEspaco;
  const vaga = await vagaOuResponder(userId, "imagem");
  if (vaga instanceof NextResponse) return vaga;
  const cobrado = await cobrarOuResponder(userId, CREDITOS_PFP, "imagem", "pfp");
  if (cobrado instanceof NextResponse) {
    await liberarVaga(vaga.vaga);
    return cobrado;
  }

  try {
    // O prompt da arte do NFT, mais o colar com a logo (a segunda imagem).
    const gerada = await gerarImagemOpenAI({
      tipo: "quadrado",
      prompt: `${PROMPT_ARTE_NFT}\n\n${PROMPT_COLAR_PFP}`,
      referencias: [
        { mimeType: "image/jpeg", data: referencia },
        { mimeType: "image/jpeg", data: await logoDoPingente() },
      ],
      qualidade: "padrao",
    });
    const jpeg = await sharp(gerada)
      .resize(LADO_ARTE, LADO_ARTE, { fit: "cover" })
      .jpeg({ quality: 90 })
      .toBuffer();
    // Confere de novo: outro pedido ao mesmo tempo pode ter chegado ao limite.
    if (await noLimite(s3, userId)) {
      await estornarSeHouver(cobrado.cobranca);
      return recusaDoLimite();
    }
    const key = `${pastaPfp(userId)}${nanoid(12)}.jpg`;
    await putObject(s3, key, jpeg, "image/jpeg");
    await somarArmazenamento(userId, jpeg.length);
    return { key };
  } catch (e) {
    await estornarSeHouver(cobrado.cobranca);
    if (e instanceof OpenAIImagemError)
      return recusa(e.message, "PROVIDER_ERROR", 502);
    console.error("[pfp] geração", e);
    return recusa(
      "Não consegui gerar o PFP. Os créditos foram devolvidos.",
      "UNKNOWN",
      500,
    );
  } finally {
    await liberarVaga(vaga.vaga);
  }
}

import type { S3Client } from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import sharp from "sharp";
import {
  gerarImagemOpenAI,
  getOpenAIKey,
  OpenAIImagemError,
} from "@/lib/ai/openai-imagem";
import {
  cobrarOuResponder,
  estornarSeHouver,
  planoAtual,
} from "@/lib/creditos";
import { getPool } from "@/lib/db";
import {
  armazenamentoOuResponder,
  liberarVaga,
  somarArmazenamento,
  vagaOuResponder,
} from "@/lib/limites";
import { carregarPersonagem } from "@/lib/personagens";
import { bloqueioNft } from "@/lib/planos";
import { getObjectBuffer, ownsKey, putObject } from "@/lib/storage/s3";
import {
  ARTES_POR_VEZ,
  CREDITOS_ARTE_NFT,
  LADO_ARTE,
  PROMPT_ARTE_NFT,
} from "./arte";
import { imagemDoNft } from "./imagem";
import { mintDoPersonagem } from "./mint";

/**
 * A arte do NFT: cada geração produz cinco opções a partir do Retrato do
 * personagem; a pessoa escolhe uma e é ela que vai para o NFT. Dá para gerar
 * outras cinco enquanto não mintou. Depois do mint (ou com um mint em
 * andamento) nada disto muda mais: a imagem do NFT é definitiva.
 */

export interface ArtesDoNft {
  /** As opções da última geração (keys dos arquivos). */
  opcoes: string[];
  /** A escolhida, ou null. */
  escolhida: string | null;
}

export async function artesDoPersonagem(
  userId: string,
  characterId: string,
): Promise<ArtesDoNft> {
  const { rows } = await getPool()!.query<{
    key: string | null;
    opcoes: string[];
  }>(
    "select key, opcoes from nft_artes where character_id = $1 and user_id = $2",
    [characterId, userId],
  );
  return { opcoes: rows[0]?.opcoes ?? [], escolhida: rows[0]?.key ?? null };
}

const recusa = (error: string, code: string, status: number) =>
  NextResponse.json({ error, code }, { status });

const TRAVADA = "A imagem do NFT não pode mais ser trocada depois do mint.";

/** O personagem tem um mint que não falhou (em andamento ou confirmado)? */
async function mintado(userId: string, characterId: string): Promise<boolean> {
  const m = await mintDoPersonagem(userId, characterId);
  return !!m && m.status !== "falhou";
}

/** Uma arte: o Retrato como referência de identidade, no prompt da coleção. */
async function gerarUma(referencia: Buffer): Promise<Buffer> {
  const gerada = await gerarImagemOpenAI({
    tipo: "quadrado",
    prompt: PROMPT_ARTE_NFT,
    referencias: [{ mimeType: "image/jpeg", data: referencia }],
    qualidade: "padrao",
  });
  return sharp(gerada)
    .resize(LADO_ARTE, LADO_ARTE, { fit: "cover" })
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * Gera as cinco opções de arte (substituem as anteriores e desfazem a escolha).
 * Cobra antes; se não saírem as cinco, devolve os créditos e não guarda nada.
 */
export async function gerarArtesDoNft(o: {
  userId: string;
  characterId: string;
  s3: S3Client;
}): Promise<ArtesDoNft | NextResponse> {
  const { userId, characterId, s3 } = o;
  const personagem = await carregarPersonagem(userId, characterId);
  if (!personagem) return recusa("Personagem não encontrado.", "NOT_FOUND", 404);
  if (await mintado(userId, characterId)) return recusa(TRAVADA, "MINTADO", 409);
  // A arte sai pelo GPT Image (OpenAI): sem a chave, recusa antes de cobrar.
  if (!getOpenAIKey())
    return recusa(
      "A arte do NFT não está configurada (OPENAI_API_KEY).",
      "CONFIG_MISSING",
      500,
    );
  const retrato = imagemDoNft(personagem);
  if (!retrato || !ownsKey(userId, retrato))
    return recusa(
      "Gere o retrato do personagem antes: a arte do NFT é feita a partir dele.",
      "SEM_RETRATO",
      400,
    );
  const bloqueio = bloqueioNft(await planoAtual(userId));
  if (bloqueio) return recusa(bloqueio, "PLANO", 403);
  const semEspaco = await armazenamentoOuResponder(userId);
  if (semEspaco) return semEspaco;
  const vaga = await vagaOuResponder(userId, "imagem");
  if (vaga instanceof NextResponse) return vaga;
  const cobrado = await cobrarOuResponder(
    userId,
    CREDITOS_ARTE_NFT,
    "imagem",
    "nft-arte",
  );
  if (cobrado instanceof NextResponse) {
    await liberarVaga(vaga.vaga);
    return cobrado;
  }

  try {
    // O retrato vai como referência de identidade, reduzido para o envio.
    const referencia = await sharp(await getObjectBuffer(s3, retrato))
      .rotate()
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
    // As cinco ao mesmo tempo; a que falhar ganha uma segunda tentativa.
    const tentar = () => gerarUma(referencia).catch((e: unknown) => e as Error);
    let artes = await Promise.all(
      Array.from({ length: ARTES_POR_VEZ }, tentar),
    );
    artes = await Promise.all(
      artes.map((a) => (a instanceof Error ? tentar() : a)),
    );
    const falha = artes.find((a): a is Error => a instanceof Error);
    if (falha) throw falha;

    // Keys novas a cada geração: o navegador não mostra as antigas do cache,
    // e a limpeza do S3 apaga as que deixaram de ser usadas.
    const lote = nanoid(8);
    const opcoes = await Promise.all(
      (artes as Buffer[]).map(async (jpeg, i) => {
        const key = `users/${userId}/nft/arte-${characterId}-${lote}-${i + 1}.jpg`;
        await putObject(s3, key, jpeg, "image/jpeg");
        await somarArmazenamento(userId, jpeg.length);
        return key;
      }),
    );
    await getPool()!.query(
      `insert into nft_artes (character_id, user_id, key, opcoes) values ($1, $2, null, $3)
       on conflict (character_id) do update
         set key = null, opcoes = excluded.opcoes, user_id = excluded.user_id, criado_em = now()`,
      [characterId, userId, opcoes],
    );
    return { opcoes, escolhida: null };
  } catch (e) {
    await estornarSeHouver(cobrado.cobranca);
    if (e instanceof OpenAIImagemError)
      return recusa(e.message, "PROVIDER_ERROR", 502);
    console.error("[nft] arte", characterId, e);
    return recusa(
      "Não consegui gerar as artes do NFT. Os créditos foram devolvidos.",
      "UNKNOWN",
      500,
    );
  } finally {
    await liberarVaga(vaga.vaga);
  }
}

/** Escolhe, entre as opções geradas, a arte que vai para o NFT. */
export async function escolherArteDoNft(o: {
  userId: string;
  characterId: string;
  key: string;
}): Promise<ArtesDoNft | NextResponse> {
  if (await mintado(o.userId, o.characterId))
    return recusa(TRAVADA, "MINTADO", 409);
  const { rows } = await getPool()!.query<{ key: string; opcoes: string[] }>(
    `update nft_artes set key = $3
     where character_id = $1 and user_id = $2 and $3 = any(opcoes)
     returning key, opcoes`,
    [o.characterId, o.userId, o.key],
  );
  if (!rows[0])
    return recusa("Essa arte não está entre as opções.", "NOT_FOUND", 404);
  return { opcoes: rows[0].opcoes, escolhida: rows[0].key };
}

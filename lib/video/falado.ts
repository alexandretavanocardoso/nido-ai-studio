import type RunwayML from "@runwayml/sdk";
import type { S3Client } from "@aws-sdk/client-s3";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import { createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { generateImage } from "@/lib/ai/gemini";
import {
  downloadToFile,
  newKey,
  presignGet,
  uploadFromFile,
} from "@/lib/storage/s3";
import { juntarFalas } from "./ffmpeg";
import type { ModeloFalado } from "./precos";
import { mensagemDeErroRunway } from "./runway";
import { comPastaTemporaria } from "./server";

/**
 * Vídeo falado pelo Runway (gwm1_avatars): a imagem do personagem vira um
 * "avatar" e o Runway gera o vídeo dele falando um áudio — aqui, a fala feita
 * com a voz do personagem na ElevenLabs — com os lábios sincronizados.
 *
 * São duas etapas no Runway: o avatar é preparado a partir da imagem (leva um
 * pouco) e só então o vídeo pode ser pedido. Enquanto o avatar não fica
 * pronto, o `fal_request_id` do job é `avatar:<id>`; depois vira o id da
 * tarefa do vídeo, acompanhada como qualquer outra do Runway.
 */
export const MODELO_FALADO = "gwm1_avatars";
const PREFIXO = "avatar:";

export const esperaAvatar = (idExterno: string) =>
  idExterno.startsWith(PREFIXO) ? idExterno.slice(PREFIXO.length) : null;
export const idDaEspera = (avatarId: string) => `${PREFIXO}${avatarId}`;

const MODELO_VISAO =
  process.env.GEMINI_TEXT_MODEL?.trim() || "gemini-flash-latest";

/** Onde está o rosto na imagem, em frações (0–1) da largura e da altura. */
export interface Rosto {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Acha o rosto principal (Gemini). Sem chave ou se falhar: null. */
async function acharRosto(imagem: Buffer): Promise<Rosto | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const pequena = await sharp(imagem)
      .resize(768, 768, { fit: "inside" })
      .jpeg({ quality: 80 })
      .toBuffer();
    const res = await new GoogleGenAI({ apiKey }).models.generateContent({
      model: MODELO_VISAO,
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "Find the face of the main person or character in this image. " +
                "Answer with JSON only: the face bounding box (forehead to chin, ear to ear) as fractions of the image width and height, " +
                'like {"x0": 0.41, "y0": 0.08, "x1": 0.58, "y1": 0.21}. If there is no face, answer {}.',
            },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: pequena.toString("base64"),
              },
            },
          ],
        },
      ],
    });
    const json = (res.text ?? "").match(/\{[\s\S]*\}/)?.[0];
    const r = json ? (JSON.parse(json) as Partial<Rosto>) : {};
    const n = [r.x0, r.y0, r.x1, r.y1].map(Number);
    if (n.some((v) => !Number.isFinite(v) || v < 0 || v > 1)) return null;
    if (n[2] - n[0] < 0.02 || n[3] - n[1] < 0.02) return null;
    return { x0: n[0], y0: n[1], x1: n[2], y1: n[3] };
  } catch (e) {
    console.warn("[falado] rosto não localizado:", (e as Error).message);
    return null;
  }
}

/**
 * Quadrado (em pixels) de cabeça e ombros em volta do rosto. Sem o rosto,
 * chuta o alto da imagem, centralizado — onde ele costuma estar num retrato.
 */
export function quadroDoRosto(
  largura: number,
  altura: number,
  rosto: Rosto | null,
): { left: number; top: number; lado: number } {
  const menor = Math.min(largura, altura);
  if (!rosto) {
    const lado = Math.round(menor * (altura > largura ? 0.55 : 1));
    return { left: Math.round((largura - lado) / 2), top: 0, lado };
  }
  const fw = (rosto.x1 - rosto.x0) * largura;
  const fh = (rosto.y1 - rosto.y0) * altura;
  const lado = Math.round(Math.min(menor, Math.max(fw, fh) * 2.8));
  const cx = ((rosto.x0 + rosto.x1) / 2) * largura;
  const cy = ((rosto.y0 + rosto.y1) / 2) * altura;
  const limitar = (v: number, max: number) =>
    Math.round(Math.min(Math.max(0, v), max));
  return {
    left: limitar(cx - lado / 2, largura - lado),
    // O rosto fica um pouco acima do meio: sobra espaço para os ombros.
    top: limitar(cy - lado * 0.42, altura - lado),
    lado,
  };
}

/**
 * O avatar do Runway só aceita retrato de perto (cabeça e ombros): imagem de
 * corpo inteiro ou de busto é recusada ("This image cannot be used for an
 * avatar"), conferido em 08/10/2026. Recorta a imagem do personagem em volta
 * do rosto antes de mandar.
 */
export async function recorteParaAvatar(imagem: Buffer): Promise<Buffer> {
  const base = await sharp(imagem).rotate().toBuffer();
  const { width, height } = await sharp(base).metadata();
  if (!width || !height) return imagem;
  const q = quadroDoRosto(width, height, await acharRosto(base));
  return sharp(base)
    .extract({ left: q.left, top: q.top, width: q.lado, height: q.lado })
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer();
}

/** Cria o avatar do Runway a partir da imagem do personagem (já recortada). */
export async function criarAvatar(
  rw: RunwayML,
  o: { nome: string; imageUrl: string },
): Promise<string> {
  const a = await rw.avatars.create({
    name: o.nome.slice(0, 50) || "Personagem",
    // Só importa em conversas ao vivo; no vídeo ele fala o áudio enviado.
    personality: "Speaks the provided audio naturally, looking at the camera.",
    referenceImage: o.imageUrl,
    // Obrigatória, mas não é usada: a voz vem do áudio (ElevenLabs).
    voice: { type: "runway-live-preset", presetId: "clara" },
  });
  return a.id;
}

export type EstadoAvatar =
  | { estado: "preparando" }
  | { estado: "pronto" }
  | { estado: "erro"; mensagem: string };

export async function estadoAvatar(
  rw: RunwayML,
  avatarId: string,
): Promise<EstadoAvatar> {
  try {
    const a = await rw.avatars.retrieve(avatarId);
    if (a.status === "READY") return { estado: "pronto" };
    if (a.status === "FAILED")
      return {
        estado: "erro",
        mensagem: `O Runway não conseguiu preparar o avatar com esta imagem: ${a.failureReason}`,
      };
    return { estado: "preparando" };
  } catch (e) {
    return { estado: "erro", mensagem: mensagemDeErroRunway(e) };
  }
}

/** Pede o vídeo do avatar falando o áudio. Devolve o id da tarefa. */
export async function enviarVideoFalado(
  rw: RunwayML,
  s3: S3Client,
  o: { avatarId: string; audioKey: string },
): Promise<string> {
  const t = await rw.avatarVideos.create({
    model: MODELO_FALADO,
    avatar: { type: "custom", avatarId: o.avatarId },
    speech: { type: "audio", audio: await presignGet(s3, o.audioKey, 86_400) },
  });
  return t.id;
}

/**
 * Cenário de uma cena: o mesmo retrato do personagem, em outro lugar (Nano
 * Banana). O rosto, o cabelo e a roupa têm que continuar os mesmos — é a
 * mesma pessoa falando, só mudou onde ela está.
 */
export async function retratoNoCenario(
  retrato: Buffer,
  cenario: string,
  /** Corpo inteiro: mantém o enquadramento da imagem, nesta proporção. */
  inteiro?: { proporcao: string },
): Promise<Buffer> {
  return generateImage({
    prompt: [
      "Edit this photo: keep the SAME person exactly as they are — same face, same hair, same skin, same outfit and accessories, same expression, same pose — and change ONLY the background and the lighting.",
      `New setting: ${cenario}`,
      inteiro
        ? "Keep the framing exactly as in the photo: the whole person stays in frame, same size and position, feet on the ground of the new setting, facing the camera. The new setting fills the whole image edge to edge, replacing any blurred or plain side areas. The light on the person matches the new setting. Photorealistic. No text, no captions, no logos, no other people in front of the subject."
        : "Framing stays a close-up portrait: head and shoulders, centred, facing the camera, face fully visible and sharp, nothing covering it. The light on the person matches the new setting. Photorealistic. No text, no captions, no logos, no other people in front of the subject.",
    ].join("\n"),
    referencias: [{ mimeType: "image/jpeg", data: retrato.toString("base64") }],
    aspectRatio: inteiro?.proporcao ?? "1:1",
    imageSize: "1K",
    qualidade: "padrao",
  });
}

/**
 * Imagem do personagem no formato exato do vídeo (9:16 em pé, 16:9 deitada).
 * Com a referência em outra proporção, o Hailuo às vezes completa o quadro com
 * faixas coloridas em cima e embaixo (visto em 08/10/2026 com uma imagem 2:3).
 * A imagem entra inteira; o que faltar dos lados é preenchido com ela mesma
 * ampliada e desfocada.
 */
export async function formatoDaImagem(
  imagem: Buffer,
): Promise<{ vertical: boolean; proporcao: string; jpeg: Buffer }> {
  const base = await sharp(imagem).rotate().toBuffer();
  const { width = 1, height = 1 } = await sharp(base).metadata();
  const vertical = height >= width;
  const [w, h] = vertical ? [864, 1536] : [1536, 864];
  const fundo = await sharp(base)
    .resize(w, h, { fit: "cover" })
    .blur(30)
    .toBuffer();
  const frente = await sharp(base).resize(w, h, { fit: "inside" }).toBuffer();
  const jpeg = await sharp(fundo)
    .composite([{ input: frente, gravity: "centre" }])
    .jpeg({ quality: 92 })
    .toBuffer();
  return { vertical, proporcao: vertical ? "9:16" : "16:9", jpeg };
}

/** Modelo do Runway para o corpo inteiro (imagem + áudio da fala de referência). */
export const MODELO_CORPO = "hailuo3";

/**
 * Pede uma cena de corpo inteiro: o Hailuo 3 recebe a imagem inteira e o áudio
 * da fala como referências e gera o personagem falando, no ritmo do áudio.
 * (Imagem como primeiro quadro não pode ser combinada com áudio de referência.)
 */
export async function enviarCorpoInteiro(
  rw: RunwayML,
  s3: S3Client,
  cena: CenaFalada,
  vertical: boolean,
): Promise<string> {
  const t = await rw.imageToVideo.create({
    model: MODELO_CORPO,
    promptImage: [{ uri: await presignGet(s3, cena.imagemKey, 86_400) }],
    promptText:
      "The person from the reference image, in the same outfit and in the same place as the reference image, stands with the full body in frame and talks directly to the camera, saying exactly the words of the reference audio with precise lip sync. Natural small hand gestures and expression that fit the speech. Static camera. The scene fills the whole frame edge to edge: no borders, no letterbox bars, no coloured bands. No text or captions on screen.",
    duration: cena.duracao ?? 5,
    ratio: vertical ? "9:16" : "16:9",
    resolution: "768p",
    referenceAudio: [
      { type: "audio", uri: await presignGet(s3, cena.audioKey, 86_400) },
    ],
  });
  return t.id;
}

/**
 * Vídeo falado em cenas: cada cena tem o seu avatar (o retrato naquele
 * cenário) e o seu áudio. O Runway gera uma por vez; as prontas ficam em
 * `partes` (S3) e, com a última, todas são unidas.
 */
export interface CenaFalada {
  /** Retrato da cena (já no cenário), no S3: é dele que o avatar é feito. */
  imagemKey: string;
  audioKey: string;
  /** Avatar do Runway, quando já foi criado. */
  avatarId?: string;
  /** Quantas vezes o Runway já recusou o avatar desta cena. */
  recusas?: number;
  /** Retrato sem cenário: o avatar serve para outros vídeos da mesma imagem. */
  base?: boolean;
  /** Corpo inteiro: segundos que o modelo gera para esta cena. */
  duracao?: number;
}

export interface Falado {
  /** Nome do personagem (o Runway pede um nome para o avatar). */
  nome: string;
  cenas: CenaFalada[];
  partes: string[];
  /**
   * Corpo inteiro em vez do avatar em close. `modelo` (ver MODELOS_FALADO):
   * sem ele, Hailuo 3 no Runway (os jobs de antes da escolha).
   */
  corpo?: { vertical: boolean; modelo?: ModeloFalado };
}

/**
 * O Runway recusa avatares criados ao mesmo tempo ("This image cannot be used
 * for an avatar") mesmo com imagens que ele aceita sozinhas — conferido em
 * 08/10/2026: 2 de 3 recusados juntos, os mesmos 3 aceitos um por vez. Por
 * isso cada avatar só é criado quando chega a vez da cena, e uma recusa é
 * tentada de novo antes de o vídeo falhar.
 */
export const MAX_RECUSAS_DO_AVATAR = 2;

export function faladoDoJob(input: Record<string, unknown>): Falado | null {
  const f = input.falado as Partial<Falado> | undefined;
  if (!f || !Array.isArray(f.cenas) || !Array.isArray(f.partes)) return null;
  return {
    nome: f.nome ?? "Personagem",
    cenas: f.cenas,
    partes: f.partes,
    corpo: f.corpo,
  };
}

/** Cria o avatar de uma cena a partir do retrato dela. */
export async function criarAvatarDaCena(
  rw: RunwayML,
  s3: S3Client,
  nome: string,
  cena: CenaFalada,
): Promise<string> {
  return criarAvatar(rw, {
    nome,
    imageUrl: await presignGet(s3, cena.imagemKey, 86_400),
  });
}

async function baixar(url: string, arquivo: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body)
    throw new Error(`download da cena falhou (HTTP ${res.status})`);
  await pipeline(
    Readable.fromWeb(res.body as import("node:stream/web").ReadableStream),
    createWriteStream(arquivo),
  );
}

/** Guarda no S3 a cena que acabou de ficar pronta. Devolve a key. */
export async function guardarCenaFalada(o: {
  s3: S3Client;
  userId: string;
  videoUrl: string;
}): Promise<string> {
  return comPastaTemporaria(async (dir) => {
    const arquivo = path.join(dir, "cena.mp4");
    await baixar(o.videoUrl, arquivo);
    const key = newKey(o.userId, "videos", "video/mp4");
    await uploadFromFile(o.s3, key, arquivo, "video/mp4");
    return key;
  });
}

/** Última cena pronta: une todas e sobe o vídeo final. */
export async function unirFalado(o: {
  s3: S3Client;
  userId: string;
  partes: string[];
  ultimaUrl: string;
  /** Falas das cenas (keys dos MP3): passam a ser o som do vídeo. */
  audios?: string[];
}): Promise<{ key: string; size: number }> {
  return comPastaTemporaria(async (dir) => {
    const arquivos: string[] = [];
    for (const [i, key] of o.partes.entries()) {
      const arquivo = path.join(dir, `cena-${i}.mp4`);
      await downloadToFile(o.s3, key, arquivo);
      arquivos.push(arquivo);
    }
    const ultima = path.join(dir, "cena-final.mp4");
    await baixar(o.ultimaUrl, ultima);
    arquivos.push(ultima);
    const audios: string[] = [];
    for (const [i, key] of (o.audios ?? []).entries()) {
      const arquivo = path.join(dir, `fala-${i}.mp3`);
      await downloadToFile(o.s3, key, arquivo);
      audios.push(arquivo);
    }
    const saida = path.join(dir, "video.mp4");
    await juntarFalas(arquivos, saida, o.audios ? audios : undefined);
    const key = newKey(o.userId, "videos", "video/mp4");
    await uploadFromFile(o.s3, key, saida, "video/mp4");
    // As cenas soltas ficam órfãs no S3: a limpeza diária apaga.
    return { key, size: (await stat(saida)).size };
  });
}

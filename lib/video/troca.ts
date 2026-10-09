import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { FalClient } from "@fal-ai/client";
import type { S3Client } from "@aws-sdk/client-s3";
import { newKey, uploadFromFile } from "@/lib/storage/s3";
import {
  extrairAudio,
  juntarTrechos,
  prepararTrechoTroca,
  temAudio,
  trechosTroca,
  type VideoInfo,
} from "./ffmpeg";
import {
  baixarTrechos,
  estadoLote,
  type EstadoLote,
  type Segmento,
} from "./lote";
import type { QualidadeTroca } from "./precos";
import { comPastaTemporaria } from "./server";
import { webhookUrl } from "./webhook";

/**
 * Troca de pessoa (fal.ai): troca só a pessoa pelo personagem e mantém
 * cenário, câmera, movimento e o áudio original. Dois motores:
 *  - kling    → Kling O3 Edit (padrão). Aceita trechos de 3–15s, em três formatos:
 *               Standard (US$ 0,126/s), Pro (US$ 0,168/s, o padrão) e 4K (US$ 0,42/s).
 *  - seedance → Seedance 2.5 em modo edição (premium, US$ 0,568/s em 720p: o fal cobra entrada + saída).
 *               Aceita até 30s de uma vez: preserva melhor cenário, objetos e roupa.
 * O vídeo vira trechos iguais do tamanho máximo do motor (lado menor ≥ 720px),
 * processados em paralelo; no fim eles são juntados e o áudio original
 * (música, fala) volta por baixo.
 *
 * A personagem vai SEM fundo (recortada e sobre branco) — com fundo, o modelo
 * copia o cenário da imagem em vez de manter o do vídeo.
 *
 * No Kling vão também:
 *  - um quadro-âncora (lib/video/ancora.ts): um quadro do vídeo com a troca já
 *    feita, igual para todos os trechos — sem ele o visual pula nas emendas;
 *  - um close do rosto de cada personagem (o rosto é pequeno na imagem de corpo inteiro);
 *  - a descrição das OUTRAS pessoas do vídeo — sem dizer quem são, o modelo as redesenha.
 */
export type MotorTroca = "kling" | "seedance";

/** Kling O3 Edit: um endpoint do fal por formato. */
export const MODELOS_KLING: Record<QualidadeTroca, string> = {
  standard: "fal-ai/kling-video/o3/standard/video-to-video/edit",
  pro: "fal-ai/kling-video/o3/pro/video-to-video/edit",
  "4k": "fal-ai/kling-video/o3/4k/video-to-video/edit",
};

export const MOTORES_TROCA: Record<
  MotorTroca,
  { modelo: string; maxTrecho: number }
> = {
  kling: {
    modelo: MODELOS_KLING.pro,
    maxTrecho: 15,
  },
  seedance: {
    modelo: "bytedance/seedance-2.5/reference-to-video",
    maxTrecho: 30,
  },
};
const MODELO_RECORTE = "fal-ai/birefnet/v2";

/** Modelos usados antes (jobs antigos ainda em andamento continuam sendo acompanhados neles). */
const MODELOS_ANTIGOS = [
  "fal-ai/kling-video/o1/standard/video-to-video/edit",
  "fal-ai/kling-video/o1/video-to-video/edit",
];

export function ehModeloTroca(modelo: string): boolean {
  return (
    MODELOS_ANTIGOS.includes(modelo) ||
    Object.values(MODELOS_KLING).includes(modelo) ||
    Object.values(MOTORES_TROCA).some((m) => m.modelo === modelo)
  );
}

export interface InputTroca {
  motor: MotorTroca;
  /** Modelo do fal usado neste job (ausente em jobs antigos = Kling O1 standard). */
  modelo?: string;
  segmentos: Segmento[];
  /** Áudio original (no storage do fal), se o vídeo tinha som. */
  audioUrl: string | null;
}

/** Quem sai do vídeo e quem entra. Sem `descricao`: a pessoa principal do vídeo. */
export interface AlvoTroca {
  personagemUrl: string;
  /** Close do rosto do personagem (referência extra no Kling). */
  rostoUrl?: string | null;
  descricao?: string;
}

/**
 * Pedido à IA: troca SÓ as pessoas indicadas (cada uma pelo seu personagem) e
 * exige que todo o resto — inclusive as outras pessoas — fique como no vídeo.
 * Sem descrição, o alvo é "a pessoa principal".
 * `ancora` (só Kling): há um quadro do vídeo com a troca já feita, enviado como
 * @Image1 — é ele que mantém o mesmo visual em todos os trechos.
 * `outras`: descrição das outras pessoas que aparecem (elas não podem mudar).
 */
export function promptTroca(
  motor: MotorTroca,
  alvos: Array<Pick<AlvoTroca, "descricao">>,
  removerTexto: boolean,
  ancora = false,
  outras: string[] = [],
  /**
   * Alvos (índices) que aparecem trocados na âncora. Sem isso: todos. Quando
   * falta algum, o pedido avisa que esse também tem que ser trocado.
   */
  naAncora?: number[],
  /**
   * A âncora mostra também um personagem que NÃO aparece neste trecho (o
   * trecho só tem parte das pessoas marcadas): o motor não pode trazê-lo.
   */
  sobraNaAncora = false,
): string {
  const ref = (i: number) =>
    motor === "kling" ? `@Element${i + 1}` : `@Image${i + 1}`;
  const refs = alvos.map((_, i) => ref(i)).join(", ");
  const foraDaAncora = naAncora
    ? alvos.map((_, i) => i).filter((i) => !naAncora.includes(i))
    : [];
  return [
    `In @Video1, replace ONLY ${alvos.length === 1 ? "this person" : "these people"}:`,
    ...alvos.map(
      (a, i) =>
        `- ${a.descricao ?? "the main person"} → replace with the character ${ref(i)}.`,
    ),
    ...(ancora && motor === "kling"
      ? foraDaAncora.length
        ? [
            `@Image1 is a frame of this same scene with the replacement already done ONLY for ${naAncora!.map((i) => ref(i)).join(", ")}: ${naAncora!.length === 1 ? "that character" : "those characters"} must look exactly like that in every frame (same face, hair, facial hair, hat, outfit, body proportions and lighting).`,
            `@Image1 does NOT show the replacement of ${foraDaAncora.map((i) => `${alvos[i].descricao ?? "the main person"} (${ref(i)})`).join("; ")}: replace ${foraDaAncora.length === 1 ? "this person" : "these people"} too, in every frame where they appear, taking face, hair, style and outfit from ${foraDaAncora.map((i) => ref(i)).join(", ")}.`,
          ]
        : [
            "@Image1 is a frame of this same scene with the replacement already done: the character(s) must look exactly like that in every frame (same face, hair, facial hair, hat, outfit, body proportions and lighting).",
          ]
      : [
          `Keep each character's face, hair, style and outfit exactly as in ${refs}.`,
        ]),
    ...(sobraNaAncora && ancora && motor === "kling"
      ? [
          "@Image1 also shows another replaced person who does NOT appear in @Video1: ignore that one and never add them, their face, hat or outfit to any frame.",
        ]
      : []),
    ...(alvos.length > 1
      ? [
          `All ${alvos.length} listed people must be replaced, each one only with their own character: never merge two characters, never leave one of the listed people unchanged, and never add a character's hat, hair or clothing as a loose object in the scene.`,
          "A listed person may be off screen for part of the video: while they are not on screen their character does not appear at all. Never give one character's face, hair, hat or outfit to a different person.",
        ]
      : []),
    "Each replaced person stays the SAME character from the first frame to the last, also when they turn around, stand up, walk away or are seen from behind. A back view stays a back view: show the character's back and the back of their head, never a face or a chest where the original shows a back.",
    "Every other person in @Video1 must stay exactly as they are — same face, hair, clothes and movements, appearing at the same moments, including when they pass in front of or behind the replaced person.",
    outras.length
      ? `Other people who appear in @Video1 and must NOT be changed in any way: ${outras.join("; ")}.`
      : "",
    "Every replaced character must look like a real person filmed by this same camera, even if the reference image is a 3D render or an illustration: natural skin texture, the scene's own light and colours on skin and clothes, the same sharpness, grain and motion blur as the rest of @Video1. Never a pasted cutout, never smooth or plastic CGI skin.",
    "Follow the replaced person's motion frame by frame: body pose, arms, hands and finger gestures, head direction and facial expression.",
    "Keep the original background, scenery, objects, camera angle, framing and lighting of @Video1 unchanged.",
    removerTexto ? "Remove all on-screen text, captions and subtitles." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function inputMotor(
  motor: MotorTroca,
  o: {
    videoUrl: string;
    alvos: AlvoTroca[];
    duracao: number;
    removerTexto: boolean;
    ancoraUrl?: string | null;
    outras?: string[];
    naAncora?: number[];
    sobraNaAncora?: boolean;
  },
): Record<string, unknown> {
  if (motor === "kling")
    return {
      prompt: promptTroca(
        motor,
        o.alvos,
        o.removerTexto,
        !!o.ancoraUrl,
        o.outras,
        o.naAncora,
        o.sobraNaAncora,
      ),
      video_url: o.videoUrl,
      keep_audio: false,
      // Quadro do vídeo com a troca já feita: guia o visual de todos os trechos (@Image1).
      ...(o.ancoraUrl ? { image_urls: [o.ancoraUrl] } : {}),
      // O Kling pede 1 a 3 imagens extras de cada personagem: o close do rosto
      // (melhora rosto, barba e chapéu); sem ele, a própria imagem principal.
      elements: o.alvos.map((a) => ({
        frontal_image_url: a.personagemUrl,
        reference_image_urls: [a.rostoUrl ?? a.personagemUrl],
      })),
    };
  return {
    task: "editing",
    prompt: promptTroca(motor, o.alvos, o.removerTexto, false, o.outras),
    video_urls: [o.videoUrl],
    image_urls: o.alvos.map((a) => a.personagemUrl),
    resolution: "720p",
    // Duração do trecho (o Seedance gera de 4 a 30s); o áudio original corta o excesso no final.
    duration: Math.min(30, Math.max(4, Math.round(o.duracao))),
    generate_audio: false,
  };
}

async function enviar(
  fal: FalClient,
  arquivo: string,
  tipo: string,
): Promise<string> {
  return fal.storage.upload(
    new Blob([new Uint8Array(await readFile(arquivo))], { type: tipo }),
  );
}

/**
 * Close da cabeça a partir da figura recortada sobre branco: o terço de cima
 * da figura (cabeça, chapéu, barba), ampliado. Null se não der para recortar.
 */
export async function closeDoRosto(
  figuraSobreBranco: Buffer,
): Promise<Buffer | null> {
  try {
    const figura = await sharp(figuraSobreBranco)
      .trim({ background: "#ffffff", threshold: 12 })
      .toBuffer({ resolveWithObject: true });
    const { width, height } = figura.info;
    // Só vale para figura em pé (corpo inteiro ou meio corpo); num close já não precisa.
    if (height < width * 1.3) return null;
    return await sharp(figura.data)
      .extract({ left: 0, top: 0, width, height: Math.round(height * 0.3) })
      .resize({ width: 1024 })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 92 })
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * Personagem recortada sobre branco liso (+ close do rosto, quando dá).
 * Se o recorte falhar, segue com a imagem original.
 */
export async function personagemSemFundo(
  fal: FalClient,
  imagem: Buffer,
): Promise<{ url: string; rostoUrl: string | null }> {
  const subir = (b: Buffer, tipo: string) =>
    fal.storage.upload(new Blob([new Uint8Array(b)], { type: tipo }));
  const original = await subir(imagem, "image/jpeg");
  try {
    const r = await fal.subscribe(MODELO_RECORTE, {
      input: {
        image_url: original,
        model: "General Use (Heavy)",
        output_format: "png",
      },
    });
    const url = (r.data as { image?: { url?: string } })?.image?.url;
    if (!url) return { url: original, rostoUrl: null };
    const recorte = Buffer.from(await (await fetch(url)).arrayBuffer());
    const branco = await sharp(recorte)
      .flatten({ background: "#ffffff" })
      .png()
      .toBuffer();
    const rosto = await closeDoRosto(branco);
    const [figuraUrl, rostoUrl] = await Promise.all([
      subir(branco, "image/png"),
      rosto ? subir(rosto, "image/jpeg") : null,
    ]);
    return { url: figuraUrl, rostoUrl };
  } catch (e) {
    console.warn(
      "[troca] recorte da personagem falhou, usando a imagem original:",
      (e as Error).message,
    );
    return { url: original, rostoUrl: null };
  }
}

/**
 * Alvos de um trecho: só os que aparecem nele (`presentes`, índices da lista
 * completa), com a âncora reindexada para essa lista menor. Lista vazia ou
 * ausente = todos (na dúvida, o trecho recebe todo mundo, como sempre foi).
 */
export function alvosDoTrecho(
  alvos: AlvoTroca[],
  presentes: number[] | undefined,
  naAncora: number[] | undefined,
): { alvos: AlvoTroca[]; naAncora?: number[]; sobraNaAncora: boolean } {
  const indices = presentes?.length
    ? [...new Set(presentes)]
        .filter((i) => i >= 0 && i < alvos.length)
        .sort((a, b) => a - b)
    : [];
  if (!indices.length || indices.length === alvos.length)
    return { alvos, naAncora, sobraNaAncora: false };
  return {
    alvos: indices.map((i) => alvos[i]),
    naAncora: naAncora
      ? indices.flatMap((i, novo) => (naAncora.includes(i) ? [novo] : []))
      : undefined,
    sobraNaAncora: !!naAncora?.some((i) => !indices.includes(i)),
  };
}

/** Divide o vídeo (já baixado em `arquivo`), envia os trechos ao motor e guarda o áudio original. */
export async function iniciarTroca(o: {
  fal: FalClient;
  motor: MotorTroca;
  /** Formato do Kling O3 (Standard, Pro ou 4K). O Seedance ignora. */
  qualidade?: QualidadeTroca;
  arquivo: string;
  info: VideoInfo;
  alvos: AlvoTroca[];
  removerTexto: boolean;
  jobId: string;
  /** Quadro do vídeo com a troca já feita (lib/video/ancora.ts). Só o Kling usa. */
  ancora?: Buffer | null;
  /** Descrição das outras pessoas do vídeo (não podem mudar). */
  outras?: string[];
  /** Alvos que aparecem trocados na âncora (ver lib/video/ancora.ts). */
  naAncora?: number[];
  /**
   * Para cada trecho (mesma ordem de `trechosTroca`), os alvos que aparecem
   * nele. Sem isso, todo trecho recebe todos os alvos — e, num trecho em que
   * só uma das pessoas aparece, o motor "encaixa" o outro personagem nela.
   */
  alvosPorTrecho?: number[][];
}): Promise<InputTroca> {
  const { maxTrecho } = MOTORES_TROCA[o.motor];
  const modelo =
    o.motor === "kling"
      ? MODELOS_KLING[o.qualidade ?? "pro"]
      : MOTORES_TROCA[o.motor].modelo;
  return comPastaTemporaria(async (dir) => {
    let audioUrl: string | null = null;
    if (await temAudio(o.arquivo)) {
      const audio = path.join(dir, "audio.m4a");
      await extrairAudio(o.arquivo, audio);
      audioUrl = await enviar(o.fal, audio, "audio/mp4");
    }
    const ancoraUrl =
      o.ancora && o.motor === "kling"
        ? await o.fal.storage.upload(
            new Blob([new Uint8Array(o.ancora)], { type: "image/jpeg" }),
          )
        : null;
    const segmentos = await Promise.all(
      trechosTroca(o.info.duracao, maxTrecho).map(async (t, i) => {
        const seg = path.join(dir, `seg-${i}.mp4`);
        await prepararTrechoTroca(o.arquivo, t.inicio, t.duracao, seg, o.info);
        const videoUrl = await enviar(o.fal, seg, "video/mp4");
        const { request_id } = await o.fal.queue.submit(modelo, {
          input: inputMotor(o.motor, {
            videoUrl,
            duracao: t.duracao,
            removerTexto: o.removerTexto,
            ancoraUrl,
            outras: o.outras,
            ...alvosDoTrecho(
              o.alvos,
              o.alvosPorTrecho?.[i],
              ancoraUrl ? o.naAncora : undefined,
            ),
          }),
          webhookUrl: webhookUrl(o.jobId),
        });
        return { requestId: request_id, inicio: t.inicio, duracao: t.duracao };
      }),
    );
    return { motor: o.motor, modelo, segmentos, audioUrl };
  });
}

export function estadoTroca(
  fal: FalClient,
  input: InputTroca,
): Promise<EstadoLote> {
  // Acompanha no modelo em que o job foi enviado (jobs antigos do Kling, sem modelo: o O1 standard).
  const motor = input.motor ?? "kling";
  const modelo =
    input.modelo ??
    (motor === "kling" ? MODELOS_ANTIGOS[0] : MOTORES_TROCA[motor].modelo);
  return estadoLote(fal, modelo, input.segmentos);
}

/** Junta os trechos gerados, devolve o áudio original e salva no S3. */
export async function comporTroca(o: {
  s3: S3Client;
  userId: string;
  input: InputTroca;
  urls: string[];
}): Promise<{ key: string; size: number }> {
  return comPastaTemporaria(async (dir) => {
    const trechos = await baixarTrechos(o.urls, dir, "troca");
    let audio: string | null = null;
    if (o.input.audioUrl) {
      const res = await fetch(o.input.audioUrl);
      if (res.ok) {
        audio = path.join(dir, "audio.m4a");
        await (
          await import("node:fs/promises")
        ).writeFile(audio, Buffer.from(await res.arrayBuffer()));
      } else
        console.warn(
          "[troca] áudio original indisponível (HTTP",
          res.status,
          ") — vídeo sai sem som",
        );
    }
    const saida = path.join(dir, "final.mp4");
    await juntarTrechos({
      trechos,
      duracoes: o.input.segmentos.map((g) => g.duracao),
      audio,
      saida,
    });
    const key = newKey(o.userId, "videos", "video/mp4");
    const size = await uploadFromFile(o.s3, key, saida, "video/mp4");
    return { key, size };
  });
}

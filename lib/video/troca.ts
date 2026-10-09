import { pedidoDoEstilo, type EstiloTroca } from "./estilos";
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
import { TOMADA_MIN, type QualidadeTroca } from "./precos";
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
  /** Estilo visual do vídeo (ausente ou "realista": continua parecendo filmado). */
  estilo?: EstiloTroca,
  /**
   * O que acontece no trecho, em palavras (um golpe, uma queda, um abraço).
   * Só com "siga o movimento", gestos rápidos e borrados somem do resultado.
   */
  acao?: string,
): string {
  const oQueAcontece = acao?.trim() || undefined;
  // O Kling recusa pedidos com mais de 2500 caracteres. As regras são fixas;
  // o que cresce são as descrições (pessoas a trocar e "outras pessoas").
  // Se não couber, elas encolhem — primeiro as das outras pessoas.
  for (const [maxAlvo, maxOutra, nOutras, maxAcao] of CORTES_DO_PEDIDO) {
    const texto = montarPedido(
      motor,
      alvos.map((a) => ({
        descricao: a.descricao && encurtar(a.descricao, maxAlvo),
      })),
      removerTexto,
      ancora,
      outras.slice(0, nOutras).map((x) => encurtar(x, maxOutra)),
      naAncora,
      sobraNaAncora,
      estilo,
      oQueAcontece && encurtar(oQueAcontece, maxAcao),
    );
    if (texto.length <= PEDIDO_MAX) return texto;
  }
  return montarPedido(
    motor,
    alvos.map((a) => ({ descricao: a.descricao && encurtar(a.descricao, 60) })),
    removerTexto,
    ancora,
    [],
    naAncora,
    sobraNaAncora,
    estilo,
    oQueAcontece && encurtar(oQueAcontece, 120),
  ).slice(0, PEDIDO_MAX);
}

/** Limite do Kling é 2500 caracteres; fica uma folga. */
export const PEDIDO_MAX = 2400;
/**
 * [máx. por pessoa a trocar, máx. por "outra pessoa", quantas "outras", máx. da
 * ação], do mais completo ao mais enxuto. A ação é a última a encolher: é ela
 * que faz o motor reproduzir um golpe ou uma queda.
 */
const CORTES_DO_PEDIDO: Array<[number, number, number, number]> = [
  [220, 240, 3, 320],
  [160, 140, 3, 320],
  [160, 110, 2, 320],
  [120, 90, 2, 280],
  [100, 80, 1, 240],
  [80, 0, 0, 200],
];

/** Corta no fim de uma palavra, sem passar de `max`. */
function encurtar(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max);
  return corte.slice(0, Math.max(corte.lastIndexOf(" "), max - 20)).trim();
}

function montarPedido(
  motor: MotorTroca,
  alvos: Array<Pick<AlvoTroca, "descricao">>,
  removerTexto: boolean,
  ancora: boolean,
  outras: string[],
  naAncora: number[] | undefined,
  sobraNaAncora: boolean,
  estilo?: EstiloTroca,
  acao?: string,
): string {
  // Com estilo, o vídeo inteiro é redesenhado: quem não é trocado continua
  // sendo a mesma pessoa, só que desenhada; e o cenário mantém a composição.
  const visual = pedidoDoEstilo(estilo);
  const ref = (i: number) =>
    motor === "kling" ? `@Element${i + 1}` : `@Image${i + 1}`;
  const refs = alvos.map((_, i) => ref(i)).join(", ");
  const foraDaAncora = naAncora
    ? alvos.map((_, i) => i).filter((i) => !naAncora.includes(i))
    : [];
  const igualAncora = "(face, hair, hat, outfit, proportions, lighting)";
  // Legendas e textos da tela ficam, a não ser que o usuário peça para tirar
  // (sem dizer isso, o motor às vezes some com a legenda do vídeo).
  const legendas = removerTexto ? "" : "on-screen text, ";
  return [
    `In @Video1, replace ONLY ${alvos.length === 1 ? "this person" : "these people"}:`,
    ...alvos.map(
      (a, i) =>
        `- ${a.descricao ?? "the main person"} → replace with the character ${ref(i)}.`,
    ),
    ...(ancora && motor === "kling"
      ? foraDaAncora.length
        ? [
            `@Image1 is a frame of this same scene with the replacement already done ONLY for ${naAncora!.map((i) => ref(i)).join(", ")}: match it exactly in every frame ${igualAncora}.`,
            `@Image1 does NOT show the replacement of ${foraDaAncora.map((i) => `${alvos[i].descricao ?? "the main person"} (${ref(i)})`).join("; ")}: replace them too in every frame, taking face, hair and outfit from ${foraDaAncora.map((i) => ref(i)).join(", ")}.`,
          ]
        : [
            `@Image1 is a frame of this same scene with the replacement already done: the character(s) must look exactly like that in every frame ${igualAncora}.`,
          ]
      : [
          `Keep each character's face, hair, style and outfit exactly as in ${refs}.`,
        ]),
    ...(sobraNaAncora && ancora && motor === "kling"
      ? [
          "@Image1 also shows another replaced person who does NOT appear in @Video1: never add them.",
        ]
      : []),
    ...(alvos.length > 1
      ? [
          `All ${alvos.length} listed people must be replaced, each only with their own character: never merge two characters, leave one unchanged, or add a hat, hair or clothing as a loose object. A person may leave the frame: while they are not on screen their character does not appear; never give one character's look to a different person.`,
        ]
      : []),
    // O fim da frase ("nothing of their own head…") evita sobrar cabelo ou peruca
    // da pessoa original por baixo do chapéu do personagem.
    "Each replaced person stays the SAME character in every frame, also turning around or seen from behind. A back view stays a back view: never a face or chest where the original shows a back. Nothing of their own head remains (hair, wig, hat, glasses, facial hair).",
    visual
      ? "Every other person in @Video1 stays the same person (face, hair, clothes, movements), drawn in the same style, also when crossing the replaced person."
      : "Every other person in @Video1 must stay exactly as they are (face, hair, clothes, movements), also when crossing the replaced person.",
    outras.length
      ? `Other people who must NOT be changed in any way: ${outras.join("; ")}.`
      : "",
    visual
      ? `Render the ENTIRE video — the replaced characters, every other person, the background and the objects — as ${visual}. The same style in every frame, never a photo or a mix of photo and drawing.`
      : "Replaced characters must look like real people filmed by this camera, even if the reference is a 3D render or drawing: real skin texture, the scene's light, same sharpness, grain and motion blur. Never a pasted cutout or plastic skin.",
    "Follow the replaced person's motion frame by frame: pose, arms, hands and finger gestures, head direction and expression.",
    acao
      ? `What happens in @Video1 (same moments, speed and force): ${acao}`
      : "",
    visual
      ? // "add or remove no…": sem isto aparecem figurantes e objetos que não existem no vídeo.
        `Keep the scene of @Video1: the same place, objects, ${legendas}camera angle and framing — only the rendering style changes; add or remove no person or object.`
      : `Keep the background, objects, ${legendas}camera angle, framing and lighting of @Video1 unchanged; add or remove no person or object.`,
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
    estilo?: EstiloTroca;
    acao?: string;
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
        o.estilo,
        o.acao,
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
    prompt: promptTroca(
      motor,
      o.alvos,
      o.removerTexto,
      false,
      o.outras,
      undefined,
      false,
      o.estilo,
      o.acao,
    ),
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

/** Quem aparece em cada quadro amostrado (ver `linhaDoTempoDosAlvos` em ./ancora.ts). */
interface Presencas {
  instantes: number[];
  visiveis: number[][];
}

/**
 * Instantes em que uma pessoa a trocar entra em cena: aparece num quadro depois
 * de ter ficado fora nos dois anteriores (um quadro só de ausência pode ser
 * alguém passando na frente). Vale o instante do primeiro quadro COM ela: o
 * trecho novo tem que começar com a pessoa já na tela. Começando um pouco
 * antes (testado), o motor monta no primeiro quadro a cena do quadro-âncora,
 * com personagens que não estão ali. O primeiro quadro do vídeo não conta:
 * ali ninguém "entra".
 */
export function entradasDosAlvos(linha: Presencas, total: number): number[] {
  const entradas = new Set<number>();
  for (let alvo = 0; alvo < total; alvo++)
    for (let k = 1; k < linha.instantes.length; k++) {
      const em = (q: number) => linha.visiveis[q].includes(alvo);
      if (em(k) && !em(k - 1) && (k < 2 || !em(k - 2)))
        entradas.add(linha.instantes[k]);
    }
  return [...entradas].sort((a, b) => a - b);
}

/**
 * Para cada trecho, quem aparece nele (em qualquer quadro amostrado dentro do
 * trecho). Trecho sem quadro amostrado, ou sem ninguém visto: todos — na
 * dúvida ninguém fica sem trocar.
 */
export function alvosNosTrechos(
  trechos: Array<{ inicio: number; duracao: number }>,
  linha: Presencas,
  total: number,
): number[][] {
  const todos = Array.from({ length: total }, (_, i) => i);
  return trechos.map((t) => {
    const vistos = new Set<number>();
    linha.instantes.forEach((instante, k) => {
      // Folga de 1 ms: o trecho pode começar exatamente num quadro amostrado.
      if (instante >= t.inicio - 0.001 && instante < t.inicio + t.duracao)
        for (const a of linha.visiveis[k]) vistos.add(a);
    });
    return vistos.size ? [...vistos].sort((a, b) => a - b) : todos;
  });
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

/**
 * A ação de um trecho vem escrita com as pessoas como [[1]], [[2]]… (a ordem
 * dos alvos). Aqui cada uma vira a referência que o motor entende — @Element
 * ou @Image, na numeração dos alvos DESTE trecho — e quem não está no trecho
 * vira "another person".
 */
export function acaoDoTrecho(
  acao: string | undefined,
  presentes: number[] | undefined,
  total: number,
  motor: MotorTroca,
): string | undefined {
  if (!acao?.trim()) return undefined;
  const indices = presentes?.length
    ? [...new Set(presentes)]
        .filter((i) => i >= 0 && i < total)
        .sort((a, b) => a - b)
    : Array.from({ length: total }, (_, i) => i);
  return acao.trim().replace(/\[\[(\d+)\]\]/g, (_, n: string) => {
    const pos = indices.indexOf(Number(n) - 1);
    if (pos < 0) return "another person";
    return motor === "kling" ? `@Element${pos + 1}` : `@Image${pos + 1}`;
  });
}

/** Uma tomada no modo tomada por tomada (ver `iniciarTroca`). */
export interface TomadaEnvio {
  inicio: number;
  duracao: number;
  /** Quem trocar nela, já com a descrição da própria tomada. Vazio: fica como no original. */
  alvos: AlvoTroca[];
  /** Quadro da tomada com a troca feita. */
  ancora: Buffer | null;
  /** Posições (em `alvos`) de quem aparece trocado na âncora. */
  naAncora: number[];
  /** O que acontece nela, já com as referências do motor (@Element1…). */
  acao?: string;
}

/**
 * Envia as tomadas uma a uma. As mais curtas que o mínimo do motor vão em
 * câmera lenta (a montagem devolve a velocidade); as mais longas que o máximo
 * são divididas em partes iguais; as sem ninguém a trocar não vão ao motor —
 * o próprio original entra na montagem.
 */
async function enviarTomadas(
  o: {
    fal: FalClient;
    motor: MotorTroca;
    arquivo: string;
    info: VideoInfo;
    removerTexto: boolean;
    estilo?: EstiloTroca;
    jobId: string;
    tomadas: TomadaEnvio[];
  },
  modelo: string,
  maxTrecho: number,
  dir: string,
): Promise<Segmento[]> {
  const partes = o.tomadas.flatMap((t) =>
    trechosTroca(t.duracao, maxTrecho).map((p) => ({
      tomada: t,
      inicio: Number((t.inicio + p.inicio).toFixed(3)),
      duracao: p.duracao,
    })),
  );
  const ancoras = new Map<TomadaEnvio, Promise<string | null>>();
  const ancoraDe = (t: TomadaEnvio) => {
    if (!ancoras.has(t))
      ancoras.set(
        t,
        t.ancora && o.motor === "kling"
          ? o.fal.storage.upload(
              new Blob([new Uint8Array(t.ancora)], { type: "image/jpeg" }),
            )
          : Promise.resolve(null),
      );
    return ancoras.get(t)!;
  };
  return Promise.all(
    partes.map(async (p, i) => {
      const lentidao = p.duracao < TOMADA_MIN ? TOMADA_MIN / p.duracao : 1;
      const seg = path.join(dir, `tomada-${i}.mp4`);
      await prepararTrechoTroca(
        o.arquivo,
        p.inicio,
        p.duracao,
        seg,
        o.info,
        p.tomada.alvos.length ? lentidao : 1,
      );
      const videoUrl = await enviar(o.fal, seg, "video/mp4");
      if (!p.tomada.alvos.length)
        return {
          requestId: "",
          inicio: p.inicio,
          duracao: p.duracao,
          urlPronta: videoUrl,
        };
      const ancoraUrl = await ancoraDe(p.tomada);
      const { request_id } = await o.fal.queue.submit(modelo, {
        input: inputMotor(o.motor, {
          videoUrl,
          alvos: p.tomada.alvos,
          duracao: p.duracao * lentidao,
          removerTexto: o.removerTexto,
          estilo: o.estilo,
          acao: p.tomada.acao,
          ancoraUrl,
          naAncora: ancoraUrl ? p.tomada.naAncora : undefined,
        }),
        webhookUrl: webhookUrl(o.jobId),
      });
      return { requestId: request_id, inicio: p.inicio, duracao: p.duracao };
    }),
  );
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
  /** Estilo visual do vídeo (ver ./estilos.ts). */
  estilo?: EstiloTroca;
  /**
   * Divisão do vídeo já calculada (nas viradas de cena). Sem isso: partes
   * iguais do tamanho máximo do motor.
   */
  trechos?: Array<{ inicio: number; duracao: number }>;
  /**
   * Para cada trecho (mesma ordem de `trechos`), os alvos que aparecem
   * nele. Sem isso, todo trecho recebe todos os alvos — e, num trecho em que
   * só uma das pessoas aparece, o motor "encaixa" o outro personagem nela.
   */
  alvosPorTrecho?: number[][];
  /**
   * Modo tomada por tomada (vídeo de cortes rápidos, ver ./precos.ts): cada
   * tomada vai sozinha ao motor, com os alvos, a âncora e a ação DELA. Com
   * isto, `trechos`, `alvosPorTrecho`, `acoesPorTrecho`, `ancora` e `naAncora`
   * (os do vídeo inteiro) não são usados.
   */
  tomadas?: TomadaEnvio[];
  /**
   * Para cada trecho, o que acontece nele em palavras, com as pessoas escritas
   * como [[1]], [[2]]… (ver `acoesDosTrechos` em ./ancora.ts e `acaoDoTrecho`).
   */
  acoesPorTrecho?: Array<string | undefined>;
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
    if (o.tomadas)
      return {
        motor: o.motor,
        modelo,
        segmentos: await enviarTomadas(
          { ...o, tomadas: o.tomadas },
          modelo,
          maxTrecho,
          dir,
        ),
        audioUrl,
      };
    const ancoraUrl =
      o.ancora && o.motor === "kling"
        ? await o.fal.storage.upload(
            new Blob([new Uint8Array(o.ancora)], { type: "image/jpeg" }),
          )
        : null;
    const segmentos = await Promise.all(
      (o.trechos ?? trechosTroca(o.info.duracao, maxTrecho)).map(async (t, i) => {
        const seg = path.join(dir, `seg-${i}.mp4`);
        await prepararTrechoTroca(o.arquivo, t.inicio, t.duracao, seg, o.info);
        const videoUrl = await enviar(o.fal, seg, "video/mp4");
        const { request_id } = await o.fal.queue.submit(modelo, {
          input: inputMotor(o.motor, {
            videoUrl,
            duracao: t.duracao,
            removerTexto: o.removerTexto,
            estilo: o.estilo,
            acao: acaoDoTrecho(
              o.acoesPorTrecho?.[i],
              o.alvosPorTrecho?.[i],
              o.alvos.length,
              o.motor,
            ),
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

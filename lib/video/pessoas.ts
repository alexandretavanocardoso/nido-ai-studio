import path from "node:path";
import { readFile } from "node:fs/promises";
import sharp, { type Sharp } from "sharp";
import { GoogleGenAI } from "@google/genai";
import type { FalClient } from "@fal-ai/client";
import type { TipoAlvo } from "@/lib/prompts/trocar-imagem";
import { extrairQuadroMarcado } from "./ffmpeg";

/**
 * Escolher QUEM trocar (no vídeo ou numa foto): a pessoa clica em cima de cada
 * pessoa. Aqui cada ponto vira uma descrição curta ("o homem de camiseta
 * cinza, ajoelhado à direita") que vai no pedido à IA — os motores de troca
 * entendem texto, não coordenadas.
 * O clique também pode cair num animal ou num objeto (um cachorro, um carro):
 * a descrição diz o que foi marcado, e a troca segue as regras desse tipo.
 */
export interface PessoaMarcada {
  /** Posição do clique, em frações do quadro (0–1). */
  x: number;
  y: number;
  /** Instante do vídeo (s) em que a pessoa foi marcada (0 numa foto). */
  t: number;
}

/** O que foi marcado e como reconhecê-lo (inglês, curto). */
export interface AlvoDescrito {
  descricao: string;
  tipo: TipoAlvo;
}

// Alias que acompanha o Flash atual (modelos antigos são desligados para contas novas).
const MODELO_VISAO =
  process.env.GEMINI_TEXT_MODEL?.trim() || "gemini-flash-latest";

/** Posição em palavras — serve de reserva se a descrição por IA falhar. */
export function posicaoEmPalavras(p: Pick<PessoaMarcada, "x" | "y">): string {
  const h =
    p.x < 0.36
      ? "on the left side"
      : p.x > 0.64
        ? "on the right side"
        : "in the center";
  const v = p.y < 0.33 ? "upper part" : p.y > 0.66 ? "lower part" : "middle";
  return `the person ${h} of the frame (${v})`;
}

/** Imagem reduzida com um alvo vermelho no ponto marcado. */
export async function marcarPonto(
  imagem: Buffer,
  p: Pick<PessoaMarcada, "x" | "y">,
): Promise<Buffer> {
  const base = await sharp(imagem)
    .rotate()
    .resize(1024, 1024, { fit: "inside" })
    .toBuffer({ resolveWithObject: true });
  const { width, height } = base.info;
  const cx = Math.round(p.x * width);
  const cy = Math.round(p.y * height);
  const r = Math.round(Math.min(width, height) * 0.045);
  const svg = `<svg width="${width}" height="${height}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ff0033" stroke-width="${Math.max(4, r / 4)}"/><circle cx="${cx}" cy="${cy}" r="${Math.max(3, r / 5)}" fill="#ff0033"/></svg>`;
  return sharp(base.data)
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 85 })
    .toBuffer();
}

const MODELO_SILHUETA = "fal-ai/sam2/image";
/** Acha cada pessoa da imagem inteira (uma máscara por pessoa). */
const MODELO_PESSOAS = "fal-ai/sam-3/image";
/** Lado maior da silhueta devolvida à tela (é só um destaque, não precisa de mais). */
const LADO_SILHUETA = 512;

/**
 * Máscara em tons de cinza (pessoa clara) → PNG branco com transparência fora
 * da pessoa. Null se pegou quase nada ou o quadro inteiro.
 */
async function finalizarSilhueta(mascara: Sharp): Promise<Buffer | null> {
  const cinza = await mascara
    .greyscale()
    .threshold(128)
    .blur(1)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = cinza.info;
  let claros = 0;
  for (let i = 0; i < cinza.data.length; i += channels)
    if (cinza.data[i] > 127) claros++;
  const coberto = claros / (width * height);
  if (coberto < 0.003 || coberto > 0.85) return null;
  const alfa = Buffer.alloc(width * height);
  for (let i = 0; i < alfa.length; i++) alfa[i] = cinza.data[i * channels];
  return sharp({
    create: { width, height, channels: 3, background: "#fff" },
  })
    .joinChannel(alfa, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
}

/** O quadro já reduzido e enviado ao fal (uma vez só para todas as tentativas). */
interface QuadroNoFal {
  url: string;
  width: number;
  height: number;
}

/**
 * Silhueta pelo SAM 3: ele separa cada PESSOA da imagem (ou cada `nome`: "dog",
 * "car"…) e fica a que contém o clique. Só com o ponto (SAM 2), um clique na
 * camiseta devolve só a camiseta. Null se nada do que foi achado contém o clique.
 */
async function silhuetaInteira(
  fal: FalClient,
  url: string,
  p: Pick<PessoaMarcada, "x" | "y">,
  nome: string,
): Promise<Buffer | null> {
  const r = await fal.subscribe(MODELO_PESSOAS, {
    input: {
      image_url: url,
      prompt: nome,
      return_multiple_masks: true,
      include_boxes: true,
      max_masks: 12,
      output_format: "png",
    },
  });
  const d = r.data as {
    masks?: Array<{ url?: string }>;
    /** Caixa de cada máscara: [centro x, centro y, largura, altura], em frações. */
    boxes?: number[][];
  };
  // Candidatas: as pessoas cuja caixa contém o clique, da menor para a maior
  // (com gente sobreposta, a caixa menor costuma ser a de quem está na frente).
  const candidatas = (d.masks ?? [])
    .map((m, i) => ({ url: m.url, caixa: d.boxes?.[i] }))
    .filter((c): c is { url: string; caixa: number[] } => {
      if (!c.url || !c.caixa || c.caixa.length < 4) return false;
      const [cx, cy, w, h] = c.caixa;
      return Math.abs(p.x - cx) <= w / 2 && Math.abs(p.y - cy) <= h / 2;
    })
    .sort((a, b) => a.caixa[2] * a.caixa[3] - b.caixa[2] * b.caixa[3]);
  for (const c of candidatas) {
    const res = await fetch(c.url);
    if (!res.ok) continue;
    // A máscara vem como recorte da pessoa: o que vale é a transparência.
    const alfa = sharp(Buffer.from(await res.arrayBuffer()))
      .ensureAlpha()
      .extractChannel(3)
      .resize(LADO_SILHUETA, LADO_SILHUETA, { fit: "inside" });
    const px = await alfa.clone().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = px.info;
    // O clique tem que cair em cima da pessoa (com uma folga de poucos pixels).
    const x0 = Math.round(p.x * (width - 1));
    const y0 = Math.round(p.y * (height - 1));
    let dentro = false;
    for (let dy = -4; dy <= 4 && !dentro; dy++)
      for (let dx = -4; dx <= 4 && !dentro; dx++) {
        const x = x0 + dx;
        const y = y0 + dy;
        if (x >= 0 && y >= 0 && x < width && y < height)
          dentro = px.data[y * width + x] > 127;
      }
    if (!dentro) continue;
    const pronta = await finalizarSilhueta(alfa);
    if (pronta) return pronta;
  }
  return null;
}

/** Silhueta pelo SAM 2 (fal.ai), a partir do ponto clicado. */
async function silhuetaSam(
  fal: FalClient,
  { url, width, height }: QuadroNoFal,
  p: Pick<PessoaMarcada, "x" | "y">,
): Promise<Buffer | null> {
  const r = await fal.subscribe(MODELO_SILHUETA, {
    input: {
      image_url: url,
      prompts: [
        // A API exige o número 1 (os tipos do cliente dizem "1", que ela recusa).
        {
          x: Math.round(p.x * width),
          y: Math.round(p.y * height),
          label: 1 as unknown as "1",
        },
      ],
      output_format: "png",
    },
  });
  const saida = (r.data as { image?: { url?: string } })?.image?.url;
  if (!saida) return null;
  const res = await fetch(saida);
  if (!res.ok) return null;
  // A máscara vem clara na pessoa e escura (ou transparente) no resto.
  return finalizarSilhueta(
    sharp(Buffer.from(await res.arrayBuffer()))
      .flatten({ background: "#000" })
      .resize(LADO_SILHUETA, LADO_SILHUETA, { fit: "inside" }),
  );
}

/**
 * O clique caiu num animal ou num objeto? Devolve o nome dele em inglês ("dog",
 * "car"), que é o que o SAM 3 procura. Null se for uma pessoa, sem Gemini ou
 * se a leitura falhar — aí a silhueta segue como a de uma pessoa.
 */
async function nomeDaCoisa(
  imagem: Buffer,
  p: Pick<PessoaMarcada, "x" | "y">,
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const marcada = await marcarPonto(imagem, p);
    const res = await new GoogleGenAI({ apiKey }).models.generateContent({
      model: MODELO_VISAO,
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                `A red target marks one thing in this image. ${REGRA_DO_TIPO} ` +
                "If it marks a person, answer exactly: person. Otherwise answer with the common English noun for that animal or object, one or two words, lowercase (dog, car, handbag). No other text.",
            },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: marcada.toString("base64"),
              },
            },
          ],
        },
      ],
    });
    const nome = (res.text ?? "").trim().toLowerCase().replace(/[."]+$/, "");
    return /^[a-z][a-z -]{1,30}$/.test(nome) && nome !== "person" ? nome : null;
  } catch (e) {
    console.warn(
      "[pessoas] não deu para ler o que foi marcado (segue como pessoa):",
      (e as Error).message,
    );
    return null;
  }
}

/**
 * Silhueta do que foi clicado: PNG branco com transparência fora dele, pra
 * tela pintar por cima do quadro. Primeiro procura a pessoa inteira (SAM 3) —
 * ou, se o clique caiu num animal ou objeto, ele inteiro; se nada do que foi
 * achado contém o clique, vale o recorte pelo ponto (SAM 2).
 * Null sem fal ou se nenhum recorte servir — a tela fica só com o ponto.
 */
export async function silhuetaDoAlvo(
  imagem: Buffer,
  p: Pick<PessoaMarcada, "x" | "y">,
  fal: FalClient | null,
): Promise<Buffer | null> {
  if (!fal) return null;
  const base = await sharp(imagem)
    .rotate()
    .resize(1024, 1024, { fit: "inside" })
    .jpeg({ quality: 88 })
    .toBuffer({ resolveWithObject: true });
  const quadro: QuadroNoFal = {
    url: await fal.storage.upload(
      new Blob([new Uint8Array(base.data)], { type: "image/jpeg" }),
    ),
    width: base.info.width,
    height: base.info.height,
  };
  const inteira = (nome: string) =>
    silhuetaInteira(fal, quadro.url, p, nome).catch((e) => {
      console.warn(
        `[pessoas] silhueta inteira ("${nome}") falhou (tenta pelo ponto):`,
        (e as Error).message,
      );
      return null;
    });
  // Ao mesmo tempo, pra não atrasar o caso comum (o clique numa pessoa).
  const [pessoa, coisa] = await Promise.all([
    inteira("person"),
    nomeDaCoisa(imagem, p),
  ]);
  return (
    (coisa ? await inteira(coisa) : null) ??
    pessoa ??
    silhuetaSam(fal, quadro, p)
  );
}

/**
 * Como decidir o que o alvo vermelho marca. O que a pessoa veste conta como a
 * pessoa (um clique na camiseta é a pessoa); o que ela segura é um objeto.
 */
const REGRA_DO_TIPO =
  "A target on someone's body, hair or clothes marks that PERSON; a target on a thing they hold or use (a bottle, a bag, a phone) marks that OBJECT.";

const TIPOS: Record<string, TipoAlvo> = {
  person: "pessoa",
  animal: "animal",
  object: "objeto",
};

/**
 * Descreve o que foi marcado numa imagem (inglês, curto) e diz se é pessoa,
 * animal ou objeto. Sem Gemini ou se falhar, usa a posição (como pessoa).
 */
async function descreverUma(
  imagem: () => Promise<Buffer>,
  p: Pick<PessoaMarcada, "x" | "y">,
  origem: "video" | "foto",
): Promise<AlvoDescrito> {
  const reserva: AlvoDescrito = {
    descricao: posicaoEmPalavras(p),
    tipo: "pessoa",
  };
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return reserva;
  try {
    const marcada = await marcarPonto(await imagem(), p);
    const ai = new GoogleGenAI({ apiKey });
    const noVideo = origem === "video";
    const onde = noVideo ? "This is a frame from a video." : "This is a photo.";
    const resto = noVideo
      ? "everyone and everything else in the video"
      : "everyone and everything else in the photo";
    // No vídeo a pessoa anda, vira e sai do quadro: posição e pose valem só para
    // aquele instante e fazem o modelo de vídeo perder a pessoa no resto.
    const pessoa = noVideo
      ? "gender, build, hair, accessories, clothing (colours and pieces) — only what stays the same during the whole video. " +
        "Do NOT mention position in the frame, pose, action or facial expression. "
      : "position in the frame (left/center/right, foreground/background), pose, clothing (colours and pieces), hair. ";
    const coisa = noVideo
      ? "what it is (kind or breed, type of object), colours, size, distinctive marks or parts — only what stays the same during the whole video. " +
        "Do NOT mention position in the frame, pose or action. "
      : "what it is (kind or breed, type of object), colours, distinctive marks, position in the frame (left/center/right, foreground/background). ";
    const res = await ai.models.generateContent({
      model: MODELO_VISAO,
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                `${onde} A red target marks ONE subject: a person, an animal or an object. ${REGRA_DO_TIPO} ` +
                `Describe only that subject so it can be told apart from ${resto}. ` +
                `For a person: ${pessoa}` +
                `For an animal or an object: ${coisa}` +
                'Answer with JSON only: {"kind": "person" | "animal" | "object", "description": "the ... (English, one line, max 30 words)"}',
            },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: marcada.toString("base64"),
              },
            },
          ],
        },
      ],
    });
    const json = (res.text ?? "").match(/\{[\s\S]*\}/)?.[0];
    const r = json
      ? (JSON.parse(json) as { kind?: unknown; description?: unknown })
      : {};
    const texto = (typeof r.description === "string" ? r.description : "")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[."]+$/, "");
    return texto.length > 8
      ? {
          descricao: texto.slice(0, 220),
          tipo: TIPOS[String(r.kind).toLowerCase()] ?? "pessoa",
        }
      : reserva;
  } catch (e) {
    console.warn(
      "[pessoas] descrição falhou, usando a posição:",
      (e as Error).message,
    );
    return reserva;
  }
}

/** Descreve cada pessoa (ou animal, ou objeto) marcada no vídeo, no quadro em que foi marcada. */
export async function descreverPessoas(
  arquivo: string,
  pessoas: PessoaMarcada[],
  dir: string,
): Promise<AlvoDescrito[]> {
  return Promise.all(
    pessoas.map((p, i) =>
      descreverUma(
        async () => {
          const saida = path.join(dir, `pessoa-${i}.jpg`);
          await extrairQuadroMarcado(arquivo, p.t, saida);
          return readFile(saida);
        },
        p,
        "video",
      ),
    ),
  );
}

/** Descreve cada pessoa (ou animal, ou objeto) marcada numa foto. */
export async function descreverPessoasNaFoto(
  foto: Buffer,
  pessoas: Array<Pick<PessoaMarcada, "x" | "y">>,
): Promise<AlvoDescrito[]> {
  return Promise.all(
    pessoas.map((p) => descreverUma(async () => foto, p, "foto")),
  );
}

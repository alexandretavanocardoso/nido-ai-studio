import type { FalClient } from "@fal-ai/client";
import sharp from "sharp";

/**
 * Figurinhas do personagem para o WhatsApp. O formato que o WhatsApp aceita
 * para figurinha parada: WebP quadrado de 512×512, fundo transparente, até
 * 100 KB. A imagem vem do gerador (sobre fundo branco liso), o fundo é
 * removido e ela ganha o contorno branco de figurinha.
 */
export const LADO_FIGURINHA = 512;
export const FIGURINHA_MAX_BYTES = 100 * 1024;
/** Espaço em volta da figura para o contorno não encostar na borda. */
const MARGEM = 16;
const CONTORNO = 7;
const MODELO_RECORTE = "fal-ai/birefnet/v2";

/** Pedido ao gerador: o personagem numa situação, com cara de figurinha. */
export function promptFigurinha(cena: string): string {
  return [
    "Create a WhatsApp-style sticker of the character shown in the reference image.",
    `What the sticker shows: ${cena}`,
    "Keep the character recognisable: same face, hair, skin tone, outfit and accessories as the reference, in the same visual style as the reference.",
    "Sticker framing: one single character, from the waist up (or full body if the action needs it), centred, large in the frame, with an exaggerated, easy-to-read expression and gesture.",
    "Background: plain, flat, pure white (#FFFFFF) everywhere, with nothing else in it — no scenery, no shadow on the ground, no frame, no border, no text, no speech bubble.",
    "The character must be fully inside the image, not cropped by the edges.",
  ].join("\n");
}

/** Complemento do pedido de troca quando a figurinha é um quadro inteiro, com cenário. */
export const REGRAS_DA_FIGURINHA_INTEIRA = [
  "",
  "IMAGE 1 IS A STICKER MADE FROM A PHOTO OR VIDEO FRAME",
  "Keep the whole frame: the same background, crowd, objects, framing, pose, gesture and facial expression. Only the listed person becomes the character.",
].join("\n");

/** Complemento do pedido de troca quando a "foto" é uma figurinha pronta (recortada). */
export const REGRAS_DA_FIGURINHA_TROCADA = [
  "",
  "IMAGE 1 IS A STICKER",
  "Keep everything that makes it this sticker: the same drawing style, pose, gesture, facial expression, props and any text or speech bubble, in the same place and size.",
  "Background: plain, flat, pure white (#FFFFFF) everywhere, with nothing else in it. No border and no frame around the sticker.",
].join("\n");

/**
 * Tira o fundo branco pelas bordas: tudo que é quase branco e está ligado à
 * borda vira transparente (o branco de dentro da figura — olhos, camisa —
 * fica). É o plano B, sem depender de serviço externo.
 */
export async function recortarFundoBranco(imagem: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(imagem)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const claro = (i: number) =>
    data[i * 4] > 236 && data[i * 4 + 1] > 236 && data[i * 4 + 2] > 236;
  const visto = new Uint8Array(w * h);
  const fila: number[] = [];
  const entrar = (i: number) => {
    if (!visto[i] && claro(i)) {
      visto[i] = 1;
      fila.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    entrar(x);
    entrar((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    entrar(y * w);
    entrar(y * w + w - 1);
  }
  while (fila.length) {
    const i = fila.pop()!;
    data[i * 4 + 3] = 0;
    const x = i % w;
    if (x > 0) entrar(i - 1);
    if (x < w - 1) entrar(i + 1);
    if (i >= w) entrar(i - w);
    if (i < w * (h - 1)) entrar(i + w);
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer();
}

/**
 * Remove o fundo: recorte por IA (fal, mais limpo em cabelo e bordas) e, se
 * ele não estiver disponível ou falhar, o recorte do fundo branco.
 */
export async function recortarFigura(
  fal: FalClient | null,
  imagem: Buffer,
): Promise<Buffer> {
  if (fal) {
    try {
      const url = await fal.storage.upload(
        new Blob([new Uint8Array(imagem)], { type: "image/jpeg" }),
      );
      const r = await fal.subscribe(MODELO_RECORTE, {
        input: {
          image_url: url,
          model: "General Use (Heavy)",
          output_format: "png",
        },
      });
      const saida = (r.data as { image?: { url?: string } })?.image?.url;
      if (saida) return Buffer.from(await (await fetch(saida)).arrayBuffer());
    } catch (e) {
      console.warn(
        "[figurinha] recorte por IA falhou, usando o do fundo branco:",
        (e as Error).message,
      );
    }
  }
  return recortarFundoBranco(imagem);
}

/**
 * Figura recortada (PNG com transparência) → figurinha: enquadra em 512×512,
 * põe o contorno branco e comprime em WebP até caber no limite do WhatsApp.
 */
export async function montarFigurinha(recorte: Buffer): Promise<Buffer> {
  const util = LADO_FIGURINHA - 2 * MARGEM;
  // Tira a sobra transparente e encaixa a figura na área útil.
  const figura = await sharp(recorte)
    .ensureAlpha()
    .trim({ threshold: 8 })
    .resize(util, util, {
      fit: "inside",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const base = await sharp({
    create: {
      width: LADO_FIGURINHA,
      height: LADO_FIGURINHA,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: figura, gravity: "centre" }])
    .png()
    .toBuffer();

  // Contorno: a silhueta engordada (desfoque + corte), pintada de branco, por baixo.
  // Em dois passos: o sharp aplica as operações numa ordem fixa, e aqui o
  // corte (threshold) tem que vir DEPOIS do desfoque.
  const borrada = await sharp(base)
    .extractChannel("alpha")
    .blur(CONTORNO)
    .png()
    .toBuffer();
  const silhueta = await sharp(
    await sharp(borrada).threshold(24).png().toBuffer(),
  )
    // um toque de desfoque para a borda do contorno não ficar serrilhada
    .blur(0.8)
    .extractChannel(0)
    .toBuffer();
  const contorno = await sharp({
    create: {
      width: LADO_FIGURINHA,
      height: LADO_FIGURINHA,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .joinChannel(silhueta)
    .png()
    .toBuffer();
  const pronta = await sharp(contorno)
    .composite([{ input: base }])
    .png()
    .toBuffer();

  let webp = pronta;
  for (const quality of [90, 80, 70, 60, 50, 40, 30]) {
    webp = await sharp(pronta).webp({ quality, alphaQuality: 90 }).toBuffer();
    if (webp.length <= FIGURINHA_MAX_BYTES) break;
  }
  return webp;
}

/**
 * A figurinha original é recortada (tem fundo transparente) ou é um quadro
 * inteiro, com cenário (como as feitas de foto ou de vídeo)? Olha os quatro
 * cantos: recortada tem canto transparente.
 */
export async function figurinhaTemFundo(imagem: Buffer): Promise<boolean> {
  const { data, info } = await sharp(imagem)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const alfa = (x: number, y: number) => data[(y * w + x) * 4 + 3];
  return [alfa(1, 1), alfa(w - 2, 1), alfa(1, h - 2), alfa(w - 2, h - 2)].every(
    (a) => a > 245,
  );
}

/**
 * Figurinha de quadro inteiro (com o cenário): só ajusta para 512×512 e
 * comprime — sem recorte e sem contorno, como a original.
 */
export async function montarFigurinhaInteira(imagem: Buffer): Promise<Buffer> {
  const base = await sharp(imagem)
    .resize(LADO_FIGURINHA, LADO_FIGURINHA, { fit: "cover" })
    .png()
    .toBuffer();
  let webp = base;
  for (const quality of [88, 78, 68, 58, 48, 38, 28]) {
    webp = await sharp(base).webp({ quality }).toBuffer();
    if (webp.length <= FIGURINHA_MAX_BYTES) break;
  }
  return webp;
}

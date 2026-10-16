import type { S3Client } from "@aws-sdk/client-s3";
import type { Pool } from "@neondatabase/serverless";
import { ApiError } from "@fal-ai/client";
import { nanoid } from "nanoid";
import { generateImage, shrinkReferencia } from "@/lib/ai/gemini";
import { estornarSeHouver, type Cobranca } from "@/lib/creditos";
import { getFal, mensagemDeErro } from "@/lib/fal";
import { getObjectBuffer, newKey, presignGet, putObject } from "@/lib/storage/s3";

/**
 * Sombra 3D no servidor: monta o avatar 3D do influencer a partir de uma foto.
 *  1. O Nano Banana faz a versão desenho (personagem de animação 3D), de
 *     frente, do topo da cabeça à cintura, boca fechada e olhos abertos — é
 *     isso que deixa o avatar com a cara do influencer.
 *  2. O fal (Trellis 2) transforma essa imagem num modelo 3D com textura (.glb).
 * O resto (esqueleto, rosto que pisca e fala, rastreio da webcam) é feito no
 * navegador, sem IA por minuto (components/live/avatar3d). A mesma foto
 * reaproveita o avatar.
 */
export const MODELO_3D = "fal-ai/trellis-2";

/** Mais que isso gerando, o pedido no fal se perdeu: falha e devolve os créditos. */
const PRAZO_MS = 20 * 60 * 1000;

export type StatusAvatar3d = "gerando" | "pronto" | "erro";

export interface Avatar3dRow {
  id: string;
  user_id: string;
  image_key: string;
  status: StatusAvatar3d;
  estilizada_key: string | null;
  fal_request_id: string | null;
  modelo_key: string | null;
  cobranca: Cobranca | null;
  erro: string | null;
  created_at: Date;
  pronto_em: Date | null;
}

/**
 * O pedido da versão desenho. De frente e simétrico, sem nada nas mãos e com
 * fundo liso: o modelo 3D sai mais limpo. Do topo da cabeça à cintura (sem
 * pernas), para o rosto ganhar mais detalhe. Óculos escuros vão para a cabeça:
 * os olhos precisam aparecer para piscar.
 */
export const PEDIDO_ESTILO = [
  "Turn the person in this photo into a stylized 3D animated character, like a character from a modern 3D animated film or a high-quality video game render.",
  "Keep them clearly recognisable: same face shape, eye colour, eyebrows, nose, facial hair, skin tone, age, hairstyle and hair colour, same outfit and accessories.",
  "If they wear sunglasses, push the sunglasses up onto the head so both eyes are fully visible.",
  "Pose: standing straight, body and head facing the camera directly, symmetrical. Half-body framing: from the top of the head down to the waist only, no legs, centred, with some space above the head. Arms relaxed straight down along the sides of the body, empty hands, holding nothing.",
  "Expression: neutral and calm, mouth closed, lips relaxed, both eyes wide open looking straight into the camera.",
  "Lighting: soft, even, flat studio light from the front, no strong shadows, no rim light.",
  "Background: plain solid light grey. Only the character, nothing else in the image. No text, no logos.",
].join("\n");

/** Entrada do Trellis 2: ~80 mil vértices (leve para o navegador) e textura 2048. */
export const entradaModelo3d = (imageUrl: string) => ({
  image_url: imageUrl,
  decimation_target: 80_000,
  texture_size: "2048" as const,
});

/** Avatar desta foto que ainda serve (pronto ou gerando): outra live com a mesma foto não paga de novo. */
export async function avatar3dDaFoto(
  pool: Pool,
  userId: string,
  imageKey: string,
): Promise<Avatar3dRow | null> {
  const { rows } = await pool.query<Avatar3dRow>(
    `select * from avatares_3d where user_id = $1 and image_key = $2 and status <> 'erro'
      order by created_at desc limit 1`,
    [userId, imageKey],
  );
  return rows[0] ?? null;
}

export async function carregarAvatar3d(pool: Pool, id: string): Promise<Avatar3dRow | null> {
  const { rows } = await pool.query<Avatar3dRow>("select * from avatares_3d where id = $1", [id]);
  return rows[0] ?? null;
}

/**
 * Monta um avatar novo: a versão desenho (Nano Banana) e o pedido do modelo
 * 3D no fal. Devolve o avatar "gerando"; o modelo fica pronto em 1 a 3 min
 * (avancarAvatar3d). Quem chama cobra antes e devolve se isto falhar.
 */
export async function criarAvatar3d(
  pool: Pool,
  s3: S3Client,
  o: { userId: string; imageKey: string; cobranca: Cobranca | null },
): Promise<Avatar3dRow> {
  const fal = getFal();
  if (!fal) throw new Error("Modelo 3D não configurado no servidor (FAL_KEY).");
  const foto = await shrinkReferencia(await getObjectBuffer(s3, o.imageKey));
  const desenho = await generateImage({
    prompt: PEDIDO_ESTILO,
    referencias: [foto],
    aspectRatio: "1:1",
    imageSize: "1K",
    qualidade: "padrao",
  });
  const estilizadaKey = newKey(o.userId, "refs", "image/jpeg");
  await putObject(s3, estilizadaKey, desenho, "image/jpeg");
  const { request_id } = await fal.queue.submit(MODELO_3D, {
    input: entradaModelo3d(await presignGet(s3, estilizadaKey, 86_400)),
  });
  const { rows } = await pool.query<Avatar3dRow>(
    `insert into avatares_3d (id, user_id, image_key, status, estilizada_key, fal_request_id, cobranca)
     values ($1, $2, $3, 'gerando', $4, $5, $6) returning *`,
    [nanoid(12), o.userId, o.imageKey, estilizadaKey, request_id, o.cobranca ? JSON.stringify(o.cobranca) : null],
  );
  return rows[0];
}

/** Marca o avatar com erro e devolve os créditos (só quem muda o status devolve). */
async function falhar(pool: Pool, a: Avatar3dRow, mensagem: string): Promise<Avatar3dRow> {
  const { rows } = await pool.query<Avatar3dRow>(
    `update avatares_3d set status = 'erro', erro = $2 where id = $1 and status = 'gerando' returning *`,
    [a.id, mensagem],
  );
  if (!rows[0]) return (await carregarAvatar3d(pool, a.id)) ?? a;
  await estornarSeHouver(a.cobranca);
  return rows[0];
}

/**
 * Confere o pedido no fal. Pronto: baixa o .glb para o S3 (o endereço do fal
 * expira) e marca "pronto". Falhou ou passou do prazo: "erro", com os
 * créditos de volta. Falha de rede ao consultar: tenta de novo na próxima.
 */
export async function avancarAvatar3d(pool: Pool, s3: S3Client, a: Avatar3dRow): Promise<Avatar3dRow> {
  if (a.status !== "gerando" || !a.fal_request_id) return a;
  if (Date.now() - new Date(a.created_at).getTime() > PRAZO_MS)
    return falhar(pool, a, "O modelo 3D demorou demais. Tente de novo.");
  const fal = getFal();
  if (!fal) return a;
  try {
    const st = await fal.queue.status(MODELO_3D, { requestId: a.fal_request_id });
    if (st.status === "IN_QUEUE" || st.status === "IN_PROGRESS") return a;
    const r = await fal.queue.result(MODELO_3D, { requestId: a.fal_request_id });
    const url = (r.data as { model_glb?: { url?: string } } | null)?.model_glb?.url;
    if (!url) return falhar(pool, a, "O fal não devolveu o modelo 3D.");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download do modelo 3D: HTTP ${res.status}`);
    const glb = Buffer.from(await res.arrayBuffer());
    const key = newKey(a.user_id, "modelos", "model/gltf-binary");
    await putObject(s3, key, glb, "model/gltf-binary");
    const { rows } = await pool.query<Avatar3dRow>(
      `update avatares_3d set status = 'pronto', modelo_key = $2, pronto_em = now()
        where id = $1 and status = 'gerando' returning *`,
      [a.id, key],
    );
    return rows[0] ?? (await carregarAvatar3d(pool, a.id)) ?? a;
  } catch (e) {
    // O fal recusou ou o pedido falhou lá: não adianta esperar.
    if (e instanceof ApiError) return falhar(pool, a, mensagemDeErro(e));
    console.warn("[avatar3d]", a.id, (e as Error).message);
    return a;
  }
}

/**
 * Fundo da Sombra 3D descrito em texto: uma imagem do lugar, no mesmo estilo
 * de animação do avatar, sem pessoas e com o centro livre (o avatar fica ali).
 */
export const pedidoFundo3d = (lugar: string) =>
  [
    "A wide 16:9 background plate for a livestream, in the art style of a modern 3D animated film: soft lighting, rich colours, slightly blurred depth of field.",
    `The place, as described by the streamer (any language): «${lugar}».`,
    "The camera is at eye level. Keep the centre of the frame uncluttered: a character will stand in front of it.",
    "No people, no characters, no animals in the foreground, no text, no logos, no watermarks.",
  ].join("\n");

export async function gerarFundo3d(s3: S3Client, userId: string, lugar: string): Promise<string> {
  const img = await generateImage({
    prompt: pedidoFundo3d(lugar),
    referencias: [],
    aspectRatio: "16:9",
    imageSize: "1K",
    qualidade: "padrao",
  });
  const key = newKey(userId, "refs", "image/jpeg");
  await putObject(s3, key, img, "image/jpeg");
  return key;
}

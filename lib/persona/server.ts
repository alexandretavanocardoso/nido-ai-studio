import JSZip from "jszip";
import type { FalClient } from "@fal-ai/client";
import type { S3Client } from "@aws-sdk/client-s3";
import { getPool } from "@/lib/db";
import { mensagemDeErro } from "@/lib/fal";
import { getObjectBuffer } from "@/lib/storage/s3";
import { webhookUrl } from "@/lib/video/webhook";

/**
 * Persona treinada: um LoRA por personagem, treinado no fal.ai a partir das
 * imagens aprovadas do conjunto de treino. Dois treinadores (coluna `alvo`):
 *  - flux1 ("Rápido") → FLUX LoRA Fast Training (FLUX.1, ~US$ 2). Gera com fal-ai/flux-lora.
 *  - flux  ("Pro")    → FLUX.2 [dev] Trainer (~US$ 6,40). Gera com fal-ai/flux-2/lora(/edit).
 * Vale o último treino pronto (de qualquer um dos dois). Vídeo com a persona =
 * imagem gerada com ela como primeiro quadro em "Criar vídeo".
 * O modelo pronto fica na tabela personas_treino (a geração busca de lá).
 */
export type AlvoTreino = "flux1" | "flux";
export type TreinadorPersona = "rapido" | "pro";

export const ALVO_DO_TREINADOR: Record<TreinadorPersona, AlvoTreino> = { rapido: "flux1", pro: "flux" };

export const MODELOS_TREINO: Record<AlvoTreino, string> = {
  flux1: "fal-ai/flux-lora-fast-training",
  flux: "fal-ai/flux-2-trainer",
};

export { DECLARACAO_TREINO } from "@/lib/declaracoes";

/** Palavra-gatilho única: nome do personagem + sufixo (ex.: "lila_nd7k"). */
export function gerarGatilho(nome: string, aleatorio = Math.random()): string {
  const base =
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 12) || "persona";
  const sufixo = Math.floor(aleatorio * 36 ** 3)
    .toString(36)
    .padStart(3, "0");
  return `${base}_nd${sufixo}`;
}

/** ZIP de treino: cada imagem com um .txt de legenda contendo a palavra-gatilho. */
export async function montarZipTreino(s3: S3Client, keys: string[], gatilho: string): Promise<Buffer> {
  const zip = new JSZip();
  const imagens = await Promise.all(keys.map((k) => getObjectBuffer(s3, k)));
  imagens.forEach((buf, i) => {
    const nome = `img_${String(i + 1).padStart(3, "0")}`;
    zip.file(`${nome}.jpg`, buf);
    zip.file(`${nome}.txt`, `a photo of ${gatilho}`);
  });
  return zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
}

/** Envia o treino ao fal (com webhook do job). Devolve o request_id. */
export async function iniciarTreino(
  fal: FalClient,
  o: { alvo: AlvoTreino; zipUrl: string; gatilho: string; jobId: string },
): Promise<string> {
  const input =
    o.alvo === "flux"
      ? { image_data_url: o.zipUrl, steps: 1000, default_caption: `a photo of ${o.gatilho}` }
      : // As legendas do ZIP já levam o gatilho; as máscaras focam o treino no personagem.
        { images_data_url: o.zipUrl, trigger_word: o.gatilho, steps: 1000, create_masks: true, is_style: false };
  const { request_id } = await fal.queue.submit(MODELOS_TREINO[o.alvo], { input, webhookUrl: webhookUrl(o.jobId) });
  return request_id;
}

export type EstadoTreino =
  | { estado: "na_fila" | "processando" }
  | { estado: "concluido"; principal: string }
  | { estado: "erro"; mensagem: string };

/** Estado do treino no fal; pronto → URLs dos arquivos do LoRA. */
export async function estadoTreino(fal: FalClient, modelo: string, requestId: string): Promise<EstadoTreino> {
  const st = await fal.queue.status(modelo, { requestId });
  if (st.status === "IN_QUEUE") return { estado: "na_fila" };
  if (st.status === "IN_PROGRESS") return { estado: "processando" };
  try {
    const r = await fal.queue.result(modelo, { requestId });
    const d = r.data as { diffusers_lora_file?: { url?: string } };
    const principal = d?.diffusers_lora_file?.url;
    if (!principal) return { estado: "erro", mensagem: "O treino não devolveu o modelo." };
    return { estado: "concluido", principal };
  } catch (e) {
    return { estado: "erro", mensagem: mensagemDeErro(e) };
  }
}

export interface PersonaPronta {
  id: string;
  alvo: AlvoTreino;
  gatilho: string;
  key: string;
}

const ALVOS = Object.keys(MODELOS_TREINO);

/** Último modelo pronto do personagem (qualquer treinador). */
export async function personaPronta(userId: string, characterId: string): Promise<PersonaPronta | null> {
  const { rows } = await getPool()!.query<{ id: string; alvo: AlvoTreino; gatilho: string; key: string }>(
    `select id, alvo, gatilho, key from personas_treino
     where user_id = $1 and character_id = $2 and alvo = any($3) and status = 'pronto' and key is not null
     order by created_at desc limit 1`,
    [userId, characterId, ALVOS],
  );
  return rows[0] ?? null;
}

/** Treinos grátis usados no mês (plano Studio). */
export async function treinosGratisNoMes(userId: string): Promise<number> {
  const { rows } = await getPool()!.query<{ n: number }>(
    `select count(*)::int as n from personas_treino
     where user_id = $1 and gratis and status <> 'erro' and created_at >= date_trunc('month', now())`,
    [userId],
  );
  return rows[0]?.n ?? 0;
}

export interface StatusAlvo {
  status: "treinando" | "pronto" | "erro";
  treinador: TreinadorPersona;
  jobId: string;
  gatilho: string;
  imagens: number;
  erro: string | null;
  em: string;
  /** Há um modelo pronto anterior (útil enquanto um re-treino roda ou se ele falhar). */
  temPronto: boolean;
}

/** Situação da persona do personagem (último treino, de qualquer treinador). */
export async function statusPersona(userId: string, characterId: string): Promise<StatusAlvo | null> {
  const { rows } = await getPool()!.query<{
    id: string;
    alvo: AlvoTreino;
    status: StatusAlvo["status"];
    gatilho: string;
    imagens: number;
    error: string | null;
    created_at: Date;
    tem_pronto: boolean;
  }>(
    `select id, alvo, status, gatilho, imagens, error, created_at,
            exists (select 1 from personas_treino p2 where p2.user_id = p.user_id and p2.character_id = p.character_id
                      and p2.alvo = any($3) and p2.status = 'pronto') as tem_pronto
     from personas_treino p where user_id = $1 and character_id = $2 and alvo = any($3)
     order by created_at desc limit 1`,
    [userId, characterId, ALVOS],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    status: r.status,
    treinador: r.alvo === "flux" ? "pro" : "rapido",
    jobId: r.id,
    gatilho: r.gatilho,
    imagens: r.imagens,
    erro: r.error,
    em: r.created_at.toISOString(),
    temPronto: r.tem_pronto,
  };
}

import { createDecartClient, models } from "@decartai/sdk";
import type { EstadoVideo } from "@/lib/video/jobs";
import type { CenaLucy } from "./cena";

/**
 * Decart Lucy 2.5: troca a pessoa de um vídeo pelo influencer de uma foto,
 * mantendo movimento, expressão e boca.
 *  - Tempo real (Shadow ao vivo): o navegador liga a webcam direto na Decart
 *    com um token curto que o servidor gera aqui (a chave não sai do servidor).
 *  - Em lote (Shadow de vídeo gravado): o servidor manda o vídeo e a foto e
 *    acompanha o job, como os outros vídeos (lib/video/finalizar.ts).
 * Chave em DECART_API_KEY.
 */
export const MODELO_SOMBRA = "lucy-2.5";

let cliente: ReturnType<typeof createDecartClient> | null = null;

export function getDecart(): ReturnType<typeof createDecartClient> | null {
  const apiKey = process.env.DECART_API_KEY?.trim();
  if (!apiKey) return null;
  if (!cliente) cliente = createDecartClient({ apiKey });
  return cliente;
}

/**
 * Pedido do Lucy: trocar a pessoa pela da foto e, se houver cenário, o fundo
 * (e um item na pessoa, como um fone). Nessa ordem e curto: com o fundo antes,
 * ou um pedido longo, o Lucy deixa o fundo como está; sem "including their
 * clothes", sobra roupa do original. O cenário chega já reescrito em inglês
 * (cenaParaLucy).
 */
export function pedidoDaSombra(cena?: CenaLucy | null): string {
  return [
    "Replace the person in the video, including their clothes, with the person from the reference image, keeping the same pose, head movement, facial expression and mouth movement.",
    cena?.fundo ? `Change the background to ${cena.fundo}.` : "",
    cena?.item ? `The person is wearing ${cena.item}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Token curto para o navegador abrir a sessão em tempo real: só o Lucy 2.5,
 * só do endereço do app (quando conhecido) e no máximo a duração da live.
 */
export async function tokenTempoReal(o: {
  segundos: number;
  origem?: string | null;
}): Promise<{ apiKey: string; expiraEm: string }> {
  const d = getDecart();
  if (!d) throw new Error("DECART_API_KEY não configurada.");
  const duracao = Math.min(3600, Math.max(60, Math.ceil(o.segundos)));
  const t = await d.tokens.create({
    expiresIn: 3600,
    allowedModels: [MODELO_SOMBRA],
    ...(o.origem ? { allowedOrigins: [o.origem] } : {}),
    constraints: { realtime: { maxSessionDuration: duracao } },
  });
  return { apiKey: t.apiKey, expiraEm: t.expiresAt };
}

/** Manda um vídeo para o Lucy em lote. Devolve o id do job na Decart. */
export async function enviarSombraVideo(o: {
  videoUrl: string;
  imagemUrl: string;
  cena?: CenaLucy | null;
}): Promise<string> {
  const d = getDecart();
  if (!d) throw new Error("DECART_API_KEY não configurada.");
  const r = await d.queue.submit({
    model: models.video(MODELO_SOMBRA),
    prompt: pedidoDaSombra(o.cena),
    data: o.videoUrl,
    reference_image: o.imagemUrl,
  });
  return r.job_id;
}

/**
 * Estado do job na Decart, no formato dos outros serviços. O vídeo pronto não
 * tem endereço público: vai como "decart:<id>" e é baixado com a chave
 * (baixarResultadoDecart).
 */
export async function consultarDecart(jobId: string): Promise<EstadoVideo> {
  const d = getDecart();
  if (!d) return { estado: "erro", mensagem: "Decart não configurada no servidor (DECART_API_KEY)." };
  try {
    const s = await d.queue.status(jobId);
    if (s.status === "pending") return { estado: "na_fila" };
    if (s.status === "processing") return { estado: "processando" };
    if (s.status === "completed") return { estado: "concluido", videoUrl: `decart:${jobId}` };
    return { estado: "erro", mensagem: "A Decart não conseguiu trocar a pessoa neste vídeo." };
  } catch (e) {
    // Falha passageira: segue "processando" e a próxima consulta tenta de novo.
    console.warn("[decart] status", jobId, (e as Error).message);
    return { estado: "processando" };
  }
}

export const ehResultadoDecart = (url: string) => url.startsWith("decart:");

/** Baixa o vídeo pronto de um job ("decart:<id>"). */
export async function baixarResultadoDecart(url: string): Promise<Buffer> {
  const d = getDecart();
  if (!d) throw new Error("DECART_API_KEY não configurada.");
  const blob = await d.queue.result(url.slice("decart:".length));
  return Buffer.from(await blob.arrayBuffer());
}

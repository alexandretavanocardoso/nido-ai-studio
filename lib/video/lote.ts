import type { FalClient } from "@fal-ai/client";
import { mensagemDeErro } from "@/lib/fal";

/**
 * Jobs em lote no fal: um vídeo dividido em trechos, cada trecho é um pedido
 * na fila. O job só termina quando todos terminam; qualquer falha derruba tudo.
 */
export interface Segmento {
  /** Pedido na fila do fal. Vazio quando o trecho já está pronto (`urlPronta`). */
  requestId: string;
  inicio: number;
  duracao: number;
  /**
   * Trecho que não passa pelo motor (uma tomada em que ninguém a trocar
   * aparece): o próprio original, já no storage do fal, entra direto na montagem.
   */
  urlPronta?: string;
}

export type EstadoLote =
  | { estado: "na_fila" | "processando"; progresso?: number }
  | { estado: "concluido"; urls: string[] }
  | { estado: "erro"; mensagem: string };

export async function estadoLote(
  fal: FalClient,
  modelo: string,
  segmentos: Segmento[],
): Promise<EstadoLote> {
  const status = await Promise.all(
    segmentos.map((s) =>
      s.urlPronta
        ? { status: "COMPLETED" as const }
        : fal.queue.status(modelo, { requestId: s.requestId }),
    ),
  );
  const prontos = status.filter((s) => s.status === "COMPLETED").length;
  if (prontos < segmentos.length) {
    return status.some((s) => s.status === "IN_PROGRESS") || prontos > 0
      ? { estado: "processando", progresso: prontos / segmentos.length }
      : { estado: "na_fila" };
  }
  try {
    const urls = await Promise.all(
      segmentos.map(async (s) => {
        if (s.urlPronta) return s.urlPronta;
        const r = await fal.queue.result(modelo, { requestId: s.requestId });
        const url = (r.data as { video?: { url?: string } })?.video?.url;
        if (!url) throw new Error("A IA não devolveu um dos trechos.");
        return url;
      }),
    );
    return { estado: "concluido", urls };
  } catch (e) {
    return { estado: "erro", mensagem: mensagemDeErro(e) };
  }
}

/** Baixa cada URL para um arquivo local (na ordem). */
export async function baixarTrechos(
  urls: string[],
  dir: string,
  prefixo: string,
): Promise<string[]> {
  const { writeFile } = await import("node:fs/promises");
  const path = await import("node:path");
  return Promise.all(
    urls.map(async (url, i) => {
      const res = await fetch(url);
      if (!res.ok)
        throw new Error(
          `download do trecho ${i + 1} falhou (HTTP ${res.status})`,
        );
      const arquivo = path.join(dir, `${prefixo}-${i}.mp4`);
      await writeFile(arquivo, Buffer.from(await res.arrayBuffer()));
      return arquivo;
    }),
  );
}

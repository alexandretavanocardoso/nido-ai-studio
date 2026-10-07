import type { FalClient } from "@fal-ai/client";
import type { EstadoVideo } from "./jobs";

/** Jobs de vídeo de um pedido só no fal (a troca de pessoa em trechos fica em ./kling). */
export { getFal, mensagemDeErro } from "@/lib/fal";
import { mensagemDeErro } from "@/lib/fal";


/** Consulta o job no fal; quando termina, devolve a URL do vídeo gerado. */
export async function consultar(fal: FalClient, modelo: string, requestId: string): Promise<EstadoVideo> {
  const st = await fal.queue.status(modelo, { requestId });
  if (st.status === "IN_QUEUE") return { estado: "na_fila", posicao: st.queue_position };
  if (st.status === "IN_PROGRESS") return { estado: "processando" };
  try {
    const res = await fal.queue.result(modelo, { requestId });
    const url = (res.data as { video?: { url?: string } })?.video?.url;
    return url ? { estado: "concluido", videoUrl: url } : { estado: "erro", mensagem: "O fal não devolveu vídeo." };
  } catch (e) {
    return { estado: "erro", mensagem: mensagemDeErro(e) };
  }
}

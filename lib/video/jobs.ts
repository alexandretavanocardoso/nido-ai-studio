import { consultar as consultarFal, getFal } from "./fal";
import { consultarRunway, getRunway } from "./runway";

/** Estado de um job de vídeo, igual para qualquer serviço. */
export type EstadoVideo =
  | { estado: "na_fila"; posicao?: number }
  | { estado: "processando"; progresso?: number }
  | { estado: "concluido"; videoUrl: string }
  | { estado: "erro"; mensagem: string };

export type Provedor = "fal" | "runway";

/** Consulta o job no serviço que o processa (coluna `provedor` de video_jobs). */
export async function consultarJob(provedor: Provedor, modelo: string, idExterno: string): Promise<EstadoVideo> {
  if (provedor === "runway") {
    const rw = getRunway();
    if (!rw) return { estado: "erro", mensagem: "Runway não configurado no servidor." };
    return consultarRunway(rw, idExterno);
  }
  const fal = getFal();
  if (!fal) return { estado: "erro", mensagem: "fal.ai não configurado no servidor." };
  return consultarFal(fal, modelo, idExterno);
}

import { nanoid } from "nanoid";
import type { Character } from "./types";
import { hydrate } from "./defaults";

/**
 * Importar um personagem exportado pelo próprio app (Exportar ficha → Dados
 * (JSON)). Sempre entra como personagem novo (id novo) — nunca sobrescreve
 * um existente. Imagens e vídeos no S3 só abrem na mesma conta que os criou.
 */
export type ResultadoImportacao = { ok: true; character: Character } | { ok: false; erro: string };

export function lerPersonagemExportado(texto: string): ResultadoImportacao {
  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch {
    return { ok: false, erro: "O arquivo não é um JSON válido." };
  }
  const c = dados as Partial<Character> | null;
  if (!c || typeof c !== "object" || typeof c.identidade !== "object" || typeof c.visual !== "object" || !c.identidade || !c.visual)
    return {
      ok: false,
      erro: "Este arquivo não é um personagem do NIDO Studio. Use o JSON de “Exportar ficha → Dados (JSON)”.",
    };
  const agora = Date.now();
  const personagem = hydrate({
    ...(c as Character),
    id: nanoid(10),
    createdAt: agora,
    updatedAt: agora,
    visual: { ...(c.visual as Character["visual"]), referencias: c.visual.referencias ?? [] },
    // Jobs de vídeo em andamento pertencem ao personagem original.
    videos: (c.videos ?? []).filter((v) => !v.status),
  });
  return { ok: true, character: personagem };
}

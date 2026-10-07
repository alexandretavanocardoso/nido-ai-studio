/**
 * "Escrever como o personagem": legenda, roteiro de vídeo curto ou resposta a
 * comentário, na voz do personagem. O system prompt é o Prompt de sistema da
 * ficha (lib/prompts/sistema.ts); aqui fica só o pedido de cada formato.
 */
export const TIPOS_ESCRITA = ["legenda", "roteiro", "resposta"] as const;
export type TipoEscrita = (typeof TIPOS_ESCRITA)[number];

export const PLATAFORMAS = ["instagram", "tiktok", "youtube"] as const;
export type Plataforma = (typeof PLATAFORMAS)[number];

const NOME_PLATAFORMA: Record<Plataforma, string> = {
  instagram: "Instagram (Reels/post)",
  tiktok: "TikTok",
  youtube: "YouTube Shorts",
};

export function pedidoEscrita(o: {
  tipo: TipoEscrita;
  plataforma: Plataforma;
  tema: string;
  comentario?: string;
}): string {
  const onde = NOME_PLATAFORMA[o.plataforma];
  const tema = o.tema.trim();
  if (o.tipo === "legenda")
    return [
      `Escreva 3 opções de legenda para um post no ${onde} sobre: ${tema}`,
      "",
      "Regras:",
      "- Na sua voz: suas gírias, seu humor, seus bordões, seu jeito de pontuar.",
      "- Primeira linha é o gancho (para o scroll). Corpo curto. Termine com uma chamada para comentar/salvar/compartilhar que soe natural, não genérica.",
      "- 3 a 6 hashtags no fim, do seu nicho (nada de #love #instagood).",
      "- Separe as opções com uma linha contendo só ---. Sem títulos, sem explicação: só as legendas.",
    ].join("\n");
  if (o.tipo === "roteiro")
    return [
      `Escreva o roteiro de um vídeo curto (15 a 45 segundos) para o ${onde} sobre: ${tema}`,
      "",
      "Formato:",
      "GANCHO (0–3s): o que você fala e o que aparece na tela.",
      "CENAS: numeradas, cada uma com a sua fala exata (entre aspas), o que aparece na tela e o texto na tela, se houver.",
      "FECHAMENTO: a chamada final.",
      "LEGENDA: uma legenda curta para o post, com 3 a 5 hashtags.",
      "",
      "Fale como você fala de verdade. Sem explicações fora do roteiro.",
    ].join("\n");
  return [
    `Um seguidor comentou no seu post do ${onde}:`,
    `"${(o.comentario ?? "").trim()}"`,
    tema ? `\nContexto do post: ${tema}` : "",
    "",
    "Escreva 3 opções de resposta, de 1 a 3 frases cada, do jeito que você responderia de verdade.",
    "Se o comentário for ofensivo ou provocação, responda com classe ou com humor, nunca agressivo.",
    "Separe as opções com uma linha contendo só ---. Sem títulos, sem explicação.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/** Divide as opções (separadas por ---) para a tela mostrar cada uma com o próprio "Copiar". */
export function separarOpcoes(texto: string): string[] {
  const partes = texto
    .split(/^\s*-{3,}\s*$/m)
    .map((p) => p.trim())
    .filter(Boolean);
  return partes.length ? partes : [texto.trim()];
}

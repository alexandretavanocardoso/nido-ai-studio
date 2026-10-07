/**
 * Redes sociais suportadas na publicação (via bundle.social) e as regras de
 * cada uma. Compartilhado entre cliente e servidor.
 */
export const REDES = ["INSTAGRAM", "TIKTOK", "YOUTUBE", "TWITTER", "LINKEDIN"] as const;
export type Rede = (typeof REDES)[number];

export type TipoMidia = "video" | "imagem";

interface InfoRede {
  nome: string;
  /** Limite de caracteres do texto (legenda / post). */
  maxTexto: number;
  /** Aceita só vídeo? (YouTube Shorts) */
  soVideo: boolean;
  /** Exige mídia? (Instagram, TikTok, YouTube) */
  exigeMidia: boolean;
}

export const INFO_REDES: Record<Rede, InfoRede> = {
  INSTAGRAM: { nome: "Instagram", maxTexto: 2200, soVideo: false, exigeMidia: true },
  TIKTOK: { nome: "TikTok", maxTexto: 2200, soVideo: false, exigeMidia: true },
  YOUTUBE: { nome: "YouTube Shorts", maxTexto: 5000, soVideo: true, exigeMidia: true },
  TWITTER: { nome: "X (Twitter)", maxTexto: 280, soVideo: false, exigeMidia: false },
  LINKEDIN: { nome: "LinkedIn", maxTexto: 3000, soVideo: false, exigeMidia: false },
};

/** Título do YouTube: obrigatório, até 100 caracteres. */
export const MAX_TITULO_YOUTUBE = 100;

export interface PedidoPost {
  redes: Rede[];
  texto: string;
  titulo?: string;
  midiaTipo?: TipoMidia | null;
}

/** Problemas do post para cada rede escolhida (vazio = pode publicar). */
export function problemasDoPost(p: PedidoPost): string[] {
  const erros: string[] = [];
  if (!p.redes.length) erros.push("Escolha pelo menos uma rede.");
  for (const r of p.redes) {
    const info = INFO_REDES[r];
    if (info.exigeMidia && !p.midiaTipo) erros.push(`${info.nome} precisa de um vídeo ou imagem.`);
    if (info.soVideo && p.midiaTipo && p.midiaTipo !== "video") erros.push(`${info.nome} aceita só vídeo.`);
    if (p.texto.length > info.maxTexto)
      erros.push(`O texto passa do limite do ${info.nome} (${p.texto.length}/${info.maxTexto} caracteres).`);
  }
  if (!p.midiaTipo && !p.texto.trim()) erros.push("Escreva um texto ou escolha uma mídia.");
  if (p.redes.includes("LINKEDIN") && !p.texto.trim()) erros.push("O LinkedIn precisa de texto.");
  if (p.redes.includes("YOUTUBE") && !p.titulo?.trim()) erros.push("O YouTube precisa de um título.");
  if ((p.titulo?.length ?? 0) > MAX_TITULO_YOUTUBE)
    erros.push(`Título do YouTube com mais de ${MAX_TITULO_YOUTUBE} caracteres.`);
  return [...new Set(erros)];
}

/** Situação do post (espelha o bundle.social) em português. */
export type TomStatus = "backlog" | "agendado" | "ok" | "erro" | "andamento" | "neutro";

export const STATUS_POST: Record<string, { rotulo: string; tom: TomStatus }> = {
  BACKLOG: { rotulo: "Backlog", tom: "backlog" },
  DRAFT: { rotulo: "Rascunho", tom: "backlog" },
  SCHEDULED: { rotulo: "Agendado", tom: "agendado" },
  PROCESSING: { rotulo: "Publicando…", tom: "andamento" },
  RETRYING: { rotulo: "Tentando de novo…", tom: "andamento" },
  REVIEW: { rotulo: "Em análise na rede", tom: "andamento" },
  POSTED: { rotulo: "Publicado", tom: "ok" },
  ERROR: { rotulo: "Falhou", tom: "erro" },
  DELETED: { rotulo: "Cancelado", tom: "neutro" },
};

/** Status que ainda podem mudar (vale consultar de novo). */
export function statusEmAberto(s: string): boolean {
  return ["SCHEDULED", "PROCESSING", "RETRYING", "REVIEW"].includes(s);
}

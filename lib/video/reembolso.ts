/**
 * Pedido de reembolso de um vídeo gerado: o que a tela e o servidor
 * compartilham. O banco e as regras ficam em ./reembolso-server.ts.
 */

export const MOTIVOS_REEMBOLSO = ["defeito", "pessoa_errada", "outro"] as const;
export type MotivoReembolso = (typeof MOTIVOS_REEMBOLSO)[number];

export const NOME_MOTIVO_REEMBOLSO: Record<MotivoReembolso, string> = {
  defeito: "O vídeo saiu com defeito",
  pessoa_errada: "Trocou a pessoa errada",
  outro: "Outro motivo",
};

/** Tamanho do texto livre (o motivo de quem pede e a explicação da recusa). */
export const REEMBOLSO_TEXTO_MAX = 500;

export type StatusReembolso = "pendente" | "aprovado" | "recusado";

/** O pedido de um vídeo, como a pessoa que pediu vê. */
export interface ReembolsoDoVideo {
  jobId: string;
  /** Arquivo do vídeo (acha o pedido de uma edição antiga, que não guarda o job). */
  key?: string | null;
  status: StatusReembolso;
  creditos: number;
  /** Por que foi recusado. */
  resposta: string | null;
}

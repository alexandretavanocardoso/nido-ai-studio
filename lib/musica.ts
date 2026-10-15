import { z } from "zod";
import { DECLARACAO_MUSICA } from "@/lib/declaracoes";

/**
 * Música de fundo do vídeo de produto e do motion: um áudio enviado (pasta
 * `audios` do S3) ou tirado de um link (YouTube, TikTok… — /api/videos/musica).
 * Vai por baixo do vídeo pronto, mais baixa quando há fala
 * (`misturarMusica` em lib/video/ffmpeg.ts). Compartilhado entre a tela e o servidor.
 */
export interface MusicaDeFundo {
  key: string;
  /** Nome para mostrar (o do arquivo ou o título do vídeo do link). */
  nome: string;
  origem: "upload" | "link";
}

/** Música que vem num pedido: só com a declaração de direito de uso. */
export const MusicaSchema = z.object({
  key: z.string().min(1),
  nome: z.string().trim().max(200).default("Música"),
  origem: z.enum(["upload", "link"]).default("upload"),
  declaracao: z.literal(DECLARACAO_MUSICA, {
    message: "Confirme que tem direito de usar a música.",
  }),
});

/** Tempo máximo de música tirada de um link (o resto é cortado). */
export const MUSICA_MAX_SEGUNDOS = 5 * 60;

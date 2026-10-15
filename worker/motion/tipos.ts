/**
 * Motion: um modelo de IA escreve uma animação (motion graphics) num HTML só,
 * que a tela mostra num iframe e o worker grava em MP4 quadro a quadro.
 * Tipos e constantes compartilhados entre o app (rotas /api/admin/motion e a
 * tela /app/motion) e o worker. Sem dependências: o app importa este arquivo.
 */

export type TipoMotion = "site" | "produto" | "influencer" | "misto";
export const TIPOS_MOTION: TipoMotion[] = ["site", "produto", "influencer", "misto"];

export type FormatoMotion = "9:16" | "16:9" | "1:1";
export const FORMATOS_MOTION: Record<
  FormatoMotion,
  { largura: number; altura: number }
> = {
  "9:16": { largura: 1080, altura: 1920 },
  "16:9": { largura: 1920, altura: 1080 },
  "1:1": { largura: 1080, altura: 1080 },
};

export const DURACOES_MOTION = [6, 10, 15, 20, 30, 45, 60] as const;
export const FPS_MOTION = 30;

/** De onde veio cada imagem que o modelo pode usar. */
export type PapelAsset =
  | "produto"
  | "produto-recorte"
  | "influencer"
  | "influencer-recorte"
  | "site-desktop"
  | "site-celular"
  | "logo";

/** Imagem disponível para a animação, como `asset://<id>`. */
export interface AssetMotion {
  id: string;
  key: string;
  papel: PapelAsset;
  largura?: number;
  altura?: number;
  /** PNG recortado, com fundo transparente. */
  transparente?: boolean;
}

/** O que o worker leu do site (textos, cores) para o modelo usar. */
export interface LeituraSite {
  url: string;
  titulo: string;
  descricao: string;
  textos: string[];
  botoes: string[];
  cores: string[];
}

export interface InputMotion {
  /** O que o motion deve mostrar e dizer (escrito pela pessoa). */
  brief: string;
  formato: FormatoMotion;
  duracao: number;
  assets: AssetMotion[];
  site?: { url: string; leitura?: LeituraSite; erro?: string };
  produto?: { nome: string; descricao?: string };
  influencer?: { nome: string; descricao?: string };
  /** Ajuste de um motion anterior: o pedido de mudança e o HTML de base. */
  ajuste?: { pedido: string; baseId: string; baseHtmlKey: string };
}

export type StatusMotion = "na_fila" | "gerando" | "pronto" | "erro";
export type RenderMotion = "na_fila" | "renderizando" | "pronto" | "erro";

/** Andamento mostrado na tela. */
export interface ProgressoMotion {
  etapa: "site" | "pensando" | "escrevendo" | "conferindo" | "gravando" | "enviando";
  /** Caracteres do HTML já escritos. */
  caracteres?: number;
  /** Quadros gravados e o total. */
  quadro?: number;
  total?: number;
}

/** Tokens e custo (US$) da geração, somando a correção quando houve. */
export interface UsoMotion {
  entrada: number;
  saida: number;
  custo: number;
  segundos: number;
  /** O modelo que de fato respondeu (outro, se o pedido caiu na reserva). */
  modelo: string;
  correcoes?: number;
}

/** Chave do HTML e do vídeo de um motion no S3 (a limpeza de órfãos guarda pela tabela). */
export const keyDoMotion = (userId: string, id: string, ext: "html" | "mp4") =>
  `users/${userId}/motion/${id}.${ext}`;

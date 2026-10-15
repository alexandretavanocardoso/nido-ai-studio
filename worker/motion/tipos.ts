/**
 * Motion: um modelo de IA escreve uma animação (motion graphics) num HTML só,
 * que a tela mostra num iframe e o worker grava em MP4 quadro a quadro.
 * Tipos e constantes compartilhados entre o app (rotas /api/admin/motion e a
 * tela /app/motion) e o worker. Sem dependências: o app importa este arquivo.
 */

export type TipoMotion = "site" | "produto" | "influencer" | "misto" | "video";
export const TIPOS_MOTION: TipoMotion[] = ["site", "produto", "influencer", "misto", "video"];

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

/** Vídeo de referência (motion "a partir de um vídeo"): até 1 minuto. */
export const REFERENCIA_MAX_SEGUNDOS = 60;

/** Com vídeo de referência, o motion dura o mesmo que ele (em segundos inteiros, de 3 a 60). */
export const duracaoDaReferencia = (segundos: number): number =>
  Math.min(REFERENCIA_MAX_SEGUNDOS, Math.max(3, Math.round(segundos)));

/** O formato do motion mais parecido com o do vídeo (em pé, deitado ou quadrado). */
export function formatoMaisProximo(largura: number, altura: number): FormatoMotion {
  const r = largura / Math.max(1, altura);
  return r < 0.8 ? "9:16" : r > 1.25 ? "16:9" : "1:1";
}

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
  /** Idioma dos textos na tela (o da conta de quem pediu). Sem ele, português. */
  idioma?: "pt" | "en";
  /** Música de fundo do MP4 (áudio no S3). Escolhida no painel, antes de exportar. */
  musica?: { key: string; nome: string; origem: "upload" | "link" };
  /**
   * Vídeo de referência (estilo Katana): o motion recria a estrutura, o ritmo,
   * os cortes e o estilo dele com o material de quem pediu. O worker assiste
   * uma vez (cortes, batidas e o roteiro cena a cena) e guarda aqui — o ajuste
   * reaproveita.
   */
  referencia?: ReferenciaMotion;
}

export interface ReferenciaMotion {
  key: string;
  duracao: number;
  largura: number;
  altura: number;
  origem: "upload" | "link";
  /** O link da rede (quando veio de um) e o título do vídeo, para mostrar. */
  url?: string;
  titulo?: string;
  /** Usar o áudio do vídeo como música de fundo do MP4. */
  usarAudio: boolean;
  /** Roteiro cena a cena escrito pelo Gemini assistindo ao vídeo (imagem e som). */
  analise?: string;
  /**
   * O que o vídeo é, segundo o Gemini: motion graphics (dá para copiar o
   * design), filmado (só a história e o ritmo) ou misto.
   */
  estilo?: "grafico" | "filmado" | "misto";
  /** Instantes (s) das trocas de cena e das batidas fortes do áudio. */
  cortes?: number[];
  batidas?: number[];
  /** A análise falhou (o motion segue só com os quadros). */
  erro?: string;
}

export type StatusMotion = "na_fila" | "gerando" | "pronto" | "erro";
export type RenderMotion = "na_fila" | "renderizando" | "pronto" | "erro";

/** Andamento mostrado na tela. */
export interface ProgressoMotion {
  etapa: "site" | "assistindo" | "pensando" | "escrevendo" | "conferindo" | "revisando" | "gravando" | "enviando";
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
  /** A revisão visual (quadros) mudou o HTML. */
  revisado?: boolean;
}

/** Chave do HTML e do vídeo de um motion no S3 (a limpeza de órfãos guarda pela tabela). */
export const keyDoMotion = (userId: string, id: string, ext: "html" | "mp4") =>
  `users/${userId}/motion/${id}.${ext}`;

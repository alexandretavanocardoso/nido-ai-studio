/** Radar de fornecedores de IA: o que o cliente e o servidor compartilham. */

export const CATEGORIAS = ["video", "imagem", "voz"] as const;
export type Categoria = (typeof CATEGORIAS)[number];
export const NOME_CATEGORIA: Record<Categoria, string> = {
  video: "Vídeo",
  imagem: "Imagem",
  voz: "Voz",
};

export const STATUS_FORNECEDOR = [
  "nova",
  "interessante",
  "contatada",
  "negociando",
  "descartada",
] as const;
export type StatusFornecedor = (typeof STATUS_FORNECEDOR)[number];
export const NOME_STATUS: Record<StatusFornecedor, string> = {
  nova: "Nova",
  interessante: "Interessante",
  contatada: "Contatada",
  negociando: "Em negociação",
  descartada: "Descartada",
};

export type TemApi = "sim" | "nao" | "incerto";
export type IdiomaAbordagem = "en" | "zh";
export const ANOTACOES_MAX = 2000;

export interface Fonte {
  titulo: string;
  url: string;
}

/** Rascunho para o LinkedIn: quem envia é o admin, à mão. */
export interface Abordagem {
  idioma: IdiomaAbordagem;
  /** Nota do convite de conexão (cabe no limite da conta grátis). */
  convite: string;
  /** Mensagem para depois que a pessoa aceitar. */
  mensagem: string;
}

/** O que a pesquisa devolve de cada empresa. */
export interface EmpresaAchada {
  nome: string;
  pais: string | null;
  categorias: Categoria[];
  oferece: string;
  api: TemApi;
  preco: string | null;
  site: string | null;
  linkedin: string | null;
  pessoas: string | null;
  porque: string;
  nota: number;
  fontes: Fonte[];
}

export interface Fornecedor extends EmpresaAchada {
  id: string;
  status: StatusFornecedor;
  anotacoes: string | null;
  abordagem: Abordagem | null;
  criadoEm: string;
}

export interface FornecedoresAdmin {
  itens: Fornecedor[];
  totais: Array<{ status: string; n: number }>;
  /** Quando rodou a última pesquisa (null = nunca). */
  ultimaBusca: string | null;
}

export interface ResumoPesquisa {
  achados: number;
  novos: number;
  usd: number;
  /** Categorias em que a pesquisa falhou, com o motivo. */
  falhas: Array<{ categoria: Categoria; erro: string }>;
}

/** Sufixos de dois níveis mais comuns (bytedance.com.cn → bytedance.com.cn, não com.cn). */
const SUFIXO_DUPLO = /\.(com?|net|org|ac|gov|edu)\.[a-z]{2}$/;

/**
 * Identidade da empresa para não gravar a mesma duas vezes: o domínio do site,
 * sem subdomínio (docs.byteplus.com e www.byteplus.com são a mesma); sem site,
 * o nome só com letras e números.
 */
export function chaveFornecedor(nome: string, site: string | null): string {
  if (site) {
    try {
      const host = new URL(site).hostname.toLowerCase().replace(/\.$/, "");
      const partes = host.split(".");
      const n = SUFIXO_DUPLO.test(host) ? 3 : 2;
      if (partes.length >= 2) return partes.slice(-n).join(".");
    } catch {
      /* site ilegível: cai no nome */
    }
  }
  return nome
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** Busca de empresas no LinkedIn pelo nome — para quando a pesquisa não achou a página. */
export const buscaNoLinkedin = (nome: string) =>
  `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(nome)}`;

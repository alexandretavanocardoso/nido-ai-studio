import { timingSafeEqual } from "node:crypto";

/**
 * Ponte com o Nido (a plataforma de campanhas, projeto nido-api). Os dois
 * apps têm login do Google: a conta de um e do outro é ligada pelo e-mail.
 *
 *  - Daqui para lá: campanhas exclusivas do Studio que estão abertas, e os
 *    ganhos e as campanhas do usuário (pelo e-mail da sessão).
 *  - De lá para cá: o Nido pergunta se um e-mail tem conta no Studio
 *    (/api/integracao/nido/conta), para liberar as campanhas exclusivas.
 *
 * Os dois lados mandam o mesmo segredo no header `x-studio-key`
 * (aqui NIDO_INTEGRACAO_SEGREDO; lá STUDIO_INTEGRATION_SECRET). Só servidor
 * com servidor: o segredo nunca vai para o navegador.
 */
const CABECALHO = "x-studio-key";
const LIMITE_MS = 8000;

const config = () => ({
  url: (process.env.NIDO_API_URL ?? "").trim().replace(/\/+$/, ""),
  segredo: (process.env.NIDO_INTEGRACAO_SEGREDO ?? "").trim(),
});

export const nidoConfigurado = (): boolean => {
  const c = config();
  return !!c.url && !!c.segredo;
};

/** O pedido veio do Nido? Confere o segredo do header, em tempo constante. */
export function pedidoDoNido(req: Request): boolean {
  const { segredo } = config();
  const recebido = req.headers.get(CABECALHO) ?? "";
  if (!segredo || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(segredo);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type TipoCampanhaNido = "campaign" | "clip_campaign";

export interface CampanhaExclusiva {
  id: string;
  type: TipoCampanhaNido;
  title: string;
  description: string;
  banner: string | null;
  start_date: string;
  end_date: string;
  total_prize_pool: number;
  payment_token: string;
  path: string;
}

export interface CampanhaDoCreator {
  campaign_id: string;
  campaign_type: TipoCampanhaNido;
  title: string;
  status: string;
  posts: number;
  views: number;
  likes: number;
  gain: number;
  links: string[];
  path: string;
}

export interface ResumoDoCreator {
  found: boolean;
  front_url: string;
  username?: string | null;
  totals?: { earnings: number; views: number; posts: number; campaigns: number };
  monthly?: Array<{ month: string; gain: number }>;
  campaigns?: CampanhaDoCreator[];
}

async function pedir<T>(caminho: string): Promise<T> {
  const { url, segredo } = config();
  const res = await fetch(`${url}/api/v1/integrations/studio${caminho}`, {
    headers: { [CABECALHO]: segredo },
    signal: AbortSignal.timeout(LIMITE_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`O Nido respondeu HTTP ${res.status}.`);
  return (await res.json()) as T;
}

export const campanhasExclusivas = () =>
  pedir<{ data: CampanhaExclusiva[]; front_url: string }>("/campaigns");

export const resumoDoCreator = (email: string) =>
  pedir<ResumoDoCreator>(`/creator?email=${encodeURIComponent(email)}`);

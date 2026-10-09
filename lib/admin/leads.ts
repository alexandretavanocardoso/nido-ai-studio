import { getPool } from "@/lib/db";

/**
 * Contatos da landing page (tabela `leads`): pedidos de proposta do plano
 * Agência e inscrições na whitelist. Ninguém é avisado quando chegam — é
 * nesta lista do admin que eles são lidos.
 */
export interface LeadAdmin {
  id: string;
  tipo: "agencia" | "whitelist";
  nome: string;
  email: string;
  whatsapp: string | null;
  /** Whitelist: marca | agencia | creator. */
  perfil: string | null;
  nicho: string | null;
  /** Agência. */
  empresa: string | null;
  creators: string | null;
  objetivo: string | null;
  criadoEm: string;
  /** Já tem conta no app com este e-mail? */
  temConta: boolean;
}

export interface LeadsAdmin {
  itens: LeadAdmin[];
  totais: { agencia: number; whitelist: number; semana: number };
}

export async function listarLeads(): Promise<LeadsAdmin> {
  const pool = getPool()!;
  const [itens, totais] = await Promise.all([
    pool.query(
      `select l.*, exists (select 1 from "user" u where lower(u.email) = lower(l.email)) as tem_conta
       from leads l order by l.created_at desc limit 500`,
    ),
    pool.query(
      `select count(*) filter (where tipo = 'agencia')::int as agencia,
              count(*) filter (where tipo = 'whitelist')::int as whitelist,
              count(*) filter (where created_at > now() - interval '7 days')::int as semana
       from leads`,
    ),
  ]);
  return {
    itens: itens.rows.map((r) => ({
      id: String(r.id),
      tipo: r.tipo,
      nome: r.nome,
      email: r.email,
      whatsapp: r.whatsapp ?? null,
      perfil: r.perfil ?? null,
      nicho: r.nicho ?? null,
      empresa: r.empresa ?? null,
      creators: r.creators ?? null,
      objetivo: r.objetivo ?? null,
      criadoEm: new Date(r.created_at).toISOString(),
      temConta: !!r.tem_conta,
    })),
    totais: totais.rows[0],
  };
}

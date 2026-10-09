import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth/server";
import { getPool } from "@/lib/db";
import {
  campanhasExclusivas,
  nidoConfigurado,
  resumoDoCreator,
  type ResumoDoCreator,
} from "@/lib/nido/api";
import { chaveDoLink, personagemDaCampanha } from "@/lib/nido/links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — o que o Dashboard mostra do Nido para a conta logada:
 *  - ganhos (pagamentos confirmados lá) e as campanhas em que participou,
 *    cada uma ligada a um personagem (escolha manual, ou pelo link do post);
 *  - as campanhas exclusivas do Studio que estão abertas.
 * A conta de lá é achada pelo e-mail do Google da sessão.
 */
export async function GET() {
  const sessao = await getAuth()?.api.getSession({ headers: await headers() });
  const pool = getPool();
  if (!sessao || !pool)
    return NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  if (!nidoConfigurado()) return NextResponse.json({ configurado: false });
  const userId = sessao.user.id;

  // As duas consultas são independentes: uma falhar não derruba a outra.
  const [resumo, exclusivas] = await Promise.allSettled([
    // Só e-mail confirmado: é ele que prova que a conta de lá é da mesma pessoa.
    sessao.user.emailVerified
      ? resumoDoCreator(sessao.user.email)
      : Promise.resolve<ResumoDoCreator>({ found: false, front_url: "" }),
    campanhasExclusivas(),
  ]);
  const r = resumo.status === "fulfilled" ? resumo.value : null;
  const e = exclusivas.status === "fulfilled" ? exclusivas.value : null;
  if (!r && !e)
    return NextResponse.json({
      configurado: true,
      erro: "Não consegui falar com o Nido agora. Tente de novo em instantes.",
    });
  const site = (r?.front_url || e?.front_url || "").replace(/\/+$/, "");
  const endereco = (caminho: string) => (site ? `${site}${caminho}` : null);

  // Posts do Studio (pelo link) e escolhas manuais, para ligar campanha a personagem.
  const [posts, manuais, personagens] = await Promise.all([
    pool.query<{ character_id: string; links: Record<string, string> | null }>(
      "select character_id, links from posts_agendados where user_id = $1 and status = 'POSTED' and links is not null",
      [userId],
    ),
    pool.query<{ campanha_id: string; character_id: string }>(
      "select campanha_id, character_id from nido_campanha_personagem where user_id = $1",
      [userId],
    ),
    pool.query<{ id: string }>("select id from characters where user_id = $1", [
      userId,
    ]),
  ]);
  const porChave = new Map<string, string>();
  for (const p of posts.rows)
    for (const link of Object.values(p.links ?? {})) {
      const chave = chaveDoLink(link);
      if (chave && !porChave.has(chave)) porChave.set(chave, p.character_id);
    }
  const manual = new Map(manuais.rows.map((m) => [m.campanha_id, m.character_id]));
  const existentes = new Set(personagens.rows.map((p) => p.id));

  return NextResponse.json({
    configurado: true,
    temConta: !!r?.found,
    site: site || null,
    usuario: r?.username ?? null,
    ganhos: r?.totals?.earnings ?? 0,
    views: r?.totals?.views ?? 0,
    mensal: r?.monthly ?? [],
    campanhas: (r?.campaigns ?? []).map((c) => ({
      id: c.campaign_id,
      tipo: c.campaign_type,
      titulo: c.title,
      status: c.status,
      posts: c.posts,
      views: c.views,
      ganho: c.gain,
      links: c.links,
      url: endereco(c.path),
      ...personagemDaCampanha({
        links: c.links,
        posts: porChave,
        manual: manual.get(c.campaign_id),
        existentes,
      }),
    })),
    exclusivas: (e?.data ?? []).map((c) => ({
      id: c.id,
      tipo: c.type,
      titulo: c.title,
      descricao: c.description,
      banner: c.banner,
      fim: c.end_date,
      premio: c.total_prize_pool,
      token: c.payment_token,
      url: endereco(c.path),
    })),
    erro:
      resumo.status === "rejected"
        ? "Não consegui ler seus ganhos no Nido agora."
        : null,
  });
}

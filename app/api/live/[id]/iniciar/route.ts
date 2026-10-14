import { NextResponse } from "next/server";
import { cobrarOuResponder, estornarSeHouver } from "@/lib/creditos";
import {
  abrirSessao,
  carregarLive,
  encerrarLive,
  estadoSessao,
  tokenDoOperador,
  type LiveRow,
} from "@/lib/live/server";
import { contextoLive, liveNaoEncontrada } from "@/lib/live/rota";
import { IDENTIDADE_AVATAR, segundosNoAr } from "@/lib/live/tipos";
import { creditosLive } from "@/lib/planos";
import { mensagemDeErroRunway } from "@/lib/video/runway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Menos que isto de tempo restante não vale abrir outra sessão. */
const MINIMO_SEGUNDOS = 20;

/**
 * POST — entra no ar (ou volta, depois de a página recarregar ou de o avatar
 * cair). Na primeira vez cobra a duração escolhida e põe o avatar do Runway na
 * sala; depois só devolve o acesso à sala e, se o avatar saiu, abre outra
 * sessão com o tempo que resta (sem cobrar de novo).
 * Devolve o endereço e o token do LiveKit para o navegador do operador.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await contextoLive();
  if (ctx instanceof NextResponse) return ctx;
  const { pool, rw, lk, userId } = ctx;
  const live = await carregarLive(pool, userId, (await params).id);
  if (!live) return liveNaoEncontrada();
  const teto = live.duracao_min * 60;
  const acesso = (l: LiveRow) => {
    const restante = teto - segundosNoAr(l.sessoes, Date.now(), teto);
    return {
      url: lk.url,
      token: tokenDoOperador(lk, l, restante),
      avatar: IDENTIDADE_AVATAR,
      restante,
    };
  };

  if (live.status === "pronta") {
    const cobrado = await cobrarOuResponder(
      userId,
      creditosLive(live.duracao_min),
      "live",
      live.id,
    );
    if (cobrado instanceof NextResponse) return cobrado;
    try {
      const sessao = await abrirSessao(rw, lk, live, teto);
      const { rows } = await pool.query<LiveRow>(
        `update lives set status = 'no_ar', iniciada_em = now(), sessoes = $2, cobranca = $3
          where id = $1 and status = 'pronta' returning *`,
        [live.id, JSON.stringify([sessao]), JSON.stringify(cobrado.cobranca)],
      );
      if (!rows[0]) {
        // Outra aba entrou no ar ao mesmo tempo: desfaz esta.
        await rw.realtimeSessions.delete(sessao.id).catch(() => {});
        await estornarSeHouver(cobrado.cobranca);
        return NextResponse.json(
          { error: "Esta live já entrou no ar em outra aba.", code: "CONFLITO" },
          { status: 409 },
        );
      }
      return NextResponse.json(acesso(rows[0]));
    } catch (e) {
      await estornarSeHouver(cobrado.cobranca);
      console.error("[live] iniciar", e);
      return NextResponse.json(
        { error: mensagemDeErroRunway(e), code: "PROVIDER_ERROR" },
        { status: 502 },
      );
    }
  }

  if (live.status !== "no_ar")
    return NextResponse.json(
      {
        error:
          live.status === "preparando"
            ? "O avatar ainda está sendo preparado."
            : "Esta live já terminou.",
        code: "STATUS",
      },
      { status: 409 },
    );

  // Já no ar: a sessão atual ainda está de pé? Então é só voltar para a sala.
  const ultima = live.sessoes.at(-1);
  if (ultima && ultima.fim === undefined) {
    const e = await estadoSessao(rw, ultima.id).catch(() => null);
    if (!e || e.estado === "ativa") return NextResponse.json(acesso(live));
    ultima.fim = Date.now();
    if (e.estado === "falhou") ultima.segundos = 0;
    else if (e.segundos !== undefined) ultima.segundos = e.segundos;
  }
  const restante = teto - segundosNoAr(live.sessoes, Date.now(), teto);
  if (restante < MINIMO_SEGUNDOS) {
    await encerrarLive(pool, rw, live);
    return NextResponse.json(
      { error: "O tempo desta live acabou.", code: "STATUS" },
      { status: 409 },
    );
  }
  try {
    const sessao = await abrirSessao(rw, lk, live, restante);
    const sessoes = [...live.sessoes, sessao];
    await pool.query("update lives set sessoes = $2 where id = $1", [
      live.id,
      JSON.stringify(sessoes),
    ]);
    return NextResponse.json(acesso({ ...live, sessoes }));
  } catch (e) {
    console.error("[live] reconectar", e);
    return NextResponse.json(
      { error: mensagemDeErroRunway(e), code: "PROVIDER_ERROR" },
      { status: 502 },
    );
  }
}

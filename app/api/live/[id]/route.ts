import { NextResponse } from "next/server";
import {
  carregarLive,
  encerrarLive,
  estadoSessao,
  resumoDaLive,
  type EstadoSessao,
  type LiveRow,
} from "@/lib/live/server";
import { contextoLive, liveNaoEncontrada } from "@/lib/live/rota";
import { segundosNoAr } from "@/lib/live/tipos";
import { estadoAvatar } from "@/lib/video/falado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — como está a live. Preparando: confere se o avatar do Runway ficou
 * pronto. No ar: confere a sessão atual do avatar e encerra quando o tempo
 * cobrado acaba. Devolve também quantos segundos ainda restam.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await contextoLive();
  if (ctx instanceof NextResponse) return ctx;
  const { pool, rw, userId } = ctx;
  let live = await carregarLive(pool, userId, (await params).id);
  if (!live) return liveNaoEncontrada();

  if (live.status === "preparando" && live.avatar_id) {
    const a = await estadoAvatar(rw, live.avatar_id);
    if (a.estado !== "preparando") {
      const { rows } = await pool.query<LiveRow>(
        `update lives set status = $2, erro = $3 where id = $1 and status = 'preparando' returning *`,
        [
          live.id,
          a.estado === "pronto" ? "pronta" : "erro",
          a.estado === "erro" ? a.mensagem : null,
        ],
      );
      live = rows[0] ?? live;
    }
  }

  let sessao: { estado: EstadoSessao; falha?: string } | null = null;
  let restante: number | null = null;
  if (live.status === "no_ar") {
    const teto = live.duracao_min * 60;
    const ultima = live.sessoes.at(-1);
    if (ultima && ultima.fim === undefined) {
      try {
        const e = await estadoSessao(rw, ultima.id);
        sessao = { estado: e.estado, falha: e.falha };
        if (e.estado !== "ativa") {
          // Terminou sem o operador encerrar: o tempo dela para de contar.
          const fechada = {
            ...ultima,
            fim: Date.now(),
            ...(e.estado === "falhou"
              ? { segundos: 0 }
              : e.segundos !== undefined
                ? { segundos: e.segundos }
                : {}),
          };
          const sessoes = [...live.sessoes.slice(0, -1), fechada];
          await pool.query("update lives set sessoes = $2 where id = $1", [
            live.id,
            JSON.stringify(sessoes),
          ]);
          live = { ...live, sessoes };
        }
      } catch (e) {
        console.warn("[live] sessão", ultima.id, (e as Error).message);
      }
    } else sessao = { estado: "terminou" };
    restante = teto - segundosNoAr(live.sessoes, Date.now(), teto);
    if (restante <= 0) {
      live = await encerrarLive(pool, rw, live);
      restante = 0;
    }
  }

  return NextResponse.json({ live: resumoDaLive(live), sessao, restante });
}

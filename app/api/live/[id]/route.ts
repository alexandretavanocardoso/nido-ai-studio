import { NextResponse } from "next/server";
import {
  carregarLive,
  encerrarLive,
  estadoSessao,
  previaDoAvatar,
  resumoDaLive,
  type EstadoSessao,
  type LiveRow,
} from "@/lib/live/server";
import { avancarAvatar3d, carregarAvatar3d } from "@/lib/live/avatar3d";
import { contextoLive, liveNaoEncontrada } from "@/lib/live/rota";
import { ehSessaoSombra, segundosNoAr } from "@/lib/live/tipos";
import { estadoAvatar } from "@/lib/video/falado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — como está a live. Preparando: confere se o avatar do Runway ficou
 * pronto. No ar: confere a sessão atual do avatar e encerra quando o tempo
 * cobrado acaba. Devolve também quantos segundos ainda restam e a prévia do
 * avatar (a imagem que o Runway preparou, já no cenário). Na Sombra 3D, confere
 * o modelo 3D e devolve onde estão o modelo, a versão desenho e o fundo.
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

  // Sombra 3D: o avatar 3D sai do fal em 1 a 3 min; enquanto isso, confere.
  let avatar3d = live.avatar3d_id ? await carregarAvatar3d(pool, live.avatar3d_id) : null;
  if (avatar3d && live.status === "preparando") {
    avatar3d = await avancarAvatar3d(pool, ctx.s3, avatar3d);
    if (avatar3d.status !== "gerando") {
      const { rows } = await pool.query<LiveRow>(
        `update lives set status = $2, erro = $3 where id = $1 and status = 'preparando' returning *`,
        [live.id, avatar3d.status === "pronto" ? "pronta" : "erro", avatar3d.erro],
      );
      live = rows[0] ?? live;
    }
  }

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
    if (ultima && ehSessaoSombra(ultima.id)) {
      // Sombra: a webcam está no navegador; não há sessão no Runway a conferir.
      sessao = { estado: ultima.fim === undefined ? "ativa" : "terminou" };
    } else if (ultima && ultima.fim === undefined) {
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

  // Prévia do avatar (a imagem que o Runway preparou) enquanto ainda dá para conferir.
  const previa =
    live.avatar_id && (live.status === "pronta" || live.status === "no_ar")
      ? await previaDoAvatar(rw, live.avatar_id)
      : null;

  return NextResponse.json({
    live: resumoDaLive(live),
    sessao,
    restante,
    previa,
    avatar3d: avatar3d && {
      modeloKey: avatar3d.modelo_key,
      desenhoKey: avatar3d.estilizada_key,
      fundoKey: live.cena && "imageKey" in live.cena ? live.cena.imageKey : null,
    },
  });
}

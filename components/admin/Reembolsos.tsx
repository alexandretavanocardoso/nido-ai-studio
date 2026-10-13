"use client";

import { useState } from "react";
import { Check, Loader2, RefreshCw, XCircle } from "lucide-react";
import type { ReembolsoAdmin } from "@/lib/video/reembolso-server";
import {
  NOME_MOTIVO_REEMBOLSO,
  REEMBOLSO_TEXTO_MAX,
  type MotivoReembolso,
} from "@/lib/video/reembolso";
import { confirmar } from "@/components/ui/Confirmacao";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import {
  acaoAdmin,
  custoUSD,
  diaHora,
  Estado,
  Filtros,
  num,
  Secao,
  Selo,
  useAdmin,
} from "./partes";

type Status = "" | "pendente" | "aprovado" | "recusado";

const NOME_TIPO: Record<string, string> = {
  substituir: "Troca de pessoa",
  criar: "Vídeo criado",
  legenda_ia: "Legenda com IA",
  corte: "Corte",
  legenda: "Legenda editada (rápida)",
  audio: "Fala adicionada",
};

/** Status do post no bundle.social, em português. */
const nomePost = (status: string) =>
  status === "POSTED"
    ? "Publicado"
    : status === "SCHEDULED"
      ? "Agendado"
      : status === "ERROR"
        ? "Falhou ao publicar"
        : status;

/** Aba Reembolsos: pedidos de reembolso de vídeo, para aprovar ou recusar. */
export function Reembolsos({
  abrirUsuario,
}: {
  abrirUsuario: (id: string) => void;
}) {
  const [status, setStatus] = useState<Status>("pendente");
  const { dados, erro, carregando, recarregar } = useAdmin<{
    itens: ReembolsoAdmin[];
    totais: Array<{ status: string; n: number }>;
  }>(`/api/admin/reembolsos?status=${status}`);
  const [agindo, setAgindo] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  /** Pedido com a caixa de recusa aberta, e o texto dela. */
  const [recusando, setRecusando] = useState<string | null>(null);
  const [resposta, setResposta] = useState("");

  const total = (s: string) =>
    dados?.totais.find((t) => t.status === s)?.n ?? 0;

  async function resolver(
    r: ReembolsoAdmin,
    corpo: { acao: "aprovar" } | { acao: "recusar"; resposta: string },
  ) {
    setAgindo(r.id);
    setErroAcao(null);
    try {
      await acaoAdmin(
        `/api/admin/reembolsos/${encodeURIComponent(r.id)}`,
        corpo,
      );
      setRecusando(null);
      setResposta("");
      recarregar();
    } catch (e) {
      setErroAcao((e as Error).message);
    } finally {
      setAgindo(null);
    }
  }

  async function aprovar(r: ReembolsoAdmin) {
    const ok = await confirmar({
      titulo: "Aprovar este reembolso?",
      mensagem: `${num(r.creditos)} créditos voltam agora para ${r.email ?? r.userId}. O vídeo continua na conta. Não dá para desfazer.`,
      confirmar: "Aprovar e devolver",
    });
    if (ok) await resolver(r, { acao: "aprovar" });
  }

  return (
    <Secao
      titulo="Reembolsos de vídeo"
      descricao="Pedidos feitos pelos usuários nos vídeos gerados. Aprovar devolve os créditos do vídeo; recusar pede uma explicação, que o usuário lê no vídeo e no sino."
      acoes={
        <button
          type="button"
          onClick={recarregar}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-mute hover:text-ink"
        >
          <RefreshCw
            className={carregando ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5"}
          />{" "}
          Atualizar
        </button>
      }
    >
      <Filtros<Status>
        rotulo="Status"
        valor={status}
        onChange={setStatus}
        opcoes={[
          { id: "pendente", rotulo: "Pendentes", n: total("pendente") },
          { id: "aprovado", rotulo: "Aprovados", n: total("aprovado") },
          { id: "recusado", rotulo: "Recusados", n: total("recusado") },
          { id: "", rotulo: "Todos" },
        ]}
      />
      {erroAcao ? (
        <div className="rounded-xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink">
          {erroAcao}
        </div>
      ) : null}
      <Estado
        carregando={carregando}
        erro={erro}
        vazio={!dados?.itens.length}
        textoVazio="Nenhum pedido de reembolso aqui."
      />
      {dados?.itens.map((r) => (
        <article
          key={r.id}
          className="card grid gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)]"
        >
          {r.videoUrl ? (
            <video
              src={r.videoUrl}
              controls
              preload="metadata"
              className="h-72 w-full rounded-lg bg-black object-contain"
            />
          ) : (
            <div className="grid h-72 place-items-center rounded-lg bg-black px-4 text-center text-[12px] text-ink-dim">
              O arquivo do vídeo não está mais disponível.
            </div>
          )}

          <div className="grid min-w-0 content-start gap-3 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => abrirUsuario(r.userId)}
                className="truncate font-semibold text-ink hover:text-accent"
              >
                {r.email ?? r.userId}
              </button>
              {r.status === "pendente" ? (
                <Selo tom="alerta">Pendente</Selo>
              ) : r.status === "aprovado" ? (
                <Selo tom="ok">Aprovado</Selo>
              ) : (
                <Selo tom="erro">Recusado</Selo>
              )}
              <span className="text-[12px] text-ink-dim">
                pedido em {diaHora(r.pedidoEm)}
              </span>
            </div>

            <div>
              <div className="label-cap">Motivo</div>
              <p className="text-ink">
                {NOME_MOTIVO_REEMBOLSO[r.motivo as MotivoReembolso] ?? r.motivo}
              </p>
              {r.detalhe ? (
                <p className="mt-1 whitespace-pre-wrap text-ink-mute">
                  “{r.detalhe}”
                </p>
              ) : null}
            </div>

            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <Fato rotulo="Vídeo">
                {NOME_TIPO[r.tipo] ?? r.tipo}
                {r.duracao ? ` · ${r.duracao.toFixed(1)}s` : ""} · {r.modelo}
                <br />
                <span className="text-ink-dim">
                  gerado em {diaHora(r.videoCriadoEm)}
                </span>
              </Fato>
              <Fato rotulo="Valor">
                {num(r.creditos)} créditos
                <span className="text-ink-dim">
                  {" "}
                  · custo {custoUSD(r.creditos)}
                </span>
              </Fato>
              <Fato rotulo="Baixou o vídeo?">
                {r.baixadoEm ? (
                  <span className="text-accent">
                    Sim, em {diaHora(r.baixadoEm)}
                  </span>
                ) : (
                  "Não"
                )}
              </Fato>
              <Fato rotulo="Agendou ou publicou pela plataforma?">
                {r.posts.length ? (
                  <span className="text-accent">
                    {r.posts.map((p, i) => (
                      <span key={i} className="block">
                        {nomePost(p.status)} · {diaHora(p.quando)} ·{" "}
                        {p.redes.join(", ").toLowerCase()}
                      </span>
                    ))}
                  </span>
                ) : (
                  "Não"
                )}
              </Fato>
            </dl>

            {r.status === "recusado" && r.resposta ? (
              <div>
                <div className="label-cap">Por que foi recusado</div>
                <p className="whitespace-pre-wrap text-ink-mute">{r.resposta}</p>
              </div>
            ) : null}
            {r.status !== "pendente" && r.resolvidoPor ? (
              <p className="text-[12px] text-ink-dim">
                Resolvido por {r.resolvidoPor} em {diaHora(r.resolvidoEm)}
              </p>
            ) : null}

            {r.status === "pendente" ? (
              recusando === r.id ? (
                <div className="grid gap-2">
                  <Textarea
                    rows={3}
                    maxLength={REEMBOLSO_TEXTO_MAX}
                    autoFocus
                    placeholder="Por que o reembolso foi recusado? O usuário vai ler este texto."
                    value={resposta}
                    onChange={(e) => setResposta(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={agindo === r.id || !resposta.trim()}
                      onClick={() =>
                        resolver(r, { acao: "recusar", resposta: resposta.trim() })
                      }
                    >
                      {agindo === r.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      Recusar reembolso
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRecusando(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="accent"
                    disabled={agindo === r.id}
                    onClick={() => aprovar(r)}
                  >
                    {agindo === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Aprovar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={agindo === r.id}
                    onClick={() => {
                      setRecusando(r.id);
                      setResposta("");
                    }}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Recusar
                  </Button>
                </div>
              )
            ) : null}
          </div>
        </article>
      ))}
    </Secao>
  );
}

function Fato({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="label-cap">{rotulo}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

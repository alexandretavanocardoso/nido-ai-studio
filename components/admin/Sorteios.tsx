"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, Flag, Loader2, Lock, LockOpen, Plus, Trash2, Trophy, X } from "lucide-react";
import { Corrida } from "@/components/sorteio/Corrida";
import { useSorteio } from "@/components/sorteio/comum";
import { Button } from "@/components/ui/Button";
import { confirmar } from "@/components/ui/Confirmacao";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { idiomaAtual } from "@/lib/i18n/tx";
import { avisarNaTela } from "@/lib/notificar";
import { PLANOS, PLANOS_PAGOS, type PlanoPago } from "@/lib/planos";
import type { ParticipanteAdmin, SorteioAdmin } from "@/lib/sorteio/server";
import {
  creditosDoPresente,
  LIMITES_PREMIO,
  MESES_PRESENTE,
  nomePremio,
  reais,
  type Entrega,
  type Premio,
  type SorteioPublico,
  type StatusSorteio,
  type TipoPremio,
} from "@/lib/sorteio/tipos";
import { acaoAdmin, diaHora, Estado, num, Secao, Selo, Tabela, useAdmin } from "./partes";

const NOME_STATUS: Record<StatusSorteio, { texto: string; tom: "ok" | "alerta" | "erro" | "neutro" }> = {
  aberto: { texto: "Inscrições abertas", tom: "ok" },
  fechado: { texto: "Inscrições fechadas", tom: "alerta" },
  correndo: { texto: "Correndo", tom: "alerta" },
  concluido: { texto: "Concluído", tom: "neutro" },
  cancelado: { texto: "Cancelado", tom: "erro" },
};

const dia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

function textoEntrega(e: Entrega | null): string {
  if (!e) return "—";
  if (e.tipo === "plano") return `Plano ${PLANOS[e.plano].nome} até ${dia(e.ate)} (sem renovação)`;
  if (e.tipo === "creditos") return `${num(e.creditos)} créditos${e.plano ? " (já tinha plano pago)" : ""}`;
  if (e.tipo === "pontos") return `${num(e.pontos)} pontos`;
  if (e.pagoEm) return `Pix de ${reais(e.centavos)} pago em ${dia(e.pagoEm)}`;
  if (e.chave) return `Pix de ${reais(e.centavos)} a pagar · chave ${e.chave} (${e.titular})`;
  return `Pix de ${reais(e.centavos)}: aguardando a chave do ganhador`;
}

const NOME_TIPO: Record<TipoPremio, string> = { plano: "Plano", creditos: "Créditos", pontos: "Pontos", pix: "Pix" };

/**
 * Admin → Sorteios: cria o sorteio com o prêmio (plano por N meses sem
 * renovação, créditos, pontos ou Pix), acompanha quem entra, larga a corrida
 * (o ganhador é sorteado na hora, no servidor) e vê o que foi entregue — no
 * Pix, a chave do ganhador e o "marcar como pago". Um em andamento por vez.
 */
export function Sorteios() {
  const lista = useAdmin<{ sorteios: SorteioAdmin[] }>("/api/admin/sorteios");
  const sorteios = lista.dados?.sorteios ?? [];
  const [novo, setNovo] = useState(false);
  const ativo = sorteios.find((s) => s.status === "aberto" || s.status === "fechado" || s.status === "correndo");
  // O último concluído fica na tela (o vencedor, para a live) até pedir um novo.
  const mostrar = ativo ?? (!novo && sorteios[0]?.status === "concluido" ? sorteios[0] : undefined);

  return (
    <div className="grid gap-8">
      {mostrar ? (
        <SorteioAtivo key={mostrar.id} id={mostrar.id} onMudou={lista.recarregar} onNovo={() => setNovo(true)} />
      ) : (
        <NovoSorteio
          onCriado={(s) => {
            setNovo(false);
            lista.setDados({ sorteios: s });
          }}
        />
      )}

      <Secao titulo="Sorteios" descricao="Os mais recentes, com o ganhador e o que ele recebeu.">
        <Estado carregando={lista.carregando} erro={lista.erro} vazio={!sorteios.length} textoVazio="Nenhum sorteio ainda." />
        {sorteios.length ? (
          <Tabela colunas={["Quando", "Sorteio", "Presente", "Situação", "Participantes", "Ganhador", "Entregue"]} larguras={[120, "", 160, 150, 100, 230, 230]} minimo={1250}>
            {sorteios.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2.5 text-ink-mute">{diaHora(s.criadoEm)}</td>
                <td className="px-3 py-2.5 font-semibold text-ink truncate">{s.titulo}</td>
                <td className="px-3 py-2.5 truncate">{nomePremio(s.premio)}</td>
                <td className="px-3 py-2.5">
                  <Selo tom={NOME_STATUS[s.status].tom}>{NOME_STATUS[s.status].texto}</Selo>
                </td>
                <td className="px-3 py-2.5 tabular-nums">{num(s.participantes)}</td>
                <td className="px-3 py-2.5 truncate" title={s.ganhador?.email}>
                  {s.ganhador ? (
                    <>
                      <b className="text-ink">{s.ganhador.nome}</b> <span className="text-ink-dim">{s.ganhador.email}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2.5 truncate text-ink-mute">{textoEntrega(s.entrega)}</td>
              </tr>
            ))}
          </Tabela>
        ) : null}
      </Secao>
    </div>
  );
}

/** "1.234,56" → 123456 centavos (aceita vírgula ou ponto). Inválido: NaN. */
function centavosDe(texto: string): number {
  const t = texto.trim().replace(/\s/g, "").replace(/^R\$/i, "");
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return /^\d+(\.\d{1,2})?$/.test(normal) ? Math.round(Number(normal) * 100) : NaN;
}

function NovoSorteio({ onCriado }: { onCriado: (s: SorteioAdmin[]) => void }) {
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<TipoPremio>("plano");
  const [plano, setPlano] = useState<PlanoPago>("creator");
  const [meses, setMeses] = useState<number>(1);
  const [quantidade, setQuantidade] = useState("1000");
  const [valor, setValor] = useState("100,00");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const qtd = Number(quantidade.replace(/\D/g, ""));
  const centavos = centavosDe(valor);
  const premio: Premio | null =
    tipo === "plano"
      ? { tipo, plano, meses }
      : tipo === "pix"
        ? Number.isFinite(centavos) && centavos >= LIMITES_PREMIO.pix.min && centavos <= LIMITES_PREMIO.pix.max
          ? { tipo, centavos }
          : null
        : qtd >= LIMITES_PREMIO[tipo].min && qtd <= LIMITES_PREMIO[tipo].max
          ? { tipo, quantidade: qtd }
          : null;
  const limite =
    tipo === "pix"
      ? `de ${reais(LIMITES_PREMIO.pix.min)} a ${reais(LIMITES_PREMIO.pix.max)}`
      : tipo === "plano"
        ? ""
        : `de ${num(LIMITES_PREMIO[tipo].min)} a ${num(LIMITES_PREMIO[tipo].max)}`;

  async function criar() {
    if (!premio) return;
    setErro(null);
    setEnviando(true);
    try {
      const b = await acaoAdmin<{ sorteios: SorteioAdmin[] }>("/api/admin/sorteios", { titulo, premio });
      onCriado(b.sorteios);
      setTitulo("");
      avisarNaTela("Sorteio criado: as inscrições estão abertas.", { tom: "ok", href: "/app/sorteio" });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  const descricao =
    tipo === "plano"
      ? `O plano vale pelo tempo escolhido, sem renovação automática. Quem já tem plano pago recebe os créditos (${nomePremio({ tipo, plano, meses })} = ${num(creditosDoPresente(plano, meses))} créditos).`
      : tipo === "creditos"
        ? "Os créditos caem direto na conta do ganhador (como os de um pacote, valem 12 meses)."
        : tipo === "pontos"
          ? "Os pontos caem direto na conta do ganhador."
          : "O ganhador informa a chave Pix na página do sorteio; você paga à mão e marca como pago aqui.";

  return (
    <Secao titulo="Novo sorteio" descricao={descricao}>
      <div className="card grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_140px_minmax(0,300px)_auto] sm:items-end">
        <label className="grid gap-1.5">
          <span className="label-cap">Título</span>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80} placeholder="Ex.: Sorteio da live de sexta" />
        </label>
        <label className="grid gap-1.5">
          <span className="label-cap">Prêmio</span>
          <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoPremio)}>
            {(Object.keys(NOME_TIPO) as TipoPremio[]).map((t) => (
              <option key={t} value={t}>
                {NOME_TIPO[t]}
              </option>
            ))}
          </Select>
        </label>
        {tipo === "plano" ? (
          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
            <label className="grid gap-1.5">
              <span className="label-cap">Plano</span>
              <Select value={plano} onChange={(e) => setPlano(e.target.value as PlanoPago)}>
                {PLANOS_PAGOS.map((p) => (
                  <option key={p} value={p}>
                    {PLANOS[p].nome}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1.5">
              <span className="label-cap">Tempo</span>
              <Select value={meses} onChange={(e) => setMeses(Number(e.target.value))}>
                {MESES_PRESENTE.map((m) => (
                  <option key={m} value={m}>
                    {m} {m === 1 ? "mês" : "meses"}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        ) : tipo === "pix" ? (
          <label className="grid gap-1.5">
            <span className="label-cap">Valor (R$)</span>
            <Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="100,00" />
          </label>
        ) : (
          <label className="grid gap-1.5">
            <span className="label-cap">{tipo === "creditos" ? "Quantos créditos" : "Quantos pontos"}</span>
            <Input value={quantidade} onChange={(e) => setQuantidade(e.target.value)} inputMode="numeric" placeholder="1000" />
          </label>
        )}
        <Button variant="accent" className="min-h-[46px]" onClick={criar} disabled={enviando || titulo.trim().length < 3 || !premio}>
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Criar e abrir
        </Button>
        {!premio && tipo !== "plano" ? (
          <p className="text-[12px] text-pink sm:col-span-4">Valor fora do limite: {limite}.</p>
        ) : null}
        {erro ? <p className="text-[13px] text-pink sm:col-span-4">{erro}</p> : null}
      </div>
    </Secao>
  );
}

/**
 * Concluído: quem ganhou, o que recebeu e o atalho para o próximo sorteio. No
 * Pix, a chave que o ganhador informou (para copiar e pagar) e o "Marcar como pago".
 */
function Resultado({
  s,
  dados,
  onNovo,
  onPago,
  agindo,
}: {
  s: SorteioPublico;
  dados: Detalhe;
  onNovo: () => void;
  onPago: () => void;
  agindo: boolean;
}) {
  const vencedor = s.vencedor !== null ? s.corredores[s.vencedor] : null;
  const email = vencedor ? dados.participantes.find((p) => p.id === vencedor.id)?.email : null;
  const e = dados.entrega;
  const pixAPagar = e?.tipo === "pix" && !!e.chave && !e.pagoEm;
  return (
    <div className="card flex flex-wrap items-center gap-4 border-accent/40 p-4">
      <Trophy className="w-6 h-6 text-accent" />
      <div className="mr-auto grid gap-0.5 text-[13px]">
        <span className="text-ink">
          Ganhador: <b>{vencedor?.nome ?? "—"}</b> {email ? <span className="text-ink-dim">{email}</span> : null}
        </span>
        <span className="text-ink-mute">
          {e
            ? e.tipo === "pix"
              ? textoEntrega(e)
              : `Entregue: ${textoEntrega(e)}.`
            : "Prêmio não entregue (a conta do ganhador saiu ou a entrega falhou): libere pela aba Usuários."}
        </span>
      </div>
      {pixAPagar ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void navigator.clipboard.writeText(e.chave!).then(() => avisarNaTela("Chave Pix copiada.", { tom: "ok" }))
            }
          >
            <Copy className="w-4 h-4" /> Copiar chave
          </Button>
          <Button variant="accent" size="sm" onClick={onPago} disabled={agindo}>
            {agindo ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Marcar como pago
          </Button>
        </>
      ) : null}
      <Button variant={pixAPagar ? "ghost" : "accent"} size="sm" onClick={onNovo}>
        <Plus className="w-4 h-4" /> Novo sorteio
      </Button>
    </div>
  );
}

interface Detalhe {
  sorteio: SorteioPublico;
  participantes: ParticipanteAdmin[];
  entrega: Entrega | null;
}

function SorteioAtivo({ id, onMudou, onNovo }: { id: string; onMudou: () => void; onNovo: () => void }) {
  const { dados, erro, desvio, recarregar } = useSorteio<Detalhe>(`/api/admin/sorteios/${id}`, 2500);
  const [agindo, setAgindo] = useState<string | null>(null);
  const s = dados?.sorteio;

  // Mudou de fase (largou, concluiu…): a lista de baixo acompanha.
  const fase = useRef<string | null>(null);
  useEffect(() => {
    if (!s) return;
    if (fase.current && fase.current !== s.status) onMudou();
    fase.current = s.status;
  }, [s, onMudou]);

  async function agir(acao: string, extra: Record<string, unknown> = {}) {
    setAgindo(acao + (extra.participanteId ?? ""));
    try {
      await acaoAdmin(`/api/admin/sorteios/${id}`, { acao, ...extra });
      await recarregar();
      onMudou();
    } catch (e) {
      avisarNaTela((e as Error).message, { tom: "erro" });
    } finally {
      setAgindo(null);
    }
  }

  async function largar() {
    const ok = await confirmar({
      titulo: "Largar a corrida?",
      mensagem: `O ganhador é sorteado agora, entre os ${dados?.participantes.filter((p) => !p.removido).length ?? 0} participantes, e as inscrições fecham. A corrida começa em 5 segundos em todas as telas; o presente é entregue quando o ganhador cruzar a linha.`,
      confirmar: "Largar",
    });
    if (ok) await agir("largar");
  }

  async function cancelar() {
    const ok = await confirmar({
      titulo: "Cancelar o sorteio?",
      mensagem: "Ninguém ganha nada e o sorteio sai da tela de todos.",
      confirmar: "Cancelar sorteio",
      tom: "perigo",
    });
    if (ok) await agir("cancelar");
  }

  const linkUsuarios = typeof window === "undefined" ? "/app/sorteio" : `${location.origin}/app/sorteio`;
  function copiarUsuarios() {
    void navigator.clipboard.writeText(linkUsuarios).then(
      () => avisarNaTela("Link do sorteio copiado: mande na live, no grupo ou nas redes.", { tom: "ok" }),
      () => avisarNaTela(linkUsuarios, { tom: "ok" }),
    );
  }

  function copiarPalco() {
    const link = `${location.origin}/sorteio/palco#s=${id}&idioma=${idiomaAtual()}`;
    void navigator.clipboard.writeText(link).then(
      () => avisarNaTela("Link do palco copiado. No OBS: Fontes → + → Navegador, 1280×720.", { tom: "ok" }),
      () => avisarNaTela(link, { tom: "ok" }),
    );
  }

  if (!s) return erro ? <p className="text-[13px] text-pink">{erro}</p> : <Loader2 className="w-5 h-5 animate-spin text-ink-mute" />;

  const ativos = dados.participantes.filter((p) => !p.removido);
  const antesDaLargada = s.status === "aberto" || s.status === "fechado";

  return (
    <Secao
      titulo={s.titulo}
      descricao={`${nomePremio(s.premio)}${s.premio.tipo === "plano" ? " · sem renovação automática" : ""} · ${num(ativos.length)} ${ativos.length === 1 ? "participante" : "participantes"}`}
      acoes={<Selo tom={NOME_STATUS[s.status].tom}>{NOME_STATUS[s.status].texto}</Selo>}
    >
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-3">
          <div className="overflow-hidden rounded-2xl border border-line bg-black">
            <Corrida sorteio={s} desvio={desvio} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {s.status === "aberto" ? (
              <Button variant="ghost" size="sm" onClick={() => agir("fechar")} disabled={!!agindo}>
                <Lock className="w-4 h-4" /> Fechar inscrições
              </Button>
            ) : null}
            {s.status === "fechado" ? (
              <Button variant="ghost" size="sm" onClick={() => agir("reabrir")} disabled={!!agindo}>
                <LockOpen className="w-4 h-4" /> Reabrir inscrições
              </Button>
            ) : null}
            {antesDaLargada ? (
              <>
                <Button variant="accent" size="sm" onClick={largar} disabled={!!agindo || !ativos.length}>
                  {agindo === "largar" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
                  Largar a corrida
                </Button>
                <Button variant="danger" size="sm" onClick={cancelar} disabled={!!agindo}>
                  <X className="w-4 h-4" /> Cancelar
                </Button>
              </>
            ) : null}
            <Button variant="ghost" size="sm" onClick={copiarPalco}>
              <Copy className="w-4 h-4" /> Link do palco (OBS)
            </Button>
          </div>
          {/* O link que vai para os usuários (na live, no grupo, nas redes): quem não está logado entra e volta para cá. */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-[13px]">
            <span className="label-cap">Link para os usuários</span>
            <a href="/app/sorteio" target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 truncate font-semibold text-accent hover:underline">
              {linkUsuarios} <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </a>
            <Button variant="accent" size="sm" className="ml-auto" onClick={copiarUsuarios}>
              <Copy className="w-4 h-4" /> Copiar
            </Button>
          </div>
          {s.status === "correndo" ? (
            <p className="text-[12px] text-ink-mute">A corrida está rodando em todas as telas. O presente é entregue quando o ganhador cruzar a linha.</p>
          ) : null}
          {s.status === "concluido" ? (
            <Resultado
              s={s}
              dados={dados}
              onNovo={onNovo}
              agindo={agindo === "pix_pago"}
              onPago={async () => {
                const e = dados.entrega;
                const ok = await confirmar({
                  titulo: "Marcar o Pix como pago?",
                  mensagem: `Confirme que você já transferiu ${e?.tipo === "pix" ? reais(e.centavos) : "o valor"} para a chave ${e?.tipo === "pix" ? e.chave : ""}. O ganhador recebe o aviso de pagamento.`,
                  confirmar: "Já paguei",
                });
                if (ok) await agir("pix_pago");
              }}
            />
          ) : null}
        </div>

        <div className="card grid content-start gap-2 p-4">
          <span className="label-cap flex items-center gap-2">
            <Trophy className="w-4 h-4 text-accent" /> Participantes · {num(ativos.length)}
          </span>
          {!dados.participantes.length ? (
            <p className="text-[13px] text-ink-mute">Ninguém entrou ainda. Divulgue o sorteio na live mandando o link para os usuários (o sorteio não aparece no menu).</p>
          ) : (
            <ul className="grid max-h-[460px] gap-1 overflow-y-auto pr-1">
              {dados.participantes.map((p) => (
                <li key={p.id} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-[13px] hover:bg-panel">
                  <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-panel">
                    {p.foto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.foto} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className={p.removido ? "text-ink-dim line-through" : "text-ink"}>{p.nome}</b>
                    <span className="block truncate text-[11px] text-ink-dim">{p.email}</span>
                  </span>
                  {antesDaLargada && !p.removido ? (
                    <button
                      type="button"
                      title="Tirar do sorteio"
                      onClick={() => agir("remover", { participanteId: p.id })}
                      disabled={!!agindo}
                      className="grid h-7 w-7 place-items-center rounded-full text-ink-dim hover:bg-pink/10 hover:text-pink cursor-pointer"
                    >
                      {agindo === `remover${p.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Secao>
  );
}

"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Loader2, Minus, Plus, X } from "lucide-react";
import type { DetalheUsuario, UsuarioAdmin } from "@/lib/admin/consultas";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { confirmar } from "@/components/ui/Confirmacao";
import { PLANOS } from "@/lib/planos";
import {
  acaoAdmin,
  Avatar,
  Busca,
  bytes,
  Copiavel,
  dia,
  diaHora,
  dinheiro,
  Estado,
  Filtros,
  haQuanto,
  NOME_PLANO,
  nomeMotivo,
  num,
  Secao,
  SeloPlano,
  Tabela,
  useAdmin,
  useAtrasado,
} from "./partes";
import { descricaoCompra, Meio, SeloStatus } from "./Pagamentos";

type FiltroPlano = "" | "gratis" | "starter" | "creator" | "studio";

export function Usuarios({
  aberto,
  abrir,
}: {
  aberto: string | null;
  abrir: (id: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const [plano, setPlano] = useState<FiltroPlano>("");
  const busca = useAtrasado(q);
  const params = new URLSearchParams();
  if (busca) params.set("q", busca);
  if (plano) params.set("plano", plano);
  const { dados, erro, carregando, recarregar } = useAdmin<{
    usuarios: UsuarioAdmin[];
  }>(`/api/admin/usuarios?${params}`);
  const usuarios = dados?.usuarios ?? [];

  return (
    <Secao
      titulo="Usuários"
      descricao="Clique em um usuário para ver a ficha, o extrato e liberar plano ou créditos."
    >
      <div className="flex gap-2 flex-wrap items-center">
        <Busca valor={q} onChange={setQ} placeholder="Nome, e-mail ou id" />
        <Filtros<FiltroPlano>
          rotulo="Plano"
          valor={plano}
          onChange={setPlano}
          opcoes={[
            { id: "", rotulo: "Todos" },
            { id: "gratis", rotulo: "Grátis" },
            { id: "starter", rotulo: "Starter" },
            { id: "creator", rotulo: "Creator" },
            { id: "studio", rotulo: "Studio" },
          ]}
        />
      </div>
      <Estado
        carregando={carregando}
        erro={erro}
        vazio={!usuarios.length}
        textoVazio="Nenhum usuário com esses filtros."
      />
      {usuarios.length ? (
        <Tabela
          colunas={[
            "Usuário",
            "Plano",
            "Créditos",
            "Gasto 30d",
            "Personagens",
            "Acesso",
            "",
          ]}
          larguras={["", 124, 88, 96, 112, 120, 36]}
          minimo={716}
        >
          {usuarios.map((u) => (
            <tr
              key={u.id}
              onClick={() => abrir(u.id)}
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && abrir(u.id)}
              className={cn(
                "cursor-pointer transition hover:bg-panel/60 focus:outline-none focus:bg-panel/60",
                aberto === u.id && "bg-panel",
              )}
            >
              <td className="px-3 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar nome={u.nome || u.email} imagem={u.imagem} />
                  <div className="min-w-0">
                    <div className="text-ink font-semibold truncate">
                      {u.nome || "Sem nome"}
                    </div>
                    <div className="text-[12px] text-ink-mute truncate">
                      {u.email}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-3">
                <SeloPlano
                  plano={u.plano}
                  ativo={u.plano === "gratis" || u.planoAtivo}
                />
                {u.planoAtivo && u.planoExpiraEm ? (
                  <div className="text-[11px] text-ink-dim mt-0.5">
                    até {dia(u.planoExpiraEm)}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-3 text-ink font-semibold tabular-nums">
                {num(u.creditosPlano + u.creditosAvulsos)}
              </td>
              <td className="px-3 py-3 text-ink-mute tabular-nums">
                {num(u.gastos30)}
              </td>
              <td className="px-3 py-3 text-ink-mute tabular-nums">
                {num(u.personagens)}
              </td>
              <td className="px-3 py-3">
                <div className="text-ink-mute truncate">
                  {haQuanto(u.ultimoAcesso)}
                </div>
                <div className="text-[11px] text-ink-dim truncate">
                  desde {dia(u.criadoEm)}
                </div>
              </td>
              <td className="px-3 py-3 text-ink-dim">
                <ChevronRight className="w-4 h-4" />
              </td>
            </tr>
          ))}
        </Tabela>
      ) : null}
      {aberto ? (
        <FichaUsuario
          id={aberto}
          onClose={() => abrir(null)}
          onMudou={recarregar}
        />
      ) : null}
    </Secao>
  );
}

/* ---------- ficha lateral ---------- */

function FichaUsuario({
  id,
  onClose,
  onMudou,
}: {
  id: string;
  onClose: () => void;
  onMudou: () => void;
}) {
  const { dados, erro, carregando, setDados } = useAdmin<DetalheUsuario>(
    `/api/admin/usuarios/${id}`,
  );
  const [aba, setAba] = useState<"extrato" | "pagamentos" | "personagens">(
    "extrato",
  );
  const [agindo, setAgindo] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  async function executar(corpo: Record<string, unknown>, feito: string) {
    setAgindo(true);
    setErroAcao(null);
    setAviso(null);
    try {
      setDados(
        await acaoAdmin<DetalheUsuario>(`/api/admin/usuarios/${id}`, corpo),
      );
      setAviso(feito);
      onMudou();
    } catch (e) {
      setErroAcao((e as Error).message);
    } finally {
      setAgindo(false);
    }
  }

  const u = dados?.usuario;
  const semBarra = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "h-full w-full max-w-xl bg-bg border-l border-line overflow-y-auto",
          semBarra,
        )}
      >
        <header className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-line px-5 py-4 flex items-center gap-3">
          {u ? (
            <Avatar
              nome={u.nome || u.email}
              imagem={u.imagem}
              tamanho="h-10 w-10"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold text-ink truncate">
              {u ? u.nome || "Sem nome" : "Carregando…"}
            </div>
            {u ? (
              <div className="text-[12px] text-ink-mute truncate">
                {u.email}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="h-9 w-9 rounded-full border border-line grid place-items-center text-ink-mute hover:text-ink hover:border-ink shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {!dados || !u ? (
          <div className="p-5">
            <Estado
              carregando={carregando || !erro}
              erro={erro}
              vazio
              textoVazio=""
            />
          </div>
        ) : (
          <div className="p-5 grid gap-6">
            <div className="grid grid-cols-2 gap-3">
              <Mini rotulo="Plano">
                <SeloPlano
                  plano={u.plano}
                  ativo={u.plano === "gratis" || u.planoAtivo}
                />
                <div className="text-[12px] text-ink-mute mt-1.5">
                  {u.planoAtivo && u.planoExpiraEm
                    ? `${u.intervalo === "anual" ? "Anual" : "Mensal"} · até ${dia(u.planoExpiraEm)}`
                    : "Sem plano pago"}
                  {u.assinaturaStripe ? " · assinatura no Stripe" : ""}
                </div>
              </Mini>
              <Mini rotulo="Créditos">
                <div className="text-xl font-bold text-ink tabular-nums">
                  {num(u.creditosPlano + u.creditosAvulsos)}
                </div>
                <div className="text-[12px] text-ink-mute">
                  {num(u.creditosPlano)} do plano · {num(u.creditosAvulsos)}{" "}
                  avulsos
                </div>
              </Mini>
              <Mini rotulo="Já pagou">
                <div className="text-[14px] font-semibold text-ink">
                  {u.pago.length
                    ? u.pago.map((p) => dinheiro(p.total, p.moeda)).join(" + ")
                    : "Nada ainda"}
                </div>
                <div className="text-[12px] text-ink-mute">
                  {num(u.gastos30)} créditos gastos em 30 dias
                </div>
              </Mini>
              <Mini rotulo="Conta">
                <div className="text-[13px] text-ink">
                  Entrou em {dia(u.criadoEm)}
                </div>
                <div className="text-[12px] text-ink-mute">
                  Último acesso {haQuanto(u.ultimoAcesso)} ·{" "}
                  {bytes(u.armazenamentoBytes)}
                </div>
                <div className="mt-1">
                  <Copiavel texto={u.id} />
                </div>
              </Mini>
            </div>

            <Acoes u={u} agindo={agindo} executar={executar} />
            {erroAcao ? (
              <div className="rounded-xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink">
                {erroAcao}
              </div>
            ) : null}
            {aviso ? (
              <div
                className="rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok"
                role="status"
              >
                {aviso}
              </div>
            ) : null}

            <div className="grid gap-3">
              <Filtros
                rotulo="O que ver"
                valor={aba}
                onChange={setAba}
                opcoes={[
                  {
                    id: "extrato",
                    rotulo: "Extrato",
                    n: dados.movimentos.length,
                  },
                  {
                    id: "pagamentos",
                    rotulo: "Pagamentos",
                    n: dados.pagamentos.length,
                  },
                  {
                    id: "personagens",
                    rotulo: "Personagens",
                    n: dados.personagens.length,
                  },
                ]}
              />
              {aba === "extrato" &&
                (dados.movimentos.length ? (
                  <div className="card divide-y divide-line">
                    {dados.movimentos.map((m) => (
                      <div
                        key={m.id}
                        className="px-4 py-2.5 flex items-center gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] text-ink">
                            {nomeMotivo(m.motivo)}
                          </div>
                          <div className="text-[11px] text-ink-dim truncate">
                            {diaHora(m.quando)}
                            {m.ref ? ` · ${m.ref}` : ""}
                          </div>
                        </div>
                        <span
                          className={cn(
                            "text-[13px] font-bold tabular-nums shrink-0",
                            m.delta > 0
                              ? "text-ok"
                              : m.delta < 0
                                ? "text-ink"
                                : "text-ink-dim",
                          )}
                        >
                          {m.delta > 0 ? "+" : ""}
                          {num(m.delta)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Vazio>Sem movimentos.</Vazio>
                ))}
              {aba === "pagamentos" &&
                (dados.pagamentos.length ? (
                  <div className="card divide-y divide-line">
                    {dados.pagamentos.map((p) => (
                      <div
                        key={p.id}
                        className="px-4 py-2.5 flex items-center gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] text-ink">
                            {descricaoCompra(p)}
                          </div>
                          <div className="text-[11px] text-ink-dim">
                            {diaHora(p.pagoEm ?? p.criadoEm)} · <Meio p={p} />
                          </div>
                        </div>
                        <SeloStatus status={p.status} />
                        <span className="text-[13px] font-bold text-ink tabular-nums shrink-0">
                          {dinheiro(p.valor, p.moeda)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Vazio>Nenhum pagamento.</Vazio>
                ))}
              {aba === "personagens" &&
                (dados.personagens.length ? (
                  <div className="card divide-y divide-line">
                    {dados.personagens.map((c) => (
                      <div
                        key={c.id}
                        className="px-4 py-2.5 flex items-center gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] text-ink truncate">
                            {c.nome}
                          </div>
                          <div className="text-[11px] text-ink-dim">
                            Atualizado em {dia(c.atualizadoEm)}
                          </div>
                        </div>
                        <span className="text-[12px] text-ink-mute whitespace-nowrap">
                          {num(c.imagens)} imagens · {num(c.videos)} vídeos
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Vazio>Nenhum personagem.</Vazio>
                ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function Mini({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-3.5 min-w-0">
      <div className="label-cap mb-1.5">{rotulo}</div>
      {children}
    </div>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <div className="card p-6 text-center text-[13px] text-ink-mute">
      {children}
    </div>
  );
}

/* ---------- ações: plano e créditos ---------- */

const PLANOS_PAGOS = ["starter", "creator", "studio"] as const;
const PRAZOS = [
  { meses: 1, rotulo: "1 mês" },
  { meses: 3, rotulo: "3 meses" },
  { meses: 12, rotulo: "1 ano" },
];

function Acoes({
  u,
  agindo,
  executar,
}: {
  u: UsuarioAdmin;
  agindo: boolean;
  executar: (corpo: Record<string, unknown>, feito: string) => Promise<void>;
}) {
  const [plano, setPlano] = useState<(typeof PLANOS_PAGOS)[number]>(
    PLANOS_PAGOS.includes(u.plano as never)
      ? (u.plano as (typeof PLANOS_PAGOS)[number])
      : "creator",
  );
  const [meses, setMeses] = useState(1);
  const [sinal, setSinal] = useState<1 | -1>(1);
  const [qtd, setQtd] = useState("500");
  const [nota, setNota] = useState("");
  const quantidade = Math.floor(Number(qtd));
  const qtdValida =
    Number.isFinite(quantidade) && quantidade > 0 && quantidade <= 1_000_000;
  const saldo = u.creditosPlano + u.creditosAvulsos;
  const rotuloPrazo = PRAZOS.find((p) => p.meses === meses)!.rotulo;
  const renovando = u.planoAtivo && u.plano === plano;

  async function liberar() {
    const ok = await confirmar({
      titulo: renovando
        ? `Estender o ${NOME_PLANO[plano]} por ${rotuloPrazo}?`
        : `Liberar o ${NOME_PLANO[plano]} por ${rotuloPrazo}?`,
      mensagem: renovando
        ? `${u.email} já está no ${NOME_PLANO[plano]}: a validade é somada ao que ele já tem. Sem cobrança.`
        : `${u.email} passa para o ${NOME_PLANO[plano]} agora, com ${num(PLANOS[plano].creditos)} créditos do plano por mês. Sem cobrança.`,
      confirmar: renovando ? "Estender" : "Liberar plano",
    });
    if (ok)
      await executar(
        { acao: "plano", plano, meses, nota: nota || undefined },
        `Plano ${NOME_PLANO[plano]} liberado por ${rotuloPrazo}.`,
      );
  }

  async function ajustar() {
    const tirar = sinal === -1;
    const ok = await confirmar({
      titulo: tirar
        ? `Tirar ${num(quantidade)} créditos?`
        : `Dar ${num(quantidade)} créditos?`,
      mensagem: tirar
        ? `Sai do saldo de ${u.email} (primeiro do plano, depois dos avulsos). Fica no extrato dele.`
        : `Entram como créditos avulsos de ${u.email}, válidos por 12 meses. Fica no extrato dele.`,
      confirmar: tirar ? "Tirar créditos" : "Dar créditos",
      tom: tirar ? "perigo" : "normal",
    });
    if (ok)
      await executar(
        {
          acao: "creditos",
          quantidade: sinal * quantidade,
          nota: nota || undefined,
        },
        tirar
          ? `${num(quantidade)} créditos retirados.`
          : `${num(quantidade)} créditos adicionados.`,
      );
  }

  async function remover() {
    const ok = await confirmar({
      titulo: "Remover o plano agora?",
      mensagem: `${u.email} volta para o Grátis e perde os ${num(u.creditosPlano)} créditos do plano. Os avulsos ficam.`,
      confirmar: "Remover plano",
      tom: "perigo",
    });
    if (ok)
      await executar(
        { acao: "remover-plano", nota: nota || undefined },
        "Plano removido.",
      );
  }

  const pilula = (ativo: boolean) =>
    cn(
      "h-8 px-3 rounded-full text-[12px] font-semibold border transition",
      ativo
        ? "bg-accent text-bg border-accent"
        : "border-line text-ink-mute hover:text-ink hover:border-line-strong",
    );

  return (
    <div className="card p-4 grid gap-5">
      <div className="grid gap-2.5">
        <div className="text-[13px] font-semibold text-ink">
          Liberar plano (cortesia)
        </div>
        <div
          className="flex gap-1.5 flex-wrap"
          role="radiogroup"
          aria-label="Plano"
        >
          {PLANOS_PAGOS.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={plano === p}
              onClick={() => setPlano(p)}
              className={pilula(plano === p)}
            >
              {NOME_PLANO[p]}
            </button>
          ))}
          <span className="w-px bg-line mx-1" aria-hidden />
          {PRAZOS.map((p) => (
            <button
              key={p.meses}
              type="button"
              onClick={() => setMeses(p.meses)}
              aria-pressed={meses === p.meses}
              className={pilula(meses === p.meses)}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="accent"
            onClick={liberar}
            disabled={agindo}
          >
            {agindo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {renovando ? "Estender plano" : "Liberar plano"}
          </Button>
          {u.plano !== "gratis" ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={remover}
              disabled={agindo}
            >
              Remover plano
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2.5 border-t border-line pt-4">
        <div className="text-[13px] font-semibold text-ink">
          Ajustar créditos
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex border border-line rounded-full p-0.5 bg-panel">
            <button
              type="button"
              onClick={() => setSinal(1)}
              aria-pressed={sinal === 1}
              className={cn(
                "h-8 px-3 rounded-full text-[12px] font-semibold inline-flex items-center gap-1",
                sinal === 1 ? "bg-card text-ink" : "text-ink-mute",
              )}
            >
              <Plus className="w-3.5 h-3.5" /> Dar
            </button>
            <button
              type="button"
              onClick={() => setSinal(-1)}
              aria-pressed={sinal === -1}
              className={cn(
                "h-8 px-3 rounded-full text-[12px] font-semibold inline-flex items-center gap-1",
                sinal === -1 ? "bg-card text-ink" : "text-ink-mute",
              )}
            >
              <Minus className="w-3.5 h-3.5" /> Tirar
            </button>
          </div>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
            aria-label="Quantidade de créditos"
            className="h-9 w-28 rounded-xl border border-line bg-bg px-3 text-ink font-bold mono text-[13px] focus:outline-none focus:border-accent"
          />
          {[100, 500, 1000].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setQtd(String(v))}
              className="h-8 px-2.5 rounded-full border border-line text-[12px] font-semibold text-ink-mute hover:text-ink"
            >
              {num(v)}
            </button>
          ))}
        </div>
        {sinal === -1 && qtdValida && quantidade > saldo ? (
          <p className="text-[12px] text-pink">
            O saldo dele é {num(saldo)} — não dá para tirar mais do que isso.
          </p>
        ) : null}
        <div>
          <Button
            size="sm"
            onClick={ajustar}
            disabled={
              agindo || !qtdValida || (sinal === -1 && quantidade > saldo)
            }
          >
            {sinal === 1 ? "Dar créditos" : "Tirar créditos"}
          </Button>
        </div>
      </div>

      <label className="grid gap-1.5 border-t border-line pt-4">
        <span className="text-[12px] text-ink-mute">
          Nota (opcional) — aparece no extrato junto com o seu e-mail
        </span>
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          maxLength={80}
          placeholder="Ex.: cortesia parceria, reembolso do pedido #123"
          className="h-9 rounded-xl border border-line bg-bg px-3 text-[13px] text-ink placeholder:text-ink-dim focus:outline-none focus:border-accent"
        />
      </label>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Check, ExternalLink, Loader2, RefreshCw, XCircle,
  Undo2,
} from "lucide-react";
import type { PagamentoAdmin } from "@/lib/admin/consultas";
import { confirmar } from "@/components/ui/Confirmacao";
import { PACOTES, type PacoteId } from "@/lib/planos";
import {
  acaoAdmin,
  Busca,
  Copiavel,
  diaHora,
  dinheiro,
  Estado,
  Filtros,
  linkExplorer,
  NOME_PLANO,
  num,
  Secao,
  Selo,
  Tabela,
  useAdmin,
  useAtrasado,
} from "./partes";

type Status = "" | "pago" | "pendente" | "expirado";
type Provedor = "" | "stripe" | "usdc";

const NOME_REDE: Record<string, string> = {
  solana: "Solana",
  base: "Base",
  arbitrum: "Arbitrum",
  bnb: "BNB Chain",
  ethereum: "Ethereum",
};

/** O que foi comprado, em uma linha. */
export function descricaoCompra(p: PagamentoAdmin): string {
  if (p.tipo === "plano")
    return `Plano ${NOME_PLANO[p.plano ?? ""] ?? p.plano} · ${p.intervalo === "anual" ? "anual" : "mensal"}`;
  if (p.tipo === "avulso") return `${num(p.creditos ?? 0)} créditos`;
  // Pacote: mostra a quantidade ("500 créditos") em vez do código interno ("p500").
  const pacote = PACOTES[p.pacote as PacoteId];
  return pacote
    ? `${num(pacote.creditos)} créditos`
    : `Pacote ${p.pacote ?? ""}`.trim();
}

export function SeloStatus({ status }: { status: string }) {
  if (status === "pago") return <Selo tom="ok">Pago</Selo>;
  if (status === "pendente") return <Selo tom="alerta">Pendente</Selo>;
  if (status === "estornado") return <Selo>Reembolsado</Selo>;
  return <Selo>{status === "expirado" ? "Expirado" : status}</Selo>;
}

export function Meio({ p }: { p: PagamentoAdmin }) {
  return (
    <span className="text-ink-mute whitespace-nowrap">
      {p.provedor === "stripe"
        ? "Stripe"
        : `USDC · ${NOME_REDE[p.rede ?? "solana"] ?? p.rede}`}
    </span>
  );
}

export function Pagamentos({
  abrirUsuario,
}: {
  abrirUsuario: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status>("");
  const [provedor, setProvedor] = useState<Provedor>("");
  const busca = useAtrasado(q);
  const params = new URLSearchParams();
  if (busca) params.set("q", busca);
  if (status) params.set("status", status);
  if (provedor) params.set("provedor", provedor);
  const { dados, erro, carregando, recarregar } = useAdmin<{
    itens: PagamentoAdmin[];
    totais: Array<{ status: string; n: number }>;
  }>(`/api/admin/pagamentos?${params}`);
  const [agindo, setAgindo] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  const total = (s: string) =>
    dados?.totais.find((t) => t.status === s)?.n ?? 0;
  const todos = dados?.totais.reduce((t, x) => t + x.n, 0) ?? 0;

  async function agir(
    p: PagamentoAdmin,
    acao: "aprovar" | "expirar" | "reembolsar",
  ) {
    const ok = await confirmar(
      acao === "reembolsar"
        ? {
            titulo: "Reembolsar esta compra?",
            mensagem:
              p.provedor === "stripe"
                ? `${descricaoCompra(p)} de ${p.email ?? p.userId} — ${dinheiro(p.valor, p.moeda)}. O valor volta pelo Stripe e o plano ou os créditos da compra saem da conta agora. Não dá para desfazer.`
                : `${descricaoCompra(p)} de ${p.email ?? p.userId} — ${dinheiro(p.valor, p.moeda)}. O plano ou os créditos da compra saem da conta agora. O USDC NÃO é enviado sozinho: mande ${dinheiro(p.valor, p.moeda)} para a carteira de quem pagou${p.pagador ? ` (${p.pagador})` : ""}.`,
            confirmar: "Reembolsar",
            tom: "perigo",
          }
        : acao === "aprovar"
          ? {
              titulo: "Aprovar este pagamento à mão?",
              mensagem: `${descricaoCompra(p)} para ${p.email ?? p.userId} — ${dinheiro(p.valor, p.moeda)}. A compra é aplicada agora (plano ou créditos), sem conferir na rede. Use só se você confirmou o recebimento.`,
              confirmar: "Aprovar e aplicar",
            }
          : {
              titulo: "Encerrar esta cobrança?",
              mensagem:
                "Ela passa para expirada e não pode mais ser paga. Nenhum saldo é alterado.",
              confirmar: "Encerrar",
              tom: "perigo",
            },
    );
    if (!ok) return;
    setAgindo(p.id);
    setErroAcao(null);
    try {
      await acaoAdmin(`/api/admin/pagamentos/${encodeURIComponent(p.id)}`, {
        acao,
      });
      recarregar();
    } catch (e) {
      setErroAcao((e as Error).message);
    } finally {
      setAgindo(null);
    }
  }

  return (
    <Secao
      titulo="Pagamentos"
      descricao="Stripe e USDC, mais recentes primeiro (até 200). Busque por e-mail, id, hash da transação ou carteira."
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
      <div className="flex gap-2 flex-wrap items-center">
        <Busca
          valor={q}
          onChange={setQ}
          placeholder="E-mail, id, hash ou carteira"
        />
        <Filtros<Status>
          rotulo="Status"
          valor={status}
          onChange={setStatus}
          opcoes={[
            { id: "", rotulo: "Todos", n: todos },
            { id: "pago", rotulo: "Pagos", n: total("pago") },
            { id: "pendente", rotulo: "Pendentes", n: total("pendente") },
            { id: "expirado", rotulo: "Expirados", n: total("expirado") },
          ]}
        />
        <Filtros<Provedor>
          rotulo="Meio de pagamento"
          valor={provedor}
          onChange={setProvedor}
          opcoes={[
            { id: "", rotulo: "Tudo" },
            { id: "stripe", rotulo: "Stripe" },
            { id: "usdc", rotulo: "USDC" },
          ]}
        />
      </div>
      {erroAcao ? (
        <div className="rounded-xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink">
          {erroAcao}
        </div>
      ) : null}
      <Estado
        carregando={carregando}
        erro={erro}
        vazio={!dados?.itens.length}
        textoVazio="Nenhum pagamento com esses filtros."
      />
      {dados?.itens.length ? (
        <Tabela
          colunas={["Usuário", "Compra", "Valor", "Status", "Transação", ""]}
          larguras={["", 170, 104, 110, 120, 92]}
          minimo={730}
        >
          {dados.itens.map((p) => {
            const link = linkExplorer(p.rede, p.assinatura);
            return (
              <tr key={p.id} className="hover:bg-panel/60 transition">
                <td className="px-3 py-3">
                  <button
                    type="button"
                    onClick={() => abrirUsuario(p.userId)}
                    className="text-ink font-semibold hover:text-accent truncate block max-w-full text-left"
                    title={`${p.email ?? "usuário removido"} — abrir a ficha`}
                  >
                    {p.email ?? "usuário removido"}
                  </button>
                  <div className="text-[12px] text-ink-dim truncate">
                    {diaHora(p.pagoEm ?? p.criadoEm)}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="text-ink truncate" title={descricaoCompra(p)}>
                    {descricaoCompra(p)}
                  </div>
                  <div className="text-[12px] truncate">
                    <Meio p={p} />
                  </div>
                </td>
                <td className="px-3 py-3 text-ink font-semibold tabular-nums whitespace-nowrap">
                  {dinheiro(p.valor, p.moeda)}
                </td>
                <td className="px-3 py-3">
                  <SeloStatus status={p.status} />
                  {p.status === "pago" ? (
                    <div
                      className={
                        p.reembolso.pode
                          ? "mt-1 text-[11px] text-ok"
                          : "mt-1 text-[11px] text-ink-dim"
                      }
                      title={p.reembolso.motivo ?? undefined}
                    >
                      {p.reembolso.pode
                        ? `Reembolsável até ${new Date(p.reembolso.ate!).toLocaleDateString("pt-BR")}`
                        : p.reembolso.usados > 0
                          ? `Sem reembolso · usou ${num(p.reembolso.usados)} créditos`
                          : "Sem reembolso · passou de 7 dias"}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-3 truncate">
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline"
                    >
                      Ver na rede <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : p.assinatura?.startsWith("manual:") ? (
                    <span
                      className="text-[12px] text-ink-dim"
                      title={p.assinatura}
                    >
                      aprovado à mão
                    </span>
                  ) : (
                    <Copiavel texto={p.id} curto={6} />
                  )}
                  {p.pagador ? (
                    <div className="mt-0.5">
                      <Copiavel texto={p.pagador} curto={6} />
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  {p.status !== "pago" ? (
                    <div className="flex gap-1 justify-end">
                      {agindo === p.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-ink-mute" />
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => agir(p, "aprovar")}
                            title="Aprovar à mão e aplicar a compra"
                            aria-label="Aprovar à mão"
                            className="h-8 w-8 rounded-full border border-line grid place-items-center text-ink-mute hover:text-ok hover:border-ok/50"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          {p.status === "pendente" ? (
                            <button
                              type="button"
                              onClick={() => agir(p, "expirar")}
                              title="Encerrar a cobrança"
                              aria-label="Encerrar a cobrança"
                              className="h-8 w-8 rounded-full border border-line grid place-items-center text-ink-mute hover:text-pink hover:border-pink/50"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  ) : p.reembolso.pode ? (
                    <div className="flex justify-end">
                      {agindo === p.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-ink-mute" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => agir(p, "reembolsar")}
                          title="Reembolsar: devolve o valor e tira a compra da conta"
                          aria-label="Reembolsar"
                          className="h-8 w-8 rounded-full border border-line grid place-items-center text-ink-mute hover:text-pink hover:border-pink/50"
                        >
                          <Undo2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </Tabela>
      ) : null}
    </Secao>
  );
}

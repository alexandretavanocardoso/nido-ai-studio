"use client";

import { useState } from "react";
import { Loader2, RefreshCw, Undo2, Wrench } from "lucide-react";
import type {
  ComissaoAdmin,
  IndicacoesAdmin,
  SaqueAdmin,
} from "@/lib/indicacao/admin";
import { confirmar } from "@/components/ui/Confirmacao";
import { avisarNaTela } from "@/lib/notificar";
import {
  acaoAdmin,
  Copiavel,
  diaHora,
  dinheiro as dinheiroBase,
  Estado,
  linkExplorer,
  NOME_PLANO,
  Secao,
  Selo,
  Tabela,
  useAdmin,
} from "./partes";

/** USDC não é moeda de banco: mostra o número com a sigla. */
const dinheiro = (v: number, moeda: string) =>
  moeda === "USDC"
    ? `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`
    : dinheiroBase(v, moeda);

const NOME_REDE: Record<string, string> = {
  solana: "Solana",
  base: "Base",
  arbitrum: "Arbitrum",
  bnb: "BNB Chain",
  ethereum: "Ethereum",
};

function SeloComissao({ c }: { c: ComissaoAdmin }) {
  if (c.status === "disponivel")
    return c.emCarencia ? (
      <Selo tom="alerta">Em carência</Selo>
    ) : (
      <Selo tom="ok">Disponível</Selo>
    );
  if (c.status === "sacada") return <Selo>Sacada</Selo>;
  if (c.status === "estorno_devido")
    return <Selo tom="erro">Estornada · a descontar</Selo>;
  if (c.status === "estorno_quitado")
    return <Selo tom="erro">Estornada · descontada</Selo>;
  return <Selo tom="erro">Estornada</Selo>;
}

function SeloSaque({ s }: { s: SaqueAdmin }) {
  if (s.status === "pago") return <Selo tom="ok">Enviado</Selo>;
  if (s.status === "falhou") return <Selo tom="erro">Falhou</Selo>;
  return <Selo tom="alerta">Processando</Selo>;
}

/** Aba Indicações: totais por moeda, quem indica, comissões e saques. */
export function Indicacoes({
  abrirUsuario,
}: {
  abrirUsuario: (id: string) => void;
}) {
  const { dados, erro, carregando, recarregar } = useAdmin<IndicacoesAdmin>(
    "/api/admin/indicacoes",
  );
  const [agindo, setAgindo] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  async function agir(id: string, corpo: unknown, depois?: (r: unknown) => void) {
    setAgindo(id);
    setErroAcao(null);
    try {
      depois?.(await acaoAdmin("/api/admin/indicacoes", corpo));
      recarregar();
    } catch (e) {
      setErroAcao((e as Error).message);
    } finally {
      setAgindo(null);
    }
  }

  async function estornar(c: ComissaoAdmin) {
    const ok = await confirmar({
      titulo: "Estornar esta comissão?",
      mensagem:
        c.status === "sacada"
          ? `${dinheiro(c.valor, c.moeda)} de ${c.indicadorEmail ?? c.indicadorId} já foram sacados: o valor vira uma dívida, descontada do próximo saque dele. Não dá para desfazer.`
          : `${dinheiro(c.valor, c.moeda)} saem do saldo de ${c.indicadorEmail ?? c.indicadorId}. Não dá para desfazer.`,
      confirmar: "Estornar",
      tom: "perigo",
    });
    if (ok) agir(c.id, { acao: "estornar", comissaoId: c.id });
  }

  async function resolver(s: SaqueAdmin) {
    const ok = await confirmar({
      titulo: s.rede
        ? "Conferir este saque na rede?"
        : "Conferir este saque no Stripe?",
      mensagem: s.rede
        ? "Se a transação foi confirmada, o saque é marcado como enviado. Se reverteu, ou se não entrou na rede depois de 15 minutos do pedido, ele é marcado como falho e o valor volta para o saldo do usuário."
        : "Se a transferência saiu, o saque é marcado como enviado. Se não saiu, ele é marcado como falho e o valor volta para o saldo do usuário.",
      confirmar: "Conferir",
    });
    if (ok)
      agir(s.id, { acao: "resolver_saque", saqueId: s.id }, (r) =>
        avisarNaTela(
          (r as { resultado: string }).resultado === "pago"
            ? "A transferência tinha saído: saque marcado como enviado."
            : "A transferência não saiu: saldo devolvido ao usuário.",
        ),
      );
  }

  const usuario = (id: string, email: string | null) => (
    <button
      type="button"
      onClick={() => abrirUsuario(id)}
      className="text-ink font-semibold hover:text-accent truncate block max-w-full text-left"
      title={`${email ?? "usuário removido"} — abrir a ficha`}
    >
      {email ?? "usuário removido"}
    </button>
  );

  return (
    <div className="grid gap-8">
      <Secao
        titulo="Indicações"
        descricao="Quem indica ganha 10% de cada assinatura paga pelo indicado, por até 12 meses. BRL e USD saem pelo Stripe Connect; USDC sai on-chain, da carteira de saques."
        acoes={
          <button
            type="button"
            onClick={recarregar}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-mute hover:text-ink"
          >
            <RefreshCw
              className={
                carregando ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5"
              }
            />{" "}
            Atualizar
          </button>
        }
      >
        {erroAcao ? (
          <div className="rounded-xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink">
            {erroAcao}
          </div>
        ) : null}
        <Estado
          carregando={carregando}
          erro={erro}
          vazio={!dados}
          textoVazio="Sem dados."
        />
        {dados ? (
          dados.totais.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {dados.totais.map((t) => (
                <div key={t.moeda} className="card p-4 grid gap-2">
                  <div className="label-cap">Comissões em {t.moeda}</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                    <span className="text-ink-mute">Em carência</span>
                    <span className="text-ink tabular-nums text-right">
                      {dinheiro(t.pendente, t.moeda)}
                    </span>
                    <span className="text-ink-mute">Disponível para saque</span>
                    <span className="text-ink font-semibold tabular-nums text-right">
                      {dinheiro(t.disponivel, t.moeda)}
                    </span>
                    <span className="text-ink-mute">Já sacado</span>
                    <span className="text-ink tabular-nums text-right">
                      {dinheiro(t.sacado, t.moeda)}
                    </span>
                    <span className="text-ink-mute">Estornado</span>
                    <span className="text-ink tabular-nums text-right">
                      {dinheiro(t.estornado, t.moeda)}
                    </span>
                    {t.devido > 0 ? (
                      <>
                        <span className="text-pink">
                          Sacado e estornado (a descontar)
                        </span>
                        <span className="text-pink tabular-nums text-right">
                          {dinheiro(t.devido, t.moeda)}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card p-6 text-center text-[13px] text-ink-mute">
              Nenhuma comissão gerada ainda.
            </div>
          )
        ) : null}
      </Secao>

      {dados ? (
        <>
          <Secao
            titulo="Quem indica"
            descricao="Usuários com pelo menos um indicado, do que mais indicou para o que menos."
          >
            {dados.indicadores.length ? (
              <Tabela
                colunas={["Usuário", "Código", "Indicados", "Assinaram", "Stripe"]}
                larguras={["", 170, 96, 96, 120]}
              >
                {dados.indicadores.map((i) => (
                  <tr key={i.userId} className="hover:bg-panel/60 transition">
                    <td className="px-3 py-3">{usuario(i.userId, i.email)}</td>
                    <td className="px-3 py-3 truncate">
                      <span className="mono text-ink">{i.codigo}</span>
                      {i.personalizado ? null : (
                        <span className="text-[11px] text-ink-dim">
                          {" "}
                          · automático
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-ink tabular-nums">
                      {i.indicados}
                    </td>
                    <td className="px-3 py-3 text-ink tabular-nums">
                      {i.assinaram}
                    </td>
                    <td className="px-3 py-3">
                      {i.stripeConectado ? (
                        <Selo tom="ok">Conectado</Selo>
                      ) : (
                        <Selo>Sem conta</Selo>
                      )}
                    </td>
                  </tr>
                ))}
              </Tabela>
            ) : (
              <div className="card p-6 text-center text-[13px] text-ink-mute">
                Ninguém foi indicado ainda.
              </div>
            )}
          </Secao>

          <Secao
            titulo="Comissões"
            descricao="Mais recentes primeiro (até 200). Estorno e contestação no Stripe desfazem sozinhos; use Estornar para os outros casos (ex.: USDC devolvido)."
          >
            {dados.comissoes.length ? (
              <Tabela
                colunas={["Quem indicou", "Indicado", "Comissão", "Status", ""]}
                larguras={["", "", 130, 190, 104]}
                minimo={760}
              >
                {dados.comissoes.map((c) => (
                  <tr key={c.id} className="hover:bg-panel/60 transition">
                    <td className="px-3 py-3">
                      {usuario(c.indicadorId, c.indicadorEmail)}
                      <div className="text-[12px] text-ink-dim truncate">
                        {diaHora(c.criadoEm)}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {usuario(c.indicadoId, c.indicadoEmail)}
                      <div className="text-[12px] text-ink-dim truncate">
                        Plano {NOME_PLANO[c.plano ?? ""] ?? c.plano} ·{" "}
                        {dinheiro(c.valorBase, c.moeda)}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-ink font-semibold tabular-nums whitespace-nowrap">
                      {dinheiro(c.valor, c.moeda)}
                    </td>
                    <td className="px-3 py-3">
                      <SeloComissao c={c} />
                      {c.status === "disponivel" && c.emCarencia ? (
                        <div className="text-[12px] text-ink-dim truncate mt-0.5">
                          libera em {diaHora(c.disponivelEm)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {c.status === "disponivel" || c.status === "sacada" ? (
                        <button
                          type="button"
                          onClick={() => estornar(c)}
                          disabled={agindo === c.id}
                          className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-mute hover:text-pink disabled:opacity-50"
                        >
                          {agindo === c.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Undo2 className="w-3.5 h-3.5" />
                          )}
                          Estornar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </Tabela>
            ) : (
              <div className="card p-6 text-center text-[13px] text-ink-mute">
                Nenhuma comissão gerada ainda.
              </div>
            )}
          </Secao>

          <Secao
            titulo="Saques"
            descricao="Transferências para a conta Stripe ou para a carteira (USDC) de cada usuário, mais recentes primeiro (até 200)."
          >
            {dados.saques.length ? (
              <Tabela
                colunas={["Usuário", "Valor", "Status", "Transferência", ""]}
                larguras={["", 120, 120, 190, 104]}
                minimo={720}
              >
                {dados.saques.map((s) => (
                  <tr key={s.id} className="hover:bg-panel/60 transition">
                    <td className="px-3 py-3">
                      {usuario(s.userId, s.email)}
                      <div className="text-[12px] text-ink-dim truncate">
                        {diaHora(s.criadoEm)}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-ink font-semibold tabular-nums whitespace-nowrap">
                      {dinheiro(s.valor, s.moeda)}
                    </td>
                    <td className="px-3 py-3">
                      <SeloSaque s={s} />
                    </td>
                    <td className="px-3 py-3 truncate">
                      {s.rede ? (
                        <div className="grid gap-0.5">
                          <span className="text-[12px] text-ink-mute truncate">
                            {NOME_REDE[s.rede] ?? s.rede}
                            {s.carteira ? " → " : ""}
                            {s.carteira ? (
                              <span className="mono" title={s.carteira}>
                                {s.carteira.slice(0, 6)}…{s.carteira.slice(-4)}
                              </span>
                            ) : null}
                          </span>
                          {s.txHash ? (
                            <a
                              href={
                                linkExplorer(
                                  s.rede,
                                  s.rede === "solana"
                                    ? s.txHash
                                    : `${s.rede}:${s.txHash}`,
                                ) ?? undefined
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mono text-[12px] text-accent hover:underline truncate"
                            >
                              {s.txHash.slice(0, 10)}…
                            </a>
                          ) : (
                            <span
                              className="text-[12px] text-ink-dim truncate"
                              title={s.erro ?? undefined}
                            >
                              {s.erro ?? "sem hash"}
                            </span>
                          )}
                        </div>
                      ) : s.stripeTransferId ? (
                        <Copiavel texto={s.stripeTransferId} />
                      ) : (
                        <span
                          className="text-[12px] text-ink-dim truncate block"
                          title={s.erro ?? undefined}
                        >
                          {s.erro ?? "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {s.status === "processando" ? (
                        <button
                          type="button"
                          onClick={() => resolver(s)}
                          disabled={agindo === s.id}
                          className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline disabled:opacity-50"
                        >
                          {agindo === s.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Wrench className="w-3.5 h-3.5" />
                          )}
                          Conferir
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </Tabela>
            ) : (
              <div className="card p-6 text-center text-[13px] text-ink-mute">
                Nenhum saque ainda.
              </div>
            )}
          </Secao>
        </>
      ) : null}
    </div>
  );
}

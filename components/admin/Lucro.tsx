"use client";

import { useState } from "react";
import type { LucroAdmin } from "@/lib/admin/consultas";
import {
  DESCONTO_ANUAL,
  PACOTES,
  PLANOS,
  PLANOS_PAGOS,
  type PacoteId,
} from "@/lib/planos";
import { cn } from "@/lib/cn";
import {
  dinheiro,
  Estado,
  Filtros,
  Kpi,
  num,
  Secao,
  SeloPlano,
  Tabela,
  useAdmin,
} from "./partes";

type Dias = "7" | "30" | "90" | "0";
type Ordem = "prejuizo" | "lucro" | "custo";

const usd = (v: number) => dinheiro(v, "USD");
const pct = (parte: number, total: number) =>
  total > 0 ? `${Math.round((parte / total) * 100)}%` : "—";
const corLucro = (v: number) =>
  v < 0 ? "text-pink" : v > 0 ? "text-ok" : "text-ink-mute";

/** Lucro da empresa: receita paga menos o custo estimado de IA, no total, por usuário e por plano. */
export function Lucro({
  abrirUsuario,
}: {
  abrirUsuario: (id: string) => void;
}) {
  const [dias, setDias] = useState<Dias>("30");
  const [ordem, setOrdem] = useState<Ordem>("prejuizo");
  const { dados, erro, carregando } = useAdmin<LucroAdmin>(
    `/api/admin/lucro?dias=${dias}`,
  );
  const t = dados?.totais;
  const usuarios = [...(dados?.porUsuario ?? [])].sort((a, b) =>
    ordem === "custo"
      ? b.custoUSD - a.custoUSD
      : ordem === "lucro"
        ? b.lucroUSD - a.lucroUSD
        : a.lucroUSD - b.lucroUSD,
  );
  const assinantes = (plano: string) =>
    dados?.assinantes
      .filter((a) => a.plano === plano)
      .reduce((s, a) => s + a.n, 0) ?? 0;

  return (
    <div className="grid gap-8">
      <Secao
        titulo="Lucro"
        descricao={`Receita paga menos o custo estimado de IA (1 crédito ≈ US$ 0,01; Nano Banana Pro ≈ US$ 0,15). Não inclui taxas de pagamento, impostos nem infraestrutura.${
          dados ? ` Câmbio: R$ ${dados.cambio.toFixed(2)} por US$.` : ""
        }`}
        acoes={
          <Filtros<Dias>
            rotulo="Período"
            valor={dias}
            onChange={setDias}
            opcoes={[
              { id: "7", rotulo: "7 dias" },
              { id: "30", rotulo: "30 dias" },
              { id: "90", rotulo: "90 dias" },
              { id: "0", rotulo: "Tudo" },
            ]}
          />
        }
      >
        <Estado
          carregando={carregando}
          erro={erro}
          vazio={!dados}
          textoVazio=""
        />
        {t ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi
              rotulo="Receita"
              valor={usd(t.receitaTotalUSD)}
              detalhe={`${dinheiro(t.receitaBRL, "BRL")} + ${usd(t.receitaUSD)} · ${num(t.pagantes)} pagantes`}
            />
            <Kpi
              rotulo="Custo de IA"
              valor={usd(t.custoUSD)}
              detalhe={`${num(t.creditosGastos)} créditos gastos`}
            />
            <Kpi
              rotulo="Lucro bruto"
              valor={
                <span className={corLucro(t.lucroUSD)}>{usd(t.lucroUSD)}</span>
              }
              detalhe={`margem ${pct(t.lucroUSD, t.receitaTotalUSD)}`}
              destaque
            />
            <Kpi
              rotulo="Créditos em saldo"
              valor={num(t.saldoCreditos)}
              detalhe={`até ${usd(t.saldoCreditos / 100)} de custo futuro`}
            />
          </div>
        ) : null}
      </Secao>

      {dados ? (
        <>
          <Secao
            titulo="Por usuário"
            descricao="Quem gastou créditos ou pagou no período."
            acoes={
              <Filtros<Ordem>
                rotulo="Ordenar"
                valor={ordem}
                onChange={setOrdem}
                opcoes={[
                  { id: "prejuizo", rotulo: "Maior prejuízo" },
                  { id: "lucro", rotulo: "Maior lucro" },
                  { id: "custo", rotulo: "Maior custo" },
                ]}
              />
            }
          >
            {usuarios.length ? (
              <Tabela
                colunas={[
                  "Usuário",
                  "Plano",
                  "Receita",
                  "Créditos gastos",
                  "Custo de IA",
                  "Lucro",
                  "Margem",
                  "Saldo",
                ]}
                larguras={["", 126, 120, 116, 100, 112, 76, 80]}
                minimo={900}
              >
                {usuarios.map((u) => (
                  <tr
                    key={u.userId}
                    onClick={() => abrirUsuario(u.userId)}
                    className="hover:bg-panel/60 transition cursor-pointer"
                  >
                    <td className="px-3 py-3 min-w-0">
                      <div
                        className="text-ink font-semibold truncate"
                        title={u.email}
                      >
                        {u.nome || u.email}
                      </div>
                      {u.nome ? (
                        <div className="text-[12px] text-ink-mute truncate">
                          {u.email}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <SeloPlano plano={u.plano} ativo={u.planoAtivo} />
                    </td>
                    <td
                      className="px-3 py-3 text-ink tabular-nums whitespace-nowrap"
                      title={`${dinheiro(u.receitaBRL, "BRL")} + ${usd(u.receitaUSD)}`}
                    >
                      {usd(u.receitaTotalUSD)}
                    </td>
                    <td className="px-3 py-3 text-ink-mute tabular-nums">
                      {num(u.creditosGastos)}
                    </td>
                    <td className="px-3 py-3 text-ink-mute tabular-nums whitespace-nowrap">
                      {usd(u.custoUSD)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-3 font-semibold tabular-nums whitespace-nowrap",
                        corLucro(u.lucroUSD),
                      )}
                    >
                      {usd(u.lucroUSD)}
                    </td>
                    <td className="px-3 py-3 text-ink-mute tabular-nums">
                      {pct(u.lucroUSD, u.receitaTotalUSD)}
                    </td>
                    <td className="px-3 py-3 text-ink-mute tabular-nums">
                      {num(u.saldoCreditos)}
                    </td>
                  </tr>
                ))}
              </Tabela>
            ) : (
              <div className="card p-10 text-center text-[13px] text-ink-mute">
                Ninguém gastou nem pagou no período.
              </div>
            )}
          </Secao>

          <Secao
            titulo="Margem por plano e pacote"
            descricao="Pior caso: o usuário gasta 100% dos créditos. O que sobrar sem uso vira lucro a mais."
          >
            <Tabela
              colunas={[
                "Produto",
                "Assinantes",
                "Créditos",
                "Custo máx.",
                "Preço US$",
                "Margem US$",
                "Preço R$",
                "Margem R$",
                "Margem anual",
              ]}
              larguras={["", 92, 84, 96, 92, 96, 92, 92, 108]}
              minimo={880}
            >
              {[
                ...PLANOS_PAGOS.map((id) => ({
                  nome: `${PLANOS[id].nome} · mês`,
                  assinantes: num(assinantes(id)),
                  anual: true,
                  creditos: PLANOS[id].creditos,
                  precoBRL: PLANOS[id].precoBRL,
                  precoUSD: PLANOS[id].precoUSD,
                })),
                ...(Object.keys(PACOTES) as PacoteId[]).map((id) => ({
                  nome: `Pacote ${num(PACOTES[id].creditos)}`,
                  assinantes: "—",
                  anual: false,
                  creditos: PACOTES[id].creditos,
                  precoBRL: PACOTES[id].precoBRL,
                  precoUSD: PACOTES[id].precoUSD,
                })),
              ].map((p) => {
                const custo = p.creditos / 100;
                const emDolar = p.precoBRL / dados.cambio;
                const anual = p.precoUSD * (1 - DESCONTO_ANUAL);
                return (
                  <tr key={p.nome}>
                    <td className="px-3 py-3 text-ink font-semibold truncate">
                      {p.nome}
                    </td>
                    <td className="px-3 py-3 text-ink-mute tabular-nums">
                      {p.assinantes}
                    </td>
                    <td className="px-3 py-3 text-ink-mute tabular-nums">
                      {num(p.creditos)}
                    </td>
                    <td className="px-3 py-3 text-ink-mute tabular-nums whitespace-nowrap">
                      {usd(custo)}
                    </td>
                    <td className="px-3 py-3 text-ink tabular-nums whitespace-nowrap">
                      {usd(p.precoUSD)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-3 font-semibold tabular-nums",
                        corLucro(p.precoUSD - custo),
                      )}
                    >
                      {pct(p.precoUSD - custo, p.precoUSD)}
                    </td>
                    <td className="px-3 py-3 text-ink tabular-nums whitespace-nowrap">
                      {dinheiro(p.precoBRL, "BRL")}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-3 font-semibold tabular-nums",
                        corLucro(emDolar - custo),
                      )}
                    >
                      {pct(emDolar - custo, emDolar)}
                    </td>
                    <td className="px-3 py-3 text-ink-mute tabular-nums">
                      {p.anual ? pct(anual - custo, anual) : "—"}
                    </td>
                  </tr>
                );
              })}
            </Tabela>
          </Secao>
        </>
      ) : null}
    </div>
  );
}

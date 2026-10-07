"use client";

import { useState } from "react";
import type { UsoAdmin } from "@/lib/admin/consultas";
import {
  custoUSD,
  Estado,
  Filtros,
  Kpi,
  nomeMotivo,
  num,
  Secao,
  Tabela,
  useAdmin,
} from "./partes";

type Dias = "7" | "30" | "90";

/** Onde os créditos são gastos: por recurso/modelo e por usuário. */
export function Uso({ abrirUsuario }: { abrirUsuario: (id: string) => void }) {
  const [dias, setDias] = useState<Dias>("30");
  const { dados, erro, carregando } = useAdmin<UsoAdmin>(
    `/api/admin/uso?dias=${dias}`,
  );
  const total = dados?.total || 0;
  const usos = dados?.porRecurso.reduce((t, r) => t + r.usos, 0) ?? 0;
  const entrou = dados?.entradas.reduce((t, e) => t + e.creditos, 0) ?? 0;

  return (
    <div className="grid gap-8">
      <Secao
        titulo="Uso de créditos"
        descricao="1 crédito ≈ US$ 0,01 de custo de provedor — use para ver margem e o que mais pesa."
        acoes={
          <Filtros<Dias>
            rotulo="Período"
            valor={dias}
            onChange={setDias}
            opcoes={[
              { id: "7", rotulo: "7 dias" },
              { id: "30", rotulo: "30 dias" },
              { id: "90", rotulo: "90 dias" },
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
        {dados ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi
              rotulo="Créditos gastos"
              valor={num(total)}
              detalhe={`${num(usos)} gerações`}
              destaque
            />
            <Kpi
              rotulo="Custo estimado de IA"
              valor={custoUSD(total)}
              detalhe="o que os provedores cobram"
            />
            <Kpi
              rotulo="Créditos que entraram"
              valor={num(entrou)}
              detalhe="planos, compras, bônus, estornos"
            />
            <Kpi
              rotulo="Média por geração"
              valor={usos ? num(Math.round((total / usos) * 10) / 10) : "—"}
              detalhe="créditos"
            />
          </div>
        ) : null}
      </Secao>

      {dados ? (
        <>
          <Secao titulo="Por recurso e modelo">
            {dados.porRecurso.length ? (
              <Tabela
                colunas={[
                  "Recurso",
                  "Modelo",
                  "Usos",
                  "Usuários",
                  "Créditos",
                  "Custo ≈",
                  "Parte do total",
                ]}
                larguras={["", 140, 60, 88, 88, 88, 136]}
                minimo={720}
              >
                {dados.porRecurso.map((r, i) => {
                  const pct = total ? (r.creditos / total) * 100 : 0;
                  return (
                    <tr key={i} className="hover:bg-panel/60 transition">
                      <td
                        className="px-3 py-3 text-ink font-semibold truncate"
                        title={nomeMotivo(r.motivo)}
                      >
                        {nomeMotivo(r.motivo)}
                      </td>
                      <td
                        className="px-3 py-3 text-ink-mute mono text-[12px] truncate"
                        title={r.modelo ?? undefined}
                      >
                        {r.modelo ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-ink-mute tabular-nums">
                        {num(r.usos)}
                      </td>
                      <td className="px-3 py-3 text-ink-mute tabular-nums">
                        {num(r.usuarios)}
                      </td>
                      <td className="px-3 py-3 text-ink font-semibold tabular-nums">
                        {num(r.creditos)}
                      </td>
                      <td className="px-3 py-3 text-ink-mute tabular-nums whitespace-nowrap">
                        {custoUSD(r.creditos)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-line overflow-hidden">
                            <div
                              className="h-full rounded-full bg-accent"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[12px] text-ink-mute tabular-nums w-10 text-right">
                            {Math.round(pct)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </Tabela>
            ) : (
              <div className="card p-10 text-center text-[13px] text-ink-mute">
                Nenhum gasto no período.
              </div>
            )}
          </Secao>

          <div className="grid lg:grid-cols-2 gap-6">
            <Secao titulo="Quem mais gastou">
              <div className="card divide-y divide-line">
                {dados.porUsuario.length ? (
                  dados.porUsuario.map((u) => (
                    <button
                      key={u.userId}
                      type="button"
                      onClick={() => abrirUsuario(u.userId)}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-panel/60 transition"
                    >
                      <span className="min-w-0 flex-1 text-[13px] text-ink truncate">
                        {u.email ?? "usuário removido"}
                      </span>
                      <span className="text-[12px] text-ink-mute whitespace-nowrap">
                        {num(u.usos)} usos
                      </span>
                      <span className="text-[13px] font-bold text-ink tabular-nums w-20 text-right">
                        {num(u.creditos)}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="p-6 text-center text-[13px] text-ink-mute">
                    Ninguém gastou no período.
                  </div>
                )}
              </div>
            </Secao>
            <Secao titulo="De onde os créditos entraram">
              <div className="card divide-y divide-line">
                {dados.entradas.length ? (
                  dados.entradas.map((e) => (
                    <div
                      key={e.motivo}
                      className="px-4 py-3 flex items-center gap-3"
                    >
                      <span className="min-w-0 flex-1 text-[13px] text-ink truncate">
                        {nomeMotivo(e.motivo)}
                      </span>
                      <span className="text-[12px] text-ink-mute whitespace-nowrap">
                        {num(e.n)}×
                      </span>
                      <span className="text-[13px] font-bold text-ok tabular-nums w-20 text-right">
                        +{num(e.creditos)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-[13px] text-ink-mute">
                    Nada entrou no período.
                  </div>
                )}
              </div>
            </Secao>
          </div>
        </>
      ) : null}
    </div>
  );
}

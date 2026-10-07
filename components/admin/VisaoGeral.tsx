"use client";

import { AlertTriangle, CreditCard, HardDrive, Users, Zap } from "lucide-react";
import type { ResumoAdmin } from "@/lib/admin/consultas";
import { cn } from "@/lib/cn";
import {
  bytes,
  custoUSD,
  diaHora,
  dinheiro,
  Estado,
  Kpi,
  NOME_PLANO,
  num,
  Secao,
  useAdmin,
} from "./partes";

/** Barras dos últimos 14 dias (altura proporcional ao maior dia). */
function Barras({
  serie,
  campo,
  sufixo,
}: {
  serie: ResumoAdmin["serie"];
  campo: "usuarios" | "creditos";
  sufixo: string;
}) {
  const max = Math.max(1, ...serie.map((d) => d[campo]));
  return (
    <div
      className="flex items-end gap-1 h-28"
      role="img"
      aria-label={`${sufixo} por dia, últimos 14 dias`}
    >
      {serie.map((d) => {
        const v = d[campo];
        const [, m, dd] = d.dia.split("-");
        return (
          <div
            key={d.dia}
            className="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1 group"
          >
            <span className="text-[10px] text-ink-dim tabular-nums opacity-0 group-hover:opacity-100 transition">
              {num(v)}
            </span>
            <div
              title={`${dd}/${m}: ${num(v)} ${sufixo}`}
              className={cn(
                "w-full rounded-t-md transition",
                v ? "bg-accent/80 group-hover:bg-accent" : "bg-line",
              )}
              style={{ height: v ? `${Math.max(6, (v / max) * 100)}%` : 3 }}
            />
            <span className="text-[10px] text-ink-dim tabular-nums">{dd}</span>
          </div>
        );
      })}
    </div>
  );
}

export function VisaoGeral({
  irPara,
}: {
  irPara: (aba: "usuarios" | "pagamentos" | "uso") => void;
}) {
  const { dados, erro, carregando } =
    useAdmin<ResumoAdmin>("/api/admin/resumo");
  if (!dados)
    return (
      <Estado
        carregando={carregando || !erro}
        erro={erro}
        vazio
        textoVazio=""
      />
    );

  const pagantes = dados.planos
    .filter((p) => p.plano !== "gratis")
    .reduce((t, p) => t + p.n, 0);
  const totalContas = dados.planos.reduce((t, p) => t + p.n, 0) || 1;
  const receita30 = (moeda: string) =>
    dados.receita
      .filter((r) => r.moeda === moeda)
      .reduce((t, r) => t + r.d30, 0);
  const receitaTotal = (moeda: string) =>
    dados.receita
      .filter((r) => r.moeda === moeda)
      .reduce((t, r) => t + r.total, 0);

  return (
    <div className="grid gap-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          rotulo="Usuários"
          icone={Users}
          valor={num(dados.usuarios.total)}
          detalhe={`+${num(dados.usuarios.novos7)} em 7 dias · ${num(dados.usuarios.ativos7)} ativos`}
        />
        <Kpi
          rotulo="Planos pagos"
          icone={CreditCard}
          valor={num(pagantes)}
          detalhe={`${Math.round((pagantes / totalContas) * 100)}% das contas`}
        />
        <Kpi
          rotulo="Receita · 30 dias"
          icone={CreditCard}
          destaque
          valor={dinheiro(receita30("BRL"), "BRL")}
          detalhe={`+ ${dinheiro(receita30("USD"), "USD")} · ${num(dados.pagamentos.pagos30)} pagamentos`}
        />
        <Kpi
          rotulo="Créditos gastos · 30 dias"
          icone={Zap}
          valor={num(dados.creditos.gastos30)}
          detalhe={`≈ ${custoUSD(dados.creditos.gastos30)} de custo de IA`}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-baseline justify-between mb-4">
            <span className="text-[13px] font-semibold text-ink">
              Créditos gastos por dia
            </span>
            <button
              type="button"
              onClick={() => irPara("uso")}
              className="text-[12px] font-semibold text-accent hover:underline"
            >
              Ver uso
            </button>
          </div>
          <Barras serie={dados.serie} campo="creditos" sufixo="créditos" />
        </div>
        <div className="card p-5">
          <div className="flex items-baseline justify-between mb-4">
            <span className="text-[13px] font-semibold text-ink">
              Novos usuários por dia
            </span>
            <button
              type="button"
              onClick={() => irPara("usuarios")}
              className="text-[12px] font-semibold text-accent hover:underline"
            >
              Ver usuários
            </button>
          </div>
          <Barras serie={dados.serie} campo="usuarios" sufixo="usuários" />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-5 grid gap-3 content-start">
          <span className="text-[13px] font-semibold text-ink">
            Contas por plano
          </span>
          {dados.planos.map((p) => (
            <div key={p.plano} className="grid gap-1">
              <div className="flex justify-between text-[13px]">
                <span className="text-ink-mute">
                  {NOME_PLANO[p.plano] ?? p.plano}
                </span>
                <span className="text-ink font-semibold tabular-nums">
                  {num(p.n)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-line overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    p.plano === "gratis" ? "bg-ink-dim" : "bg-accent",
                  )}
                  style={{ width: `${(p.n / totalContas) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="card p-5 grid gap-2.5 content-start">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-semibold text-ink">
              Receita total
            </span>
            <button
              type="button"
              onClick={() => irPara("pagamentos")}
              className="text-[12px] font-semibold text-accent hover:underline"
            >
              Ver pagamentos
            </button>
          </div>
          <Linha
            rotulo="Em reais (Stripe)"
            valor={dinheiro(receitaTotal("BRL"), "BRL")}
          />
          <Linha
            rotulo="Em dólar (cartão e USDC)"
            valor={dinheiro(receitaTotal("USD"), "USD")}
          />
          <Linha
            rotulo="Cobranças abertas (24h)"
            valor={num(dados.pagamentos.pendentes)}
            alerta={dados.pagamentos.pendentes > 0}
          />
          <Linha
            rotulo="Créditos em circulação"
            valor={num(dados.creditos.emCirculacao)}
          />
          <Linha
            rotulo="Estornados · 30 dias"
            valor={num(dados.creditos.estornados30)}
          />
        </div>

        <div className="card p-5 grid gap-2.5 content-start">
          <span className="text-[13px] font-semibold text-ink">
            Conteúdo criado
          </span>
          <Linha rotulo="Personagens" valor={num(dados.conteudo.personagens)} />
          <Linha
            rotulo="Vídeos processados"
            valor={`${num(dados.conteudo.videos)}${dados.conteudo.videosErro ? ` · ${num(dados.conteudo.videosErro)} com erro` : ""}`}
            alerta={dados.conteudo.videosErro > 0}
          />
          <Linha
            rotulo="Posts nas redes"
            valor={`${num(dados.conteudo.posts)} · ${num(dados.conteudo.postsAgendados)} agendados`}
          />
          <Linha
            rotulo={
              <span className="inline-flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5" /> Armazenamento
              </span>
            }
            valor={bytes(dados.conteudo.armazenamentoBytes)}
          />
        </div>
      </div>

      <Secao
        titulo="Erros recentes"
        descricao="Vídeos, posts e treinos que falharam — os créditos já foram devolvidos pelo sistema."
      >
        {dados.erros.length === 0 ? (
          <div className="card p-6 text-center text-[13px] text-ink-mute">
            Nenhum erro registrado.
          </div>
        ) : (
          <div className="card divide-y divide-line">
            {dados.erros.map((e) => (
              <div key={e.id} className="p-4 flex gap-3">
                <AlertTriangle className="w-4 h-4 text-pink shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <span className="text-[13px] font-semibold text-ink">
                      {e.tipo}
                    </span>
                    <span className="text-[12px] text-ink-dim">
                      {diaHora(e.quando)}
                    </span>
                  </div>
                  <div className="text-[12px] text-ink-mute truncate">
                    {e.email ?? "usuário removido"}
                  </div>
                  {e.erro ? (
                    <p className="text-[12px] text-ink-dim mt-1 line-clamp-2 break-words">
                      {e.erro}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Secao>
    </div>
  );
}

function Linha({
  rotulo,
  valor,
  alerta,
}: {
  rotulo: React.ReactNode;
  valor: React.ReactNode;
  alerta?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="text-ink-mute">{rotulo}</span>
      <span
        className={cn(
          "font-semibold tabular-nums text-right",
          alerta ? "text-accent" : "text-ink",
        )}
      >
        {valor}
      </span>
    </div>
  );
}

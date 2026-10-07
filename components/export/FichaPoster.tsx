"use client";

import { forwardRef } from "react";
import type { Character } from "@/lib/types";
import { cn } from "@/lib/cn";
import { capaSrc } from "@/lib/storage/client";
import { tx } from "@/lib/i18n/tx";

interface Props {
  character: Character;
  orientation?: "vertical" | "horizontal";
  className?: string;
}

export const FichaPoster = forwardRef<HTMLDivElement, Props>(
  function FichaPoster(
    { character: c, orientation = "vertical", className },
    ref,
  ) {
    const vertical = orientation === "vertical";
    return (
      <div
        ref={ref}
        className={cn(
          "p-12",
          vertical ? "w-[720px] min-h-[1020px]" : "w-[1180px] min-h-[720px]",
          className,
        )}
        style={{
          fontFamily: "Inter, system-ui, sans-serif",
          background: "#0a0a0a",
          color: "#ffffff",
        }}
      >
        <header className="mb-10 flex items-start gap-6">
          <div
            className="h-28 w-28 rounded-2xl overflow-hidden shrink-0"
            style={{ background: "#141414", border: "1px solid #272727" }}
          >
            {capaSrc(c) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={capaSrc(c)}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl">
                ✨
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div
              className="text-[11px] font-bold uppercase"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                color: "#DFFF2A",
                letterSpacing: "0.14em",
              }}
            >
              {tx("Ficha do Influenciador Sintético")}
            </div>
            <h1
              className="text-6xl mt-2 uppercase"
              style={{
                fontFamily: "Inter, system-ui, sans-serif",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 0.95,
                color: "#ffffff",
              }}
            >
              {c.identidade.nome || tx("Sem nome")}
            </h1>
            {c.identidade.bio ? (
              <p
                className="text-[16px] mt-3 leading-relaxed italic"
                style={{ color: "#A3A3A3" }}
              >
                “{c.identidade.bio}”
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 mt-4 text-[11px]">
              {c.identidade.genero && <Tag>{c.identidade.genero}</Tag>}
              {c.identidade.forma && <Tag>{c.identidade.forma}</Tag>}
              {c.identidade.idadeAparente && (
                <Tag>{c.identidade.idadeAparente}</Tag>
              )}
              {c.identidade.cidade && <Tag>{c.identidade.cidade}</Tag>}
              {c.identidade.idioma && <Tag>{c.identidade.idioma}</Tag>}
            </div>
          </div>
        </header>

        <div
          className={cn("grid gap-5", vertical ? "grid-cols-2" : "grid-cols-3")}
        >
          <Block title={tx("Visual")}>
            <KV label={tx("Cabelo")} value={c.visual.cabelo} />
            <KV label={tx("Pele")} value={c.visual.pele} />
            <KV label={tx("Olhos")} value={c.visual.olhos} />
            <KV label={tx("Roupa")} value={c.visual.roupa} />
            <KV label={tx("Acessórios")} value={c.visual.acessorios} />
            <KV label={tx("Paleta")} value={c.visual.paleta} />
            <KV label={tx("Cenários")} value={c.visual.cenarios} />
          </Block>

          <Block title={tx("Personalidade")}>
            <KV label={tx("Arquétipo")} value={c.soul.arquetipo} />
            {c.soul.adjetivos.length ? (
              <KV
                label={tx("Adjetivos")}
                value={c.soul.adjetivos.join(" · ")}
              />
            ) : null}
            <KV label={tx("Defende")} value={c.soul.valoresDefende} />
            <KV label={tx("Combate")} value={c.soul.valoresCombate} />
            <KV label={tx("Medos")} value={c.soul.medos} />
            <KV label={tx("Defeitos")} value={c.soul.defeitos} />
            <KV label={tx("Origem")} value={c.soul.origem} />
          </Block>

          <Block title={tx("Nicho e Estratégia")}>
            <KV
              label={tx("Nicho")}
              value={joined(c.nicho.principal, c.nicho.subnicho)}
            />
            <KV label={tx("Público")} value={c.nicho.publico} />
            <KV label={tx("Promessa")} value={c.nicho.promessa} />
            <KV label={tx("Diferencial")} value={c.nicho.diferencial} />
            {c.nicho.plataformas.length ? (
              <KV
                label={tx("Plataformas")}
                value={c.nicho.plataformas.join(" · ")}
              />
            ) : null}
          </Block>

          <Block title={tx("Voz")}>
            <KV
              label={tx("Tom")}
              value={`Formal ${c.voz.tomFormalidade} · Humor ${c.voz.tomHumor} · Complexidade ${c.voz.tomComplexidade}`}
            />
            {c.voz.girias.length ? (
              <KV label={tx("Gírias")} value={c.voz.girias.join(" · ")} />
            ) : null}
            {c.voz.bordoes.length ? (
              <KV label={tx("Bordões")} value={c.voz.bordoes.join(" · ")} />
            ) : null}
            {c.voz.proibidas.length ? (
              <KV label={tx("Proibidas")} value={c.voz.proibidas.join(" · ")} />
            ) : null}
            <KV label={tx("Abertura")} value={c.voz.abertura} />
            <KV label={tx("Fechamento")} value={c.voz.fechamento} />
          </Block>

          <Block title={tx("Monetização")}>
            {c.monetizacao.modelos.length ? (
              <KV
                label={tx("Modelos")}
                value={c.monetizacao.modelos.join(" · ")}
              />
            ) : null}
            {c.monetizacao.marcasOk.length ? (
              <KV
                label={tx("Marcas OK")}
                value={c.monetizacao.marcasOk.join(" · ")}
              />
            ) : null}
            {c.monetizacao.marcasNao.length ? (
              <KV
                label={tx("Marcas NÃO")}
                value={c.monetizacao.marcasNao.join(" · ")}
              />
            ) : null}
            <KV label={tx("Limites")} value={c.monetizacao.limites} />
            <KV
              label={tx("Transparência")}
              value={c.monetizacao.transparencia}
            />
          </Block>

          <Block title={tx("Reações")}>
            <KV label={tx("Elogio")} value={c.soul.reacoes.elogio} />
            <KV label={tx("Crítica")} value={c.soul.reacoes.critica} />
            <KV label={tx("Polêmica")} value={c.soul.reacoes.polemica} />
            <KV label={tx("Hater")} value={c.soul.reacoes.hater} />
          </Block>
        </div>

        <footer
          className="mt-12 pt-6 text-[10px] font-bold uppercase"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            color: "#666666",
            letterSpacing: "0.14em",
            borderTop: "1px solid #272727",
          }}
        >
          {tx("Ficha gerada por Crie seu Influenciador Sintético")}
        </footer>
      </div>
    );
  },
);

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full capitalize font-medium"
      style={{
        background: "#141414",
        border: "1px solid #272727",
        color: "#A3A3A3",
      }}
    >
      {children}
    </span>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl p-5"
      style={{ background: "#141414", border: "1px solid #272727" }}
    >
      <h3
        className="text-[11px] font-bold mb-3 uppercase"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          color: "#DFFF2A",
          letterSpacing: "0.14em",
        }}
      >
        {title}
      </h3>
      <div className="space-y-2.5 text-[14px] leading-relaxed">{children}</div>
    </section>
  );
}

function KV({ label, value }: { label: string; value?: string }) {
  if (!value || !String(value).trim()) return null;
  return (
    <div>
      <div
        className="text-[10px] uppercase font-semibold"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          color: "#666666",
          letterSpacing: "0.12em",
        }}
      >
        {label}
      </div>
      <div className="mt-0.5" style={{ color: "#ffffff" }}>
        {value}
      </div>
    </div>
  );
}

function joined(a?: string, b?: string) {
  if (a && b) return `${a} · ${b}`;
  return a || b;
}

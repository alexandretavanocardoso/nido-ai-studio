"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp } from "lucide-react";
import { definirAtivo } from "@/components/AppShell";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";
import { capaSrc } from "@/lib/storage/client";
import { useCharacters } from "@/lib/store";
import type { Character } from "@/lib/types";

/**
 * O nome do personagem no cabeçalho e, ao lado, o seletor de personagem (o
 * que ficava na barra do topo): abre a lista de todos e vai para o escolhido,
 * mantendo a aba, a etapa e a ferramenta abertas. Com um personagem só, fica
 * só o nome.
 */
export function NomeComTroca({ character: c, nome }: { character: Character; nome: string }) {
  const personagens = useCharacters((s) => s.characters);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight text-ink sm:text-3xl">{nome}</h1>
      {personagens.length > 1 ? <SeletorDePersonagem ativo={c} personagens={personagens} /> : null}
    </div>
  );
}

function SeletorDePersonagem({ ativo, personagens }: { ativo: Character; personagens: Character[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  function escolher(id: string) {
    setAberto(false);
    definirAtivo(id);
    if (id !== ativo.id) router.push(`/app/personagem/${id}${window.location.search}`);
  }

  return (
    <div className="relative shrink-0" ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-label={tx("Trocar de personagem")}
        title={tx("Trocar de personagem")}
        className="flex h-10 items-center gap-2 rounded-full border border-white/[0.08] bg-[rgba(15,13,14,0.6)] pl-1 pr-1 text-[13px] font-semibold text-nido-ink backdrop-blur-lg transition hover:border-white/[0.18] sm:pr-3 cursor-pointer"
      >
        <Rosto personagem={ativo} />
        {/* No celular o nome grande já está ao lado: fica só a foto e a seta. */}
        {/* Só o primeiro nome: o nome inteiro já está grande ao lado (a lista mostra o completo). */}
        <span className="hidden max-w-[150px] truncate sm:inline">
          {ativo.identidade.nome.trim().split(/\s+/)[0] || tx("Sem nome")}
        </span>
        <ChevronUp className={cn("h-4 w-4 shrink-0 text-nido-mute transition", !aberto && "rotate-180")} />
      </button>
      {aberto ? (
        <div className="absolute left-0 z-40 mt-2 max-h-[60dvh] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-white/[0.08] bg-nido-panel p-1.5 shadow-card max-sm:-left-16">
          <div className="px-2.5 pt-1.5 pb-2 font-geist-mono text-[10px] uppercase tracking-[0.14em] text-nido-dim">
            {tx("Personagem")}
          </div>
          {personagens.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => escolher(p.id)}
              aria-current={p.id === ativo.id ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left text-[13px] font-medium transition hover:bg-white/[0.05] cursor-pointer",
                p.id === ativo.id ? "text-nido-yellow" : "text-nido-soft",
              )}
            >
              <Rosto personagem={p} />
              <span className="min-w-0 flex-1 truncate">{p.identidade.nome || tx("Sem nome")}</span>
              {p.id === ativo.id ? (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-nido-yellow shadow-[0_0_8px_#fdf327]" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Rosto({ personagem: c }: { personagem: Character }) {
  const capa = capaSrc(c);
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#5c2a1f,#aa7d43)] text-[11px] font-bold text-nido-ink">
      {capa ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={capa} alt="" className="h-full w-full object-cover object-top" />
      ) : (
        (c.identidade.nome || "?")
          .split(" ")
          .map((p) => p[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()
      )}
    </span>
  );
}

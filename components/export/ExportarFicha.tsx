"use client";

import { useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  FileJson,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import type { Character } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { downloadJson, downloadPdf, downloadPng } from "@/lib/export";
import { FichaPoster } from "@/components/export/FichaPoster";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";

type Orient = "vertical" | "horizontal";

/** Botão "Exportar ficha" (PNG, PDF ou JSON), abaixo da prévia do personagem. */
export function ExportarFicha({ character: c }: { character: Character }) {
  const [aberto, setAberto] = useState(false);
  const [orient, setOrient] = useState<Orient>("vertical");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const posterRef = useRef<HTMLDivElement>(null);

  const slug = (c.identidade.nome || "personagem")
    .toLowerCase()
    .replace(/\s+/g, "-");

  async function exportar(
    baixar: (node: HTMLElement, nome: string) => Promise<void>,
    extensao: string,
  ) {
    if (!posterRef.current) return;
    setErro(null);
    setOcupado(true);
    try {
      await baixar(posterRef.current, `${slug}-ficha.${extensao}`);
      setAberto(false);
    } catch (e) {
      console.error("[exportar ficha]", e);
      setErro(tx("Não consegui exportar a ficha. Tente de novo."));
    } finally {
      setOcupado(false);
    }
  }

  const opcoes = [
    [ImageIcon, tx("Imagem (PNG)"), () => exportar(downloadPng, "png")],
    [Download, "PDF", () => exportar(downloadPdf, "pdf")],
    [
      FileJson,
      tx("Dados (JSON)"),
      () => {
        downloadJson(`${slug}.json`, c);
        setAberto(false);
      },
    ],
  ] as const;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        className="w-full"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
      >
        {ocupado ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}{" "}
        {tx("Exportar ficha")}
        <ChevronDown
          className={cn("w-4 h-4 transition", aberto && "rotate-180")}
        />
      </Button>

      {aberto && (
        <div className="absolute inset-x-0 bottom-full mb-2 z-10 grid rounded-xl border border-line bg-card p-1.5 shadow-lg">
          <div className="flex gap-1 p-1.5 text-xs">
            {(
              [
                ["vertical", tx("Vertical")],
                ["horizontal", tx("Horizontal")],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setOrient(valor)}
                className={cn(
                  "flex-1 h-7 rounded-full border font-semibold",
                  orient === valor
                    ? "border-accent text-bg bg-accent"
                    : "border-line text-ink-mute bg-panel hover:text-ink hover:border-line-strong",
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
          {opcoes.map(([Icone, rotulo, acao]) => (
            <button
              key={rotulo}
              type="button"
              disabled={ocupado}
              onClick={acao}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-ink-mute hover:text-ink hover:bg-panel text-left disabled:opacity-50"
            >
              <Icone className="w-4 h-4" /> {rotulo}
            </button>
          ))}
          {erro ? (
            <p className="px-3 py-2 text-[12px] text-pink">{erro}</p>
          ) : null}

          {/* Ficha em tamanho real, fora da tela, usada para exportar PNG/PDF */}
          <div
            aria-hidden="true"
            style={{
              position: "fixed",
              left: "-10000px",
              top: 0,
              pointerEvents: "none",
            }}
          >
            <FichaPoster ref={posterRef} character={c} orientation={orient} />
          </div>
        </div>
      )}
    </div>
  );
}

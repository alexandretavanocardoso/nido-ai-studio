"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Download,
  FileJson,
  Image as ImageIcon,
  Info,
  Wand2,
} from "lucide-react";
import { useCharacter } from "@/lib/useCharacter";
import { Button } from "@/components/ui/Button";
import { checarConsistencia, status } from "@/lib/completion";
import { downloadJson, downloadPdf, downloadPng } from "@/lib/export";
import { FichaPoster } from "@/components/export/FichaPoster";
import { cn } from "@/lib/cn";
import { PontosEmAberto } from "@/components/revisao/PontosEmAberto";
import { ConsistenciaIA } from "@/components/revisao/ConsistenciaIA";
import { useRecursos } from "@/components/RecursosProvider";
import { tx } from "@/lib/i18n/tx";

type Orient = "vertical" | "horizontal";

export function RevisaoStep({
  id,
  onEstudio,
}: {
  id: string;
  onEstudio: () => void;
}) {
  const recursos = useRecursos();
  const { character } = useCharacter(id);
  const [orient, setOrient] = useState<Orient>("vertical");
  const [exportando, setExportando] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);

  if (!character) return null;
  const c = character;
  const check = checarConsistencia(c);
  const st = status(c);
  const slug = (c.identidade.nome || "personagem")
    .toLowerCase()
    .replace(/\s+/g, "-");

  function onExportJson() {
    downloadJson(`${slug}.json`, c);
  }
  async function onExportPng() {
    if (!posterRef.current) return;
    await downloadPng(posterRef.current, `${slug}-ficha.png`);
  }
  async function onExportPdf() {
    if (!posterRef.current) return;
    await downloadPdf(posterRef.current, `${slug}-ficha.pdf`);
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="rounded-xl border border-line bg-panel p-4 flex items-start gap-3">
        {st === "completo" ? (
          <CheckCircle2 className="w-5 h-5 text-ok mt-0.5" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-pink mt-0.5" />
        )}
        <div className="flex-1">
          <div className="font-semibold text-ink">
            {st === "completo"
              ? tx("Personagem completo. Hora de usar.")
              : tx("Ainda está em rascunho.")}
          </div>
          <div className="text-[14px] text-ink-mute mt-0.5">
            {st === "completo"
              ? tx(
                  "Nome preenchido e pelo menos uma imagem de referência: critérios mínimos cumpridos.",
                )
              : tx(
                  "Faltam os obrigatórios: nome do personagem + pelo menos 1 imagem de referência.",
                )}
          </div>
        </div>
      </div>

      <section>
        <h3 className="label-cap mb-3">{tx("Checklist de consistência")}</h3>
        {check.length === 0 ? (
          <div className="rounded-xl border border-ok/30 bg-ok/10 p-4 text-sm text-ok">
            {tx("Nenhuma inconsistência detectada. Bom trabalho.")}
          </div>
        ) : (
          <ul className="grid gap-2">
            {check.map((item, i) => (
              <li
                key={i}
                className={cn(
                  "rounded-xl border p-3 text-sm flex gap-3",
                  item.tipo === "contradicao"
                    ? "border-pink/40 bg-pink/5"
                    : item.tipo === "vazio"
                      ? "border-pink/25 bg-pink/5"
                      : "border-line bg-panel",
                )}
              >
                {item.tipo === "contradicao" ? (
                  <AlertTriangle className="w-4 h-4 text-pink mt-0.5 shrink-0" />
                ) : item.tipo === "vazio" ? (
                  <AlertTriangle className="w-4 h-4 text-pink mt-0.5 shrink-0" />
                ) : (
                  <Info className="w-4 h-4 text-ink-mute mt-0.5 shrink-0" />
                )}
                <div>
                  <div className="text-ink">{item.mensagem}</div>
                  <div className="text-[11px] mono text-ink-dim mt-0.5">
                    {tx("Campo:")} {item.campo}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {recursos.ia ? <ConsistenciaIA characterId={c.id} /> : null}

      <PontosEmAberto character={c} />

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="label-cap">{tx("Ficha do Influenciador")}</h3>
          <div className="flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => setOrient("vertical")}
              className={cn(
                "px-3.5 h-8 rounded-full border font-semibold",
                orient === "vertical"
                  ? "border-accent text-bg bg-accent"
                  : "border-line text-ink-mute bg-panel hover:text-ink hover:border-line-strong",
              )}
            >
              {tx("Vertical")}
            </button>
            <button
              type="button"
              onClick={() => setOrient("horizontal")}
              className={cn(
                "px-3.5 h-8 rounded-full border font-semibold",
                orient === "horizontal"
                  ? "border-accent text-bg bg-accent"
                  : "border-line text-ink-mute bg-panel hover:text-ink hover:border-line-strong",
              )}
            >
              {tx("Horizontal")}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-panel p-4 overflow-auto">
          <div
            className="origin-top-left mx-auto"
            style={{
              transform: "scale(0.55)",
              transformOrigin: "top left",
              width: orient === "vertical" ? 720 * 0.55 : 1180 * 0.55,
              height: orient === "vertical" ? 1020 * 0.55 : 720 * 0.55,
            }}
          >
            <div style={{ width: orient === "vertical" ? 720 : 1180 }}>
              <FichaPoster character={c} orientation={orient} />
            </div>
          </div>
        </div>

        {/* Cópia em tamanho real, fora do fluxo, usada para exportar PNG/PDF */}
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
      </section>

      <section className="rounded-xl border border-accent/30 bg-accent/5 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="h-11 w-11 rounded-xl bg-accent text-bg grid place-items-center shrink-0">
          <Wand2 className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-ink">
            {tx("Pronto para criar conteúdo?")}
          </div>
          <p className="text-[14px] text-ink-mute mt-0.5">
            {tx(
              "No Estúdio você gera imagens, troca a pessoa de vídeos pelo personagem e escreve legendas e roteiros na voz dele.",
            )}
          </p>
        </div>
        <Button variant="accent" onClick={onEstudio} className="shrink-0">
          {tx("Abrir o Estúdio")} <ArrowRight className="w-4 h-4" />
        </Button>
      </section>

      <section className="relative w-fit">
        <Button
          variant="ghost"
          onClick={() => setExportando((v) => !v)}
          aria-expanded={exportando}
        >
          <Download className="w-4 h-4" /> {tx("Exportar ficha")}
          <ChevronDown
            className={cn("w-4 h-4 transition", exportando && "rotate-180")}
          />
        </Button>
        {exportando && (
          <div className="absolute left-0 bottom-full mb-2 z-10 grid min-w-48 rounded-xl border border-line bg-card p-1.5 shadow-lg">
            {(
              [
                [ImageIcon, tx("Imagem (PNG)"), onExportPng],
                [Download, "PDF", onExportPdf],
                [FileJson, tx("Dados (JSON)"), onExportJson],
              ] as const
            ).map(([Icone, rotulo, acao]) => (
              <button
                key={rotulo}
                type="button"
                onClick={() => {
                  setExportando(false);
                  acao();
                }}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-ink-mute hover:text-ink hover:bg-panel text-left"
              >
                <Icone className="w-4 h-4" /> {rotulo}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

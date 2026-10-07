"use client";
import { tx } from "@/lib/i18n/tx";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Sparkles,
  UserCog,
} from "lucide-react";
import type { Character } from "@/lib/types";
import { useCharacters } from "@/lib/store";
import { Field } from "@/components/ui/Field";
import { Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { buildPromptFromImage } from "@/lib/prompts/gerar-da-imagem";
import { parseRespostaClaude } from "@/lib/prompts/gerar-no-claude";
import { copyToClipboard } from "@/lib/export";
import { cn } from "@/lib/cn";

const PLACEHOLDER_EXTRA =
  "Ex.: Idade real 32. Nicho: moda alternativa. Público: criativas de 25-35. Tom: debochado, ácido. Nome: Lila.";

interface Props {
  character: Character;
}

export function GerarIdentidadeDaImagem({ character }: Props) {
  const applySuggestions = useCharacters((s) => s.applySuggestions);
  const updateChar = useCharacters((s) => s.update);
  const [open, setOpen] = useState(false);
  const [extra, setExtra] = useState("");
  const [resposta, setResposta] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  const prompt = useMemo(() => buildPromptFromImage(extra), [extra]);
  const temRefs = character.visual.referencias.length > 0;

  async function onCopiar() {
    const ok = await copyToClipboard(prompt);
    if (ok) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    }
  }

  function onImportar() {
    const r = parseRespostaClaude(resposta);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    applySuggestions(
      character.id,
      r.suggestions,
      "Identidade a partir da imagem",
    );
    if (r.pontosEmAberto.length) {
      updateChar(character.id, (c) => {
        c.pontosEmAberto = [...c.pontosEmAberto, ...r.pontosEmAberto];
      });
    }
    setErro(null);
    setResposta("");
    setExtra("");
    setSucesso(true);
    setTimeout(() => setSucesso(false), 4000);
    setOpen(false);
  }

  return (
    <section className="rounded-xl border border-accent/25 bg-accent/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 p-4 text-left"
        aria-expanded={open}
      >
        <div className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-accent/15 text-accent shrink-0">
          <UserCog className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="label-cap !text-accent">
              {tx("Gerar identidade a partir da imagem")}
            </span>
            {temRefs ? (
              <span className="text-[10px] mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-accent text-bg">
                {character.visual.referencias.length} ref
                {character.visual.referencias.length > 1 ? "s" : ""} prontas
              </span>
            ) : null}
            {sucesso ? (
              <span className="text-[11px] mono font-bold uppercase tracking-wider text-ok inline-flex items-center gap-1">
                <Check className="w-3 h-3" strokeWidth={3} />{" "}
                {tx("Ficha preenchida")}
              </span>
            ) : null}
          </div>
          <p className="text-[13px] text-ink-mute mt-1 leading-relaxed">
            Peça para uma{" "}
            {tx(
              "Peça para uma IA (ChatGPT, Claude, Gemini) olhar a imagem e preencher personalidade, voz, nicho e monetização de uma vez — sem precisar escrever cada campo à mão.",
            )}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-ink-mute shrink-0 mt-2 transition",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="px-4 pb-4 grid gap-5">
          <Step n={1} titulo={tx("Anotações extras (opcional)")}>
            <Field
              label={tx("O que a imagem não mostra")}
              hint={tx(
                "Nome, idade real, nicho, tom, público — qualquer coisa que não dá para ver no visual. Pode deixar vazio.",
              )}
              counter={{ value: extra.length, max: 1500 }}
            >
              <Textarea
                rows={3}
                maxLength={1500}
                placeholder={PLACEHOLDER_EXTRA}
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
              />
            </Field>
          </Step>

          <Step n={2} titulo={tx("Anexe a imagem na IA e cole o prompt")}>
            <p className="text-[13px] text-ink-mute leading-relaxed mb-3">
              {tx("Abra o chat da IA,")}{" "}
              <strong className="text-ink">
                {tx("anexe a imagem do personagem")}
              </strong>{" "}
              {tx(
                "no próprio chat (ChatGPT, Claude e Gemini todos aceitam) e cole o prompt.",
              )}
              {!temRefs ? (
                <>
                  {" "}
                  <span className="text-accent">{tx("Dica:")}</span>{" "}
                  {tx(
                    "você ainda não tem refs upadas aqui no site — mas pode anexar na IA uma imagem que tenha fora, ou gerar primeiro com o bloco acima e salvar para anexar na IA.",
                  )}
                </>
              ) : null}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="accent" onClick={onCopiar}>
                {copiado ? (
                  <Check className="w-4 h-4" strokeWidth={3} />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copiado ? tx("Copiado!") : tx("Copiar prompt")}
              </Button>
              <IaLink href="https://chat.openai.com/" label={tx("ChatGPT")} />
              <IaLink href="https://claude.ai/new" label={tx("Claude")} />
              <IaLink href="https://gemini.google.com/" label={tx("Gemini")} />
            </div>
            <details className="mt-3 group">
              <summary className="text-[13px] text-ink-mute hover:text-ink cursor-pointer font-semibold">
                {tx("Ver o prompt")}
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-xl border border-line bg-bg p-3.5 text-[12px] mono whitespace-pre-wrap leading-relaxed text-ink/85">
                {prompt}
              </pre>
            </details>
          </Step>

          <Step n={3} titulo={tx("Cole a resposta da IA")}>
            <Field
              label={tx("Resposta da IA")}
              hint={tx(
                "Pode colar a mensagem inteira, o site acha o JSON sozinho.",
              )}
            >
              <Textarea
                rows={6}
                placeholder={tx('{ "identidade": { "nome": "..." }, ... }')}
                value={resposta}
                onChange={(e) => {
                  setResposta(e.target.value);
                  setErro(null);
                }}
                className="mono text-[12px]"
              />
            </Field>
            {erro ? (
              <div className="mt-3 rounded-xl border border-pink/40 bg-pink/10 px-3.5 py-2.5 text-sm text-pink">
                {erro}
              </div>
            ) : null}
            <div className="flex justify-end mt-4">
              <Button
                variant="accent"
                onClick={onImportar}
                disabled={!resposta.trim()}
              >
                <Sparkles className="w-4 h-4" />
                {tx("Preencher ficha")}
              </Button>
            </div>
          </Step>
        </div>
      ) : null}
    </section>
  );
}

function Step({
  n,
  titulo,
  children,
}: {
  n: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2.5 mb-3">
        <span className="h-6 w-6 inline-flex items-center justify-center rounded-full bg-accent/15 text-accent mono text-[12px] font-bold">
          {n}
        </span>
        <h4 className="font-semibold text-ink text-[14px]">{titulo}</h4>
      </div>
      {children}
    </section>
  );
}

function IaLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center gap-1.5 font-semibold rounded-full h-9 px-3.5 text-[12px] bg-transparent text-ink-mute border border-line hover:border-line-strong hover:text-ink transition"
    >
      <ExternalLink className="w-3 h-3" />
      {label}
    </a>
  );
}

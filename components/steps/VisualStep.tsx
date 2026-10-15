"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  X,
} from "lucide-react";
import { useCharacter } from "@/lib/useCharacter";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import type { ReferenciaImagem } from "@/lib/types";
import { cn } from "@/lib/cn";
import { refSrc } from "@/lib/storage/client";
import {
  criarReferencia,
  maxRefBytes,
  useStorageReady,
} from "@/lib/storage/useStorage";
import { useRecursos } from "@/components/RecursosProvider";
import { PersonaTreino } from "@/components/persona/PersonaTreino";
import { tx } from "@/lib/i18n/tx";

export function VisualStep({ id }: { id: string }) {
  const recursos = useRecursos();
  const { character, set } = useCharacter(id);
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(0);
  const usarS3 = useStorageReady();
  if (!character) return null;
  const maxBytes = maxRefBytes(usarS3);
  const v = character.visual;

  async function onFiles(files: FileList | null) {
    if (!files) return;
    const novos: ReferenciaImagem[] = [];
    const lista = Array.from(files).filter((f) => f.type.startsWith("image/"));
    setEnviando((n) => n + lista.length);
    for (const f of lista) {
      try {
        if (f.size > maxBytes) {
          alert(
            `${f.name}: imagem maior que ${maxBytes / 1024 / 1024} MB — reduza antes.`,
          );
          continue;
        }
        novos.push(await criarReferencia(f, usarS3));
      } catch (e) {
        alert(`${f.name}: ${(e as Error).message}`);
      } finally {
        setEnviando((n) => n - 1);
      }
    }
    if (novos.length) {
      set((c) => {
        c.visual.referencias = [...c.visual.referencias, ...novos];
      });
    }
  }

  function removerRef(refId: string) {
    set((c) => {
      c.visual.referencias = c.visual.referencias.filter((r) => r.id !== refId);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-5">
      {/* A geração de imagens fica só no Estúdio; aqui, o atalho. */}
      {(recursos.gemini || recursos.fal || recursos.openai) && (
        <section className="rounded-xl border border-accent/30 bg-accent/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-accent text-bg shrink-0">
            <ImageIcon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-ink">
              {tx("Gerar imagem com IA")}
            </div>
            <p className="text-[13px] text-ink-mute mt-0.5">
              {tx(
                "Card de referência e retratos ficam em Imagens (menu lateral). Use “Usar como referência” na galeria para a imagem aparecer aqui.",
              )}
            </p>
          </div>
          <Link
            href="?aba=estudio&secao=imagens"
            className="inline-flex items-center justify-center gap-1.5 rounded-full h-10 px-5 text-sm font-bold bg-accent text-bg hover:bg-accent-strong shrink-0"
          >
            {tx("Abrir Imagens")} <ArrowRight className="w-4 h-4" />
          </Link>
        </section>
      )}

      <Field
        label={tx("Imagens de referência")}
        hint={`Mínimo 1 para marcar o personagem como completo. Até ${maxBytes / 1024 / 1024} MB por imagem.`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {v.referencias.map((r) => (
            <div
              key={r.id}
              className="relative aspect-square rounded-xl overflow-hidden border border-line bg-bg group"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={refSrc(r)}
                alt={r.name}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => removerRef(r.id)}
                className="absolute top-1.5 right-1.5 h-7 w-7 inline-flex items-center justify-center rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 transition"
                aria-label={`Remover ${r.name}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {enviando > 0 && (
            <div className="aspect-square rounded-xl border border-line flex flex-col items-center justify-center text-ink-dim gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-xs">
                {tx("Enviando")} {enviando}…
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="aspect-square rounded-xl border-2 border-dashed border-line-strong hover:border-accent hover:bg-accent/5 transition flex flex-col items-center justify-center text-ink-dim hover:text-accent gap-2"
          >
            <ImagePlus className="w-5 h-5" />
            <span className="text-xs">{tx("Adicionar")}</span>
          </button>
        </div>
      </Field>

      <PersonaTreino character={character} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={tx("Cabelo")} fieldId="visual.cabelo" optional>
          <Input
            placeholder={tx("Ex.: Cacheado, cor cobre, altura dos ombros")}
            value={v.cabelo ?? ""}
            onChange={(e) => set((c) => (c.visual.cabelo = e.target.value))}
          />
        </Field>
        <Field label={tx("Pele")} fieldId="visual.pele" optional>
          <Input
            placeholder={tx("Ex.: Pele quente, sardas no nariz")}
            value={v.pele ?? ""}
            onChange={(e) => set((c) => (c.visual.pele = e.target.value))}
          />
        </Field>
        <Field label={tx("Olhos")} fieldId="visual.olhos" optional>
          <Input
            placeholder={tx("Ex.: Castanhos, levemente puxados")}
            value={v.olhos ?? ""}
            onChange={(e) => set((c) => (c.visual.olhos = e.target.value))}
          />
        </Field>
        <Field label={tx("Estilo de roupa")} fieldId="visual.roupa" optional>
          <Input
            placeholder={tx("Ex.: Oversize vintage com peças coloridas")}
            value={v.roupa ?? ""}
            onChange={(e) => set((c) => (c.visual.roupa = e.target.value))}
          />
        </Field>
        <Field label={tx("Acessórios")} fieldId="visual.acessorios" optional>
          <Input
            placeholder={tx("Ex.: Óculos redondo, anéis grandes")}
            value={v.acessorios ?? ""}
            onChange={(e) => set((c) => (c.visual.acessorios = e.target.value))}
          />
        </Field>
        <Field
          label={tx("Traços marcantes")}
          fieldId="visual.tracosMarcantes"
          optional
        >
          <Input
            placeholder={tx("Ex.: Tatuagem no antebraço, piercing no septo")}
            value={v.tracosMarcantes ?? ""}
            onChange={(e) =>
              set((c) => (c.visual.tracosMarcantes = e.target.value))
            }
          />
        </Field>
      </div>

      <Field
        label={tx("Paleta de cores")}
        fieldId="visual.paleta"
        optional
        hint={tx("Use nomes, hex ou descrição livre.")}
      >
        <Input
          placeholder={tx(
            "Ex.: Terracota, bege, verde-oliva e um toque de azul petróleo",
          )}
          value={v.paleta ?? ""}
          onChange={(e) => set((c) => (c.visual.paleta = e.target.value))}
        />
      </Field>

      <Field
        label={tx("Cenários recorrentes")}
        fieldId="visual.cenarios"
        optional
        hint={tx(
          "Onde você costuma vê-lo? Ex.: cozinha com luz amarela, café de bairro, estúdio minimalista.",
        )}
      >
        <Textarea
          rows={2}
          placeholder={tx(
            "Ex.: cozinha com janela grande ao fundo, café no bairro vila buarque, estúdio com cortina preta",
          )}
          value={v.cenarios ?? ""}
          onChange={(e) => set((c) => (c.visual.cenarios = e.target.value))}
        />
      </Field>
    </div>
  );
}

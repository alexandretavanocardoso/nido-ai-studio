"use client";

import { useEffect, useState } from "react";
import {
  EscolherImagemPersonagem,
  useImagensPersonagem,
} from "@/components/revisao/EscolherImagemPersonagem";
import { QuemEntra, type ImagemEnviada } from "@/components/sombra/comum";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";
import type { CenaLive, LiveResumo } from "@/lib/live/tipos";
import { creditosSombraAoVivo } from "@/lib/planos";
import type { Character } from "@/lib/types";
import { Colunas, pilula, PrepararLive } from "./Preparar";
import { EscolherCena } from "./Cena";
import { VozBiblioteca, type VozEscolhida } from "./VozBiblioteca";

/* ------------------------------------------------------------------ */
/* Peças comuns: quem aparece e a voz                                   */
/* ------------------------------------------------------------------ */

/** Quem aparece no lugar da pessoa: a imagem de um personagem ou uma foto enviada. */
export interface Quem {
  characterId: string | null;
  imageKey: string | null;
}

export function QuemAparece({
  personagens,
  valor,
  onChange,
  foto,
  onFoto,
}: {
  personagens: Character[];
  valor: Quem;
  onChange: (q: Quem) => void;
  foto: ImagemEnviada | null;
  onFoto: (f: ImagemEnviada) => void;
}) {
  const [modo, setModo] = useState<"personagem" | "foto">(personagens.length ? "personagem" : "foto");
  const character = personagens.find((c) => c.id === valor.characterId) ?? personagens[0];

  function escolherModo(m: "personagem" | "foto") {
    setModo(m);
    onChange(
      m === "foto"
        ? { characterId: null, imageKey: foto?.key ?? null }
        : { characterId: character?.id ?? null, imageKey: null },
    );
  }

  return (
    <div className="grid gap-3">
      {personagens.length ? (
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["personagem", "Personagem"],
              ["foto", "Foto"],
            ] as const
          ).map(([m, rotulo]) => (
            <button key={m} type="button" onClick={() => escolherModo(m)} className={cn(pilula(m === modo), "h-8 px-3 cursor-pointer")}>
              {tx(rotulo)}
            </button>
          ))}
        </div>
      ) : null}
      {modo === "personagem" && character ? (
        <ImagemDoPersonagem
          key={character.id}
          character={character}
          personagens={personagens}
          imageKey={valor.imageKey}
          onChange={onChange}
        />
      ) : (
        <div className="grid gap-1.5">
          <QuemEntra
            valor={foto}
            onChange={(f) => {
              onFoto(f);
              onChange({ characterId: null, imageKey: f.key });
            }}
          />
        </div>
      )}
    </div>
  );
}

function ImagemDoPersonagem({
  character,
  personagens,
  imageKey,
  onChange,
}: {
  character: Character;
  personagens: Character[];
  imageKey: string | null;
  onChange: (q: Quem) => void;
}) {
  const opcoes = useImagensPersonagem(character);
  const inicial = opcoes.find((o) => o.key === character.visual.capaKey)?.key ?? opcoes[0]?.key ?? null;
  // Ao trocar de personagem, já escolhe a capa dele.
  useEffect(() => {
    if (!imageKey) onChange({ characterId: character.id, imageKey: inicial });
  }, [character.id, imageKey, inicial, onChange]);

  return (
    <>
      {personagens.length > 1 && (
        <Select
          value={character.id}
          onChange={(e) => onChange({ characterId: e.target.value, imageKey: null })}
          aria-label={tx("Personagem")}
        >
          {personagens.map((c) => (
            <option key={c.id} value={c.id}>
              {c.identidade.nome || tx("Sem nome")}
            </option>
          ))}
        </Select>
      )}
      <EscolherImagemPersonagem
        opcoes={opcoes}
        valor={imageKey}
        onChange={(k) => onChange({ characterId: character.id, imageKey: k })}
        compacto
        dica={tx("Um retrato de frente, com o rosto nítido, funciona melhor.")}
      />
    </>
  );
}

/**
 * A voz: a própria (ao vivo) ou a original (vídeo), ou trocada por outra — as
 * vozes do personagem ou uma pronta da biblioteca.
 */
export function VozDaSombra({
  character,
  valor,
  onChange,
  propria,
  nota,
}: {
  character: Character | null;
  valor: VozEscolhida | null;
  onChange: (v: VozEscolhida | null) => void;
  /** Rótulo da opção sem troca ("Minha voz", "Voz original"). */
  propria: string;
  nota: string;
}) {
  const [outra, setOutra] = useState(!!valor);
  const [vozes, setVozes] = useState<VozEscolhida[]>([]);
  const [biblioteca, setBiblioteca] = useState(false);

  useEffect(() => {
    if (!character) return setVozes([]);
    let vivo = true;
    fetch(`/api/voz/${encodeURIComponent(character.id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { vozes: [] }))
      .then((b: { vozes?: VozEscolhida[] }) => {
        if (!vivo) return;
        const lista = [
          ...(character.vozBiblioteca ? [character.vozBiblioteca] : []),
          ...(b.vozes ?? []).filter((v) => v.voiceId !== character.vozBiblioteca?.voiceId),
        ];
        setVozes(lista);
      })
      .catch(() => vivo && setVozes([]));
    return () => {
      vivo = false;
    };
  }, [character]);

  function escolherOutra(sim: boolean) {
    setOutra(sim);
    setBiblioteca(false);
    onChange(sim ? (vozes[0] ?? null) : null);
  }

  const daLista = valor && vozes.some((v) => v.voiceId === valor.voiceId);

  return (
    <div className="grid gap-2">
      <span className="label-cap">{tx("Voz")}</span>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => escolherOutra(false)} className={cn(pilula(!outra), "h-8 px-3 cursor-pointer")}>
          {tx(propria)}
        </button>
        <button type="button" onClick={() => escolherOutra(true)} className={cn(pilula(outra), "h-8 px-3 cursor-pointer")}>
          {tx("Trocar por outra voz")}
        </button>
      </div>
      {outra ? (
        <div className="grid gap-2">
          {vozes.length ? (
            <Select
              value={daLista ? valor!.voiceId : ""}
              onChange={(e) => onChange(vozes.find((v) => v.voiceId === e.target.value) ?? null)}
              aria-label={tx("Voz")}
            >
              {!daLista ? <option value="">{valor ? valor.nome : tx("Escolha uma voz")}</option> : null}
              {vozes.map((v) => (
                <option key={v.voiceId} value={v.voiceId}>
                  {v.nome}
                </option>
              ))}
            </Select>
          ) : valor ? (
            <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-[13px]">
              <b className="text-ink">{valor.nome}</b>
            </div>
          ) : null}
          {vozes.length || valor ? (
            <button
              type="button"
              onClick={() => setBiblioteca((b) => !b)}
              className="justify-self-start text-[12px] font-semibold text-accent hover:underline cursor-pointer"
            >
              {biblioteca ? tx("Fechar vozes prontas") : tx("Escolher uma voz pronta")}
            </button>
          ) : null}
          {biblioteca || (!vozes.length && !valor) ? (
            <VozBiblioteca
              onEscolher={(v) => {
                onChange(v);
                setBiblioteca(false);
              }}
            />
          ) : null}
        </div>
      ) : null}
      <span className="text-[12px] text-ink-dim">{tx(nota)}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shadow ao vivo                                                       */
/* ------------------------------------------------------------------ */

/**
 * Shadow ao vivo: a webcam de quem faz a live vira o influencer (Lucy 2.5 em
 * tempo real), com a própria voz ou trocada. Cria a live pronta; a câmera só
 * liga ao entrar no ar.
 */
export function FormSombraAoVivo({
  personagens,
  onCriada,
}: {
  personagens: Character[];
  onCriada: (l: LiveResumo) => void;
}) {
  const [quem, setQuem] = useState<Quem>({ characterId: personagens[0]?.id ?? null, imageKey: null });
  const [foto, setFoto] = useState<ImagemEnviada | null>(null);
  const [nome, setNome] = useState("");
  const [voz, setVoz] = useState<VozEscolhida | null>(null);
  const [cena, setCena] = useState<CenaLive | null>(null);
  const character = personagens.find((c) => c.id === quem.characterId) ?? null;

  return (
    <>
      <Colunas
        imagem={
          <div className="grid gap-1.5">
            <span className="label-cap">{tx("Quem aparece no lugar da sua webcam")}</span>
            <QuemAparece personagens={personagens} valor={quem} onChange={setQuem} foto={foto} onFoto={setFoto} />
          </div>
        }
        resto={
          <>
            {!character ? (
              <label className="grid gap-1.5">
                <span className="label-cap">{tx("Nome")}</span>
                <Input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  maxLength={60}
                  placeholder={tx("Como ele(a) se chama na live")}
                />
              </label>
            ) : null}
            <VozDaSombra
              character={character}
              valor={voz}
              onChange={setVoz}
              propria="Minha voz"
              nota={
                voz
                  ? "Você fala e sai a voz escolhida. A troca leva uns segundos, então a live vai com 4 s de atraso para a boca casar com a voz (use o Chrome ou o Edge). Use fone de ouvido."
                  : "Sua voz vai como está, sincronizada com a boca do influencer. Use fone de ouvido."
              }
            />
            <EscolherCena valor={cena} onChange={setCena} sombra="camera" />
            <p className="rounded-xl border border-line bg-panel px-3 py-2 text-[12px] text-ink-mute">
              {tx("Para ficar bom: rosto de frente e bem iluminado, a câmera na altura dos olhos e sem nada cobrindo o rosto.")}
            </p>
          </>
        }
      />

      <PrepararLive
        falta={
          !quem.imageKey
            ? tx("Falta escolher quem aparece.")
            : !character && !nome.trim()
              ? tx("Falta o nome.")
              : null
        }
        creditos={creditosSombraAoVivo}
        nota="Cobrados ao entrar no ar; os minutos que você não usar voltam quando a live encerra."
        corpo={() => ({
          tipo: "sombra",
          characterId: character?.id,
          nomeSombra: character ? undefined : nome.trim(),
          imageKey: quem.imageKey,
          voiceId: voz?.voiceId ?? null,
          cena: cena ?? undefined,
        })}
        onCriada={onCriada}
      />
    </>
  );
}

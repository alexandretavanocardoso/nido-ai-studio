"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import { lerChatTwitch, type MensagemChat, type OrigemMensagem } from "./chat-twitch";

/** Intervalo com que a página pergunta ao servidor pelas mensagens novas. */
const INTERVALO_MS = 3000;

export const NOME_ORIGEM: Record<OrigemMensagem, string> = {
  twitch: "Twitch",
  youtube: "YouTube",
  kick: "Kick",
  discord: "Discord",
};

type EstadoBot = "aguardando" | "conectando" | "no_canal" | "pedindo_para_falar" | "erro";

type Servidor = {
  youtube: string | null;
  kick: string | null;
  /** Bot do Discord: canal e o que ele está fazendo (quem atualiza é o bot). */
  discord: { nome: string | null; palco: boolean; estado: EstadoBot; erro: string | null } | null;
};

type OrigemServidor = "youtube" | "kick" | "discord";

const NOME_ESTADO_BOT: Record<Exclude<EstadoBot, "erro">, string> = {
  aguardando: "esperando o bot entrar",
  conectando: "o bot está entrando no canal",
  no_canal: "no canal, falando com a voz do avatar",
  pedindo_para_falar: "pediu para falar: aceite o bot como orador no palco",
};

/**
 * Chats que entram sozinhos na fila: Twitch (lido aqui no navegador), YouTube
 * e Kick (lidos pelo servidor; a página busca as mensagens novas a cada 3s) e
 * Discord (o bot do NIDO entra no canal de voz ou palco, fala com a voz do
 * avatar e manda o chat do canal).
 */
export function ConexoesChat({
  id,
  enfileirar,
}: {
  id: string;
  enfileirar: (m: MensagemChat) => void;
}) {
  const [twitch, setTwitch] = useState<"desligado" | "conectando" | "conectado">("desligado");
  const [canalTwitch, setCanalTwitch] = useState("");
  const desligarTwitch = useRef<(() => void) | null>(null);
  const [servidor, setServidor] = useState<Servidor>({ youtube: null, kick: null, discord: null });
  const [linkYoutube, setLinkYoutube] = useState("");
  const [canalKick, setCanalKick] = useState("");
  const [linkDiscord, setLinkDiscord] = useState("");
  const [convite, setConvite] = useState<string | null>(null);
  const [ligando, setLigando] = useState<OrigemServidor | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const cursor = useRef<number | null>(null);

  useEffect(() => () => desligarTwitch.current?.(), []);

  const buscar = useCallback(async () => {
    const q = cursor.current === null ? "" : `?cursor=${cursor.current}`;
    const res = await fetch(`/api/live/${id}/chat${q}`, { cache: "no-store" }).catch(() => null);
    const b = (await res?.json().catch(() => null)) as {
      mensagens?: Array<{ origem: OrigemServidor; autor: string; texto: string }>;
      cursor?: number;
      chat?: Servidor;
      erro?: string | null;
      discordConvite?: string | null;
    } | null;
    if (!res?.ok || !b) return;
    if (cursor.current !== null)
      for (const m of b.mensagens ?? []) enfileirar({ autor: m.autor, texto: m.texto, origem: m.origem });
    if (b.cursor !== undefined) cursor.current = b.cursor;
    if (b.chat) setServidor(b.chat);
    if (b.erro) setErro(txErro(b.erro));
    if (b.discordConvite !== undefined) setConvite(b.discordConvite);
  }, [id, enfileirar]);

  // Ao abrir: descobre o ponto de partida e o que já está ligado (página recarregada).
  useEffect(() => {
    void buscar();
  }, [buscar]);

  const algumLigado = !!servidor.youtube || !!servidor.kick || !!servidor.discord;
  useEffect(() => {
    if (!algumLigado) return;
    const t = setInterval(buscar, INTERVALO_MS);
    return () => clearInterval(t);
  }, [algumLigado, buscar]);

  function alternarTwitch() {
    if (desligarTwitch.current) {
      desligarTwitch.current();
      desligarTwitch.current = null;
      setTwitch("desligado");
      return;
    }
    if (!canalTwitch.trim()) return;
    setTwitch("conectando");
    desligarTwitch.current = lerChatTwitch(canalTwitch, enfileirar, (ok) =>
      setTwitch(ok ? "conectado" : "desligado"),
    );
  }

  async function ligar(origem: OrigemServidor, valor: string) {
    setErro(null);
    setLigando(origem);
    try {
      const res = await fetch(`/api/live/${id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origem, valor }),
      });
      const b = (await res.json().catch(() => ({}))) as { chat?: Servidor; error?: string };
      if (!res.ok || !b.chat) return setErro(txErro(b.error ?? `Falha (HTTP ${res.status}).`));
      setServidor(b.chat);
    } finally {
      setLigando(null);
    }
  }

  async function desligar(origem: OrigemServidor) {
    const res = await fetch(`/api/live/${id}/chat?origem=${origem}`, { method: "DELETE" }).catch(() => null);
    const b = (await res?.json().catch(() => null)) as { chat?: Servidor } | null;
    if (b?.chat) setServidor(b.chat);
  }

  return (
    <div className="grid gap-2">
      <Linha
        rede="Twitch"
        ligado={twitch === "conectado" ? canalTwitch.trim() : null}
        carregando={twitch === "conectando"}
        valor={canalTwitch}
        onValor={setCanalTwitch}
        placeholder={tx("Canal da Twitch")}
        onLigar={alternarTwitch}
        onDesligar={alternarTwitch}
      />
      <Linha
        rede="YouTube"
        ligado={servidor.youtube}
        carregando={ligando === "youtube"}
        valor={linkYoutube}
        onValor={setLinkYoutube}
        placeholder={tx("Link da live do YouTube")}
        onLigar={() => ligar("youtube", linkYoutube)}
        onDesligar={() => desligar("youtube")}
      />
      <Linha
        rede="Kick"
        ligado={servidor.kick}
        carregando={ligando === "kick"}
        valor={canalKick}
        onValor={setCanalKick}
        placeholder={tx("Canal do Kick")}
        onLigar={() => ligar("kick", canalKick)}
        onDesligar={() => desligar("kick")}
      />
      <Linha
        rede="Discord"
        ligado={
          servidor.discord
            ? `${servidor.discord.palco ? tx("palco") : tx("canal")} ${servidor.discord.nome ?? ""}`.trim()
            : null
        }
        carregando={ligando === "discord"}
        valor={linkDiscord}
        onValor={setLinkDiscord}
        placeholder={tx("Link do canal de voz ou palco")}
        onLigar={() => ligar("discord", linkDiscord)}
        onDesligar={() => desligar("discord")}
      />
      {servidor.discord ? (
        <p
          className={cn(
            "pl-[80px] text-[12px]",
            servidor.discord.estado === "erro" ? "text-pink" : "text-ink-dim",
          )}
        >
          {servidor.discord.estado === "erro"
            ? txErro(servidor.discord.erro ?? "O bot não conseguiu entrar no canal.")
            : tx(NOME_ESTADO_BOT[servidor.discord.estado])}
        </p>
      ) : convite ? (
        <p className="pl-[80px] text-[12px] text-ink-dim">
          {tx("Primeiro, convide o bot para o servidor:")}{" "}
          <a href={convite} target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
            {tx("Convidar o bot do NIDO")}
          </a>
          {". "}
          {tx("Só voz: o Discord não deixa bots mandarem vídeo.")}
        </p>
      ) : null}
      {erro ? <p className="text-[12px] text-pink">{erro}</p> : null}
    </div>
  );
}

function Linha({
  rede,
  ligado,
  carregando,
  valor,
  onValor,
  placeholder,
  onLigar,
  onDesligar,
}: {
  rede: string;
  /** O que está ligado (canal ou vídeo), ou null. */
  ligado: string | null;
  carregando: boolean;
  valor: string;
  onValor: (v: string) => void;
  placeholder: string;
  onLigar: () => void;
  onDesligar: () => void;
}) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2">
      <span
        className={cn(
          "text-[12px] font-bold",
          ligado ? "text-accent" : "text-ink-mute",
        )}
      >
        {rede}
      </span>
      {ligado ? (
        <span className="truncate text-[13px] text-ink">
          {tx("Lendo")} {ligado}
        </span>
      ) : (
        <Input
          value={valor}
          onChange={(e) => onValor(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && valor.trim() && onLigar()}
          placeholder={placeholder}
          disabled={carregando}
        />
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={ligado ? onDesligar : onLigar}
        disabled={carregando || (!ligado && !valor.trim())}
      >
        {carregando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        {ligado ? tx("Desligar") : tx("Ligar")}
      </Button>
    </div>
  );
}

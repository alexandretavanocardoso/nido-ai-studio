"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, Headphones } from "lucide-react";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";
import { LinkDoPalco } from "./LinkDoPalco";

/** Downloads oficiais que o guia usa. */
const OBS = "https://obsproject.com/download";
const VB_CABLE = "https://vb-audio.com/Cable/";

/**
 * Entrar numa chamada ou palco do Discord com o avatar, pela conta da pessoa:
 * o OBS mostra o palco da live e vira a câmera ("Câmera virtual"); o som do
 * palco vai para um cabo de áudio virtual (VB-Cable), que o Discord usa como
 * microfone. O Discord não deixa bots mandarem vídeo, por isso é pela conta.
 */
export function GuiaDiscord({ id }: { id: string }) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="card p-4 grid gap-3">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="flex items-center gap-2 text-left cursor-pointer"
      >
        <Headphones className="w-4 h-4 text-accent" />
        <span className="label-cap">{tx("Discord: chamada ou palco")}</span>
        <ChevronDown className={cn("ml-auto w-4 h-4 text-ink-mute transition", aberto && "rotate-180")} />
      </button>
      {!aberto ? (
        <p className="text-[12px] text-ink-dim">
          {tx("O avatar entra com vídeo e voz pela sua conta do Discord, usando o OBS como câmera.")}
        </p>
      ) : (
        <ol className="grid gap-3 text-[13px] text-ink-mute">
          <Passo n={1} titulo={tx("Instale (uma vez só)")}>
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              <Link href={OBS}>OBS Studio</Link>
              <Link href={VB_CABLE}>VB-Cable</Link>
            </span>
            {tx("Depois de instalar o VB-Cable, reinicie o computador.")}
          </Passo>

          <Passo n={2} titulo={tx("Ponha o palco no OBS")}>
            <LinkDoPalco id={id} />
            {tx("No OBS: Fontes → + → Navegador → cole o link. Largura 1280 e altura 720, e marque “Controlar áudio pelo OBS”.")}
          </Passo>

          <Passo n={3} titulo={tx("Mande o som do palco para o cabo")}>
            {tx("OBS → Configurações → Áudio → Avançado → Dispositivo de monitoramento: “CABLE Input (VB-Audio Virtual Cable)”.")}
            <br />
            {tx("No Mixer de áudio, na engrenagem da fonte do navegador → Propriedades avançadas de áudio → Monitoramento: “Apenas monitorar (silenciar saída)”.")}
          </Passo>

          <Passo n={4} titulo={tx("Ligue a câmera virtual")}>
            {tx("No OBS, clique em “Iniciar câmera virtual” (no painel Controles).")}
          </Passo>

          <Passo n={5} titulo={tx("Configure o Discord")}>
            {tx("Configurações do usuário → Voz e vídeo: Dispositivo de entrada “CABLE Output (VB-Audio Virtual Cable)” e Câmera “OBS Virtual Camera”.")}
            <br />
            {tx("Desligue a supressão de ruído, o cancelamento de eco e o controle automático de ganho, e use a sensibilidade de entrada manual: senão o Discord corta a voz do avatar.")}
          </Passo>

          <Passo n={6} titulo={tx("Entre na chamada ou no palco")}>
            {tx("Chamada: entre no canal de voz e ligue a câmera.")}
            <br />
            {tx("Palco: entre, peça para falar (ou um moderador te convida) e ligue o vídeo.")}
            <br />
            {tx("Entre no ar aqui no NIDO: o que o avatar falar sai no Discord. As mensagens do chat do canal você cola na fila.")}
          </Passo>
        </ol>
      )}
      {aberto ? (
        <div className="grid gap-1 rounded-xl border border-line p-3 text-[12px] text-ink-mute">
          <b className="text-ink">{tx("Sem vídeo, pelo bot do NIDO")}</b>
          {tx("No painel do chat (com a live no ar), ligue o Discord com o link do canal: o bot entra no canal ou palco, fala com a voz do avatar e manda o chat do canal para a fila.")}
        </div>
      ) : null}
    </div>
  );
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-2">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-accent/15 text-[12px] font-bold text-accent">
        {n}
      </span>
      <div className="grid gap-1.5 leading-relaxed">
        <b className="text-ink">{titulo}</b>
        <div className="grid gap-1.5">{children}</div>
      </div>
    </li>
  );
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
    >
      {children}
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}

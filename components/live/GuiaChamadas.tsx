"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, Video } from "lucide-react";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";
import { LinkDoPalco } from "./LinkDoPalco";
import { pilula } from "./Preparar";

/** Downloads oficiais que o guia usa. */
const OBS = "https://obsproject.com/download";
const VB_CABLE = "https://vb-audio.com/Cable/";

type App = "discord" | "meet";

/**
 * Entrar numa chamada com o avatar (Discord ou Google Meet), pela conta da
 * pessoa: o OBS mostra o palco da live e vira a câmera ("Câmera virtual"); o
 * som do palco vai para um cabo de áudio virtual (VB-Cable), que o app usa
 * como microfone. Vídeo e voz saem juntos do palco, então a boca casa com a
 * voz em qualquer live (avatar, Sombra ao vivo ou 3D). Os quatro primeiros
 * passos são os mesmos nos dois apps; só a configuração e a entrada mudam.
 * O Discord não deixa bots mandarem vídeo, e o Meet não aceita bots sem um
 * serviço pago: por isso é pela conta.
 */
export function GuiaChamadas({ id }: { id: string }) {
  const [aberto, setAberto] = useState(false);
  const [app, setApp] = useState<App>("discord");

  return (
    <div className="card p-4 grid gap-3">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="flex items-center gap-2 text-left cursor-pointer"
      >
        <Video className="w-4 h-4 text-accent" />
        <span className="label-cap">{tx("Chamada de vídeo: Discord ou Meet")}</span>
        <ChevronDown className={cn("ml-auto w-4 h-4 text-ink-mute transition", aberto && "rotate-180")} />
      </button>
      {!aberto ? (
        <p className="text-[12px] text-ink-dim">
          {tx("O avatar entra com vídeo e voz pela sua conta do Discord ou do Google Meet, usando o OBS como câmera.")}
        </p>
      ) : (
        <>
          <div role="tablist" className="flex flex-wrap gap-1.5">
            {(
              [
                ["discord", "Discord"],
                ["meet", "Google Meet"],
              ] as const
            ).map(([a, nome]) => (
              <button
                key={a}
                type="button"
                role="tab"
                aria-selected={a === app}
                onClick={() => setApp(a)}
                className={cn(pilula(a === app), "h-8 px-3 cursor-pointer")}
              >
                {nome}
              </button>
            ))}
          </div>

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

            {app === "discord" ? (
              <>
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
              </>
            ) : (
              <>
                <Passo n={5} titulo={tx("Configure o Meet")}>
                  {tx("Na tela antes de entrar (ou em ⋮ → Configurações): Áudio → Microfone “CABLE Output (VB-Audio Virtual Cable)”; Vídeo → Câmera “OBS Virtual Camera”.")}
                  <br />
                  {tx("Se aparecer “Cancelamento de ruído”, desligue: senão o Meet corta a voz do avatar. Deixe os efeitos e fundos de vídeo desligados.")}
                </Passo>

                <Passo n={6} titulo={tx("Entre na reunião")}>
                  {tx("Entre no ar aqui no NIDO e deixe esta página aberta: o avatar sai daqui. Depois entre na reunião com a câmera e o microfone ligados.")}
                  <br />
                  {tx("Use fone de ouvido: o som da reunião não pode voltar para o microfone.")}
                  <br />
                  {tx("Na live com avatar, cole as perguntas do chat do Meet na fila; na Sombra, quem fala é você.")}
                </Passo>
              </>
            )}
          </ol>

          {app === "discord" ? (
            <div className="grid gap-1 rounded-xl border border-line p-3 text-[12px] text-ink-mute">
              <b className="text-ink">{tx("Sem vídeo, pelo bot do NIDO")}</b>
              {tx("No painel do chat (com a live no ar), ligue o Discord com o link do canal: o bot entra no canal ou palco, fala com a voz do avatar e manda o chat do canal para a fila.")}
            </div>
          ) : (
            <p className="text-[12px] text-ink-dim">
              {tx("No Zoom e no Teams é o mesmo caminho: câmera “OBS Virtual Camera” e microfone “CABLE Output”.")}
            </p>
          )}
        </>
      )}
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

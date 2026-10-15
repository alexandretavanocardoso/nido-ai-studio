"use client";

import { useState } from "react";
import { Film, Gamepad2, Loader2, MonitorUp, Square } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DECLARACAO_VIDEO_LIVE } from "@/lib/declaracoes";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";

export type JogoNaTela = { tipo: "tela" } | { tipo: "video"; nome: string };

/**
 * Aba "Jogo" da live: põe um jogo na tela, com o avatar no canto — a tela de
 * quem está jogando de verdade, ou um vídeo gravado (que toca aqui e vai
 * direto para a sala, sem subir para o servidor). A IA vê o jogo a cada fala.
 */
export function ControlesDoJogo({
  id,
  conectado,
  jogo,
  onTela,
  onVideo,
  onParar,
  sombra = false,
}: {
  id: string;
  /** Na sala (live no ar). */
  conectado: boolean;
  jogo: JogoNaTela | null;
  onTela: () => Promise<void>;
  onVideo: (arquivo: File) => Promise<void>;
  onParar: () => Promise<void>;
  /** Shadow ao vivo: a pessoa é que fala (sem a IA comentando). */
  sombra?: boolean;
}) {
  const [declarou, setDeclarou] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function rodar(fn: () => Promise<void>) {
    setErro(null);
    setOcupado(true);
    try {
      await fn();
    } catch (e) {
      const msg = (e as Error).message;
      // Cancelar a escolha da tela não é erro.
      if (!/permission|denied|abort|cancel/i.test(msg)) setErro(msg);
    } finally {
      setOcupado(false);
    }
  }

  async function escolherVideo(arquivo: File | undefined) {
    if (!arquivo) return;
    await rodar(async () => {
      const res = await fetch(`/api/live/${id}/jogo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ declaracao: DECLARACAO_VIDEO_LIVE }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(txErro(b.error ?? `Falha (HTTP ${res.status}).`));
      }
      await onVideo(arquivo);
    });
  }

  if (!conectado)
    return (
      <div className="card grid gap-2 p-5 text-[13px] text-ink-mute">
        <p className="font-semibold text-ink">{tx("Entre no ar para pôr um jogo na tela.")}</p>
        <p>
          {sombra
            ? tx("O jogo ocupa a tela e o influencer fica no canto, como a câmera de um streamer.")
            : tx("O jogo ocupa a tela e o avatar fica no canto, como a câmera de um streamer. A IA vê o jogo e comenta o que está acontecendo.")}
        </p>
      </div>
    );

  if (jogo)
    return (
      <div className="card grid gap-3 p-4">
        <div className="flex items-center gap-2">
          <Gamepad2 className="w-4 h-4 text-accent" />
          <span className="label-cap">{tx("Na tela agora")}</span>
        </div>
        <p className="text-[14px] font-semibold text-ink">
          {jogo.tipo === "tela" ? tx("Tela compartilhada") : `${tx("Vídeo gravado")}: ${jogo.nome}`}
        </p>
        <p className="text-[12px] text-ink-dim">
          {sombra
            ? tx("O influencer está no canto, com a sua câmera e a sua fala.")
            : tx("O avatar está no canto e a IA vê o jogo a cada fala. No modo apresentador, ele comenta o jogo sozinho.")}
        </p>
        <Button variant="danger" size="sm" className="justify-self-start" onClick={() => rodar(onParar)} disabled={ocupado}>
          <Square className="w-3.5 h-3.5" />
          {tx("Tirar o jogo da tela")}
        </Button>
        {erro ? <p className="text-[12px] text-pink">{erro}</p> : null}
      </div>
    );

  return (
    <div className="grid gap-3">
      <div className="card grid gap-2 p-4">
        <div className="flex items-center gap-2">
          <MonitorUp className="w-4 h-4 text-accent" />
          <span className="label-cap">{tx("Compartilhar tela")}</span>
        </div>
        <p className="text-[12px] text-ink-mute">
          {tx("Alguém joga de verdade e o avatar é a cara e a voz do canal. Escolha a janela do jogo e marque “Compartilhar áudio”.")}
        </p>
        <Button size="sm" className="justify-self-start" onClick={() => rodar(onTela)} disabled={ocupado}>
          {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MonitorUp className="w-3.5 h-3.5" />}
          {tx("Escolher tela ou janela")}
        </Button>
      </div>

      <div className="card grid gap-2 p-4">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-accent" />
          <span className="label-cap">{tx("Vídeo gravado")}</span>
        </div>
        <p className="text-[12px] text-ink-mute">
          {tx("Um vídeo de gameplay do seu computador, tocando em repetição. Atenção: as plataformas punem gravação apresentada como ao vivo (o TikTok derruba a live), e gameplay de outra pessoa tem direito autoral.")}
        </p>
        <label className="flex items-start gap-2 text-[12px] text-ink cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={declarou} onChange={(e) => setDeclarou(e.target.checked)} />
          <span>{tx(DECLARACAO_VIDEO_LIVE)}</span>
        </label>
        <label
          className={
            declarou && !ocupado
              ? "inline-flex min-h-8 cursor-pointer items-center gap-2 justify-self-start rounded-full bg-white px-4 text-[13px] font-bold text-bg hover:bg-ink-mute"
              : "inline-flex min-h-8 cursor-not-allowed items-center gap-2 justify-self-start rounded-full bg-white/40 px-4 text-[13px] font-bold text-bg"
          }
        >
          {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Film className="w-3.5 h-3.5" />}
          {tx("Escolher vídeo")}
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            disabled={!declarou || ocupado}
            onChange={(e) => void escolherVideo(e.target.files?.[0])}
          />
        </label>
      </div>
      {erro ? <p className="text-[12px] text-pink">{erro}</p> : null}
    </div>
  );
}

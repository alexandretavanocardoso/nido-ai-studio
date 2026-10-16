"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteTrack, type RemoteTrackPublication } from "livekit-client";
import { cn } from "@/lib/cn";

/** Sem vídeo na sala: a prévia do NIDO não vai para a sala; o avatar só chega quando a live entra no ar. */
const AGUARDANDO = "Aguardando o avatar… Ele aparece aqui quando você clicar em “Entrar no ar” no NIDO.";

/** Volume do som do jogo: abaixo da voz do avatar. */
const VOLUME_JOGO = 0.35;

/**
 * Palco da live (/live/palco#u=…&t=…): o que o público vê. Sem jogo, só o
 * avatar; com jogo (tela compartilhada ou vídeo gravado, publicado como "tela"
 * pelo operador), o jogo ocupa a tela e o avatar fica no canto — ou embaixo,
 * na tela em pé (TikTok). Serve para a fonte de navegador do OBS e para o
 * LiveKit gravar e mandar às redes (com `limpo=1`, sem nenhum texto).
 * O endereço da sala e o token (só assiste) vêm no fragmento do link.
 */
export function Palco() {
  const [avatar, setAvatar] = useState<RemoteTrack | null>(null);
  const [jogo, setJogo] = useState<RemoteTrack | null>(null);
  const [aviso, setAviso] = useState<string | null>("Conectando…");
  const [semSom, setSemSom] = useState(false);
  const [limpo, setLimpo] = useState(false);
  const [emPe, setEmPe] = useState(false);
  const salaRef = useRef<Room | null>(null);
  const videoAvatar = useRef<HTMLVideoElement>(null);
  const videoJogo = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const medir = () => setEmPe(window.innerHeight > window.innerWidth);
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);

  useEffect(() => {
    const p = new URLSearchParams(location.hash.slice(1));
    setLimpo(p.get("limpo") === "1");
    const url = p.get("u");
    const token = p.get("t");
    if (!url || !token) {
      setAviso("Link do palco incompleto. Copie de novo na página da live.");
      return;
    }
    const room = new Room({ adaptiveStream: false });
    salaRef.current = room;
    /** Áudios tocando (o do jogo fica mais baixo). */
    const audios = new Map<string, HTMLMediaElement>();

    const mostrar = (t: RemoteTrack, pub: RemoteTrackPublication) => {
      const ehJogo = pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio;
      if (t.kind === Track.Kind.Video) {
        if (ehJogo) setJogo(t);
        else {
          setAvatar(t);
          setAviso(null);
        }
      } else if (t.kind === Track.Kind.Audio) {
        const el = t.attach();
        el.volume = ehJogo ? VOLUME_JOGO : 1;
        audios.set(t.sid ?? String(audios.size), el);
      }
    };
    const tirar = (t: RemoteTrack, pub: RemoteTrackPublication) => {
      t.detach().forEach((el) => el.remove());
      if (t.sid) audios.delete(t.sid);
      if (t.kind !== Track.Kind.Video) return;
      if (pub.source === Track.Source.ScreenShare) setJogo((j) => (j === t ? null : j));
      else {
        setAvatar((a) => (a === t ? null : a));
        setAviso(AGUARDANDO);
      }
    };
    room.on(RoomEvent.TrackSubscribed, (t, pub) => mostrar(t, pub));
    room.on(RoomEvent.TrackUnsubscribed, (t, pub) => tirar(t, pub));
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => setSemSom(!room.canPlaybackAudio));
    room.on(RoomEvent.Disconnected, () => setAviso("Desconectado. Recarregue a página."));
    room
      .connect(url, token, { autoSubscribe: true })
      .then(() => {
        setAviso(AGUARDANDO);
        setSemSom(!room.canPlaybackAudio);
        for (const pa of room.remoteParticipants.values())
          for (const pub of pa.trackPublications.values()) if (pub.track) mostrar(pub.track, pub);
      })
      .catch(() => setAviso("Não consegui entrar na sala. O link pode ter vencido."));
    return () => {
      salaRef.current = null;
      audios.forEach((el) => el.remove());
      void room.disconnect();
    };
  }, []);

  useEffect(() => {
    const el = videoAvatar.current;
    if (!el || !avatar) return;
    avatar.attach(el);
    return () => void avatar.detach(el);
  }, [avatar]);
  useEffect(() => {
    const el = videoJogo.current;
    if (!el || !jogo) return;
    jogo.attach(el);
    return () => void jogo.detach(el);
  }, [jogo]);

  const comJogo = !!jogo;

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* Jogo: tela cheia (deitada) ou faixa de cima (em pé). */}
      <video
        ref={videoJogo}
        autoPlay
        playsInline
        muted
        className={cn(
          "absolute object-contain",
          !comJogo && "hidden",
          emPe ? "inset-x-0 top-0 aspect-video w-full" : "inset-0 h-full w-full",
        )}
      />
      {/* Avatar: o palco inteiro sem jogo (preenche, cortando a sobra); com jogo, quadro no canto ou a parte de baixo. */}
      <video
        ref={videoAvatar}
        autoPlay
        playsInline
        muted
        className={cn(
          "absolute",
          !comJogo
            ? "inset-0 h-full w-full object-cover"
            : emPe
              ? "inset-x-0 bottom-0 top-[56.25vw] w-full object-cover"
              : "bottom-[3%] right-[2%] aspect-square w-[24%] rounded-2xl border-4 border-white/90 object-cover shadow-2xl",
        )}
      />
      {aviso && !limpo ? (
        <p className="absolute inset-x-0 bottom-6 text-center text-[13px] text-white/60">{aviso}</p>
      ) : null}
      {semSom && !limpo ? (
        <button
          type="button"
          onClick={() => void salaRef.current?.startAudio()}
          className="absolute right-4 top-4 rounded-full bg-white px-4 py-2 text-[13px] font-bold text-black cursor-pointer"
        >
          Ativar o som
        </button>
      ) : null}
    </div>
  );
}

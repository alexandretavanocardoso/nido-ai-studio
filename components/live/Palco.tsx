"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";

/**
 * Palco da live (/live/palco#u=…&t=…): só o avatar, em tela cheia, para a
 * fonte de navegador do OBS (ou uma janela capturada). O endereço da sala e o
 * token (só assiste) vêm no fragmento do link, que não vai para o servidor.
 */
export function Palco() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [aviso, setAviso] = useState<string | null>("Conectando…");
  const [semSom, setSemSom] = useState(false);
  const salaRef = useRef<Room | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(location.hash.slice(1));
    const url = p.get("u");
    const token = p.get("t");
    if (!url || !token) {
      setAviso("Link do palco incompleto. Copie de novo na página da live.");
      return;
    }
    const room = new Room({ adaptiveStream: false });
    salaRef.current = room;
    const mostrar = (t: RemoteTrack) => {
      if (t.kind === Track.Kind.Video && videoRef.current) {
        t.attach(videoRef.current);
        setAviso(null);
      } else if (t.kind === Track.Kind.Audio && audioRef.current) t.attach(audioRef.current);
    };
    room.on(RoomEvent.TrackSubscribed, mostrar);
    room.on(RoomEvent.TrackUnsubscribed, (t) => {
      t.detach();
      if (t.kind === Track.Kind.Video) setAviso("Aguardando o avatar…");
    });
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => setSemSom(!room.canPlaybackAudio));
    room.on(RoomEvent.Disconnected, () => setAviso("Desconectado. Recarregue a página."));
    room
      .connect(url, token, { autoSubscribe: true })
      .then(() => {
        setAviso("Aguardando o avatar…");
        setSemSom(!room.canPlaybackAudio);
        for (const pa of room.remoteParticipants.values())
          for (const pub of pa.trackPublications.values()) if (pub.track) mostrar(pub.track);
      })
      .catch(() => setAviso("Não consegui entrar na sala. O link pode ter vencido."));
    return () => {
      salaRef.current = null;
      void room.disconnect();
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black">
      <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-contain" />
      <audio ref={audioRef} autoPlay />
      {aviso ? (
        <p className="absolute inset-x-0 bottom-6 text-center text-[13px] text-white/60">{aviso}</p>
      ) : null}
      {semSom ? (
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

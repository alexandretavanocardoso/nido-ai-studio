"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Film, ImageIcon } from "lucide-react";
import type { FotoDaSombra, VideoDaSombra } from "@/app/api/sombra/route";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRecursos } from "@/components/RecursosProvider";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";
import { HistoricoSombra } from "./HistoricoSombra";
import { SombraFoto } from "./SombraFoto";
import { SombraVideo } from "./SombraVideo";

type Aba = "foto" | "video";

/**
 * /app/sombra — a Sombra sem personagem: troca a pessoa de uma foto ou de um
 * vídeo pela imagem que a pessoa envia, sem criar um personagem antes.
 */
export function Sombra() {
  const { user } = useAuth();
  const recursos = useRecursos();
  const [aba, setAba] = useState<Aba>("foto");
  const [historico, setHistorico] = useState<{
    fotos: FotoDaSombra[];
    videos: VideoDaSombra[];
  }>({ fotos: [], videos: [] });

  const carregar = useCallback(async () => {
    const r = await fetch("/api/sombra", { cache: "no-store" }).catch(
      () => null,
    );
    const b = await r?.json().catch(() => null);
    if (r?.ok && b)
      setHistorico({ fotos: b.fotos ?? [], videos: b.videos ?? [] });
  }, []);

  useEffect(() => {
    if (user) void carregar();
  }, [user, carregar]);

  return (
    <main className="mx-auto grid w-full max-w-[1240px] gap-6 px-4 pb-16 pt-2 sm:px-6 lg:px-10">
      <header className="grid gap-1">
        <h1 className="display text-2xl uppercase text-ink">{tx("Sombra")}</h1>
        <p className="max-w-2xl text-[14px] text-ink-mute">
          {tx(
            "Troque a pessoa de uma foto ou de um vídeo por quem você quiser, só enviando as imagens. Não precisa criar um personagem.",
          )}
        </p>
      </header>

      {user === null ? null : !user ? (
        <div className="card p-8 text-center text-ink-mute">
          <Link href="/auth/login" className="font-bold text-accent">
            {tx("Entre na sua conta")}
          </Link>{" "}
          {tx("para usar a Sombra.")}
        </div>
      ) : !recursos.armazenamento ? (
        <p className="text-[13px] text-ink-dim">
          {tx("A Sombra precisa do armazenamento configurado.")}
        </p>
      ) : (
        <>
          <div
            role="tablist"
            className="flex w-fit gap-1 rounded-full border border-line bg-bg p-1"
          >
            {(
              [
                ["foto", tx("Imagem"), ImageIcon],
                ["video", tx("Vídeo"), Film],
              ] as const
            ).map(([id, rotulo, Icone]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={aba === id}
                onClick={() => setAba(id)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition",
                  aba === id
                    ? "bg-accent text-bg"
                    : "text-ink-mute hover:text-ink",
                )}
              >
                <Icone className="h-4 w-4" />
                {rotulo}
              </button>
            ))}
          </div>

          {/* As duas ficam montadas: trocar de aba não perde o que já foi enviado. */}
          <div className={aba === "foto" ? undefined : "hidden"}>
            <SombraFoto
              onGerada={(foto) =>
                setHistorico((h) => ({ ...h, fotos: [foto, ...h.fotos] }))
              }
            />
          </div>
          <div className={aba === "video" ? undefined : "hidden"}>
            <SombraVideo onEnviado={() => void carregar()} />
          </div>

          <HistoricoSombra
            tipo={aba}
            fotos={historico.fotos}
            videos={historico.videos}
            onMudou={carregar}
          />
        </>
      )}
    </main>
  );
}

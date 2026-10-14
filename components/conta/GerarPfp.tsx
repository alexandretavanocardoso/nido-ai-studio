"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Download,
  ImagePlus,
  Loader2,
  Maximize2,
  X,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import { useCreditos } from "@/components/creditos/CreditosProvider";
import { Button } from "@/components/ui/Button";
import { confirmar } from "@/components/ui/Confirmacao";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/cn";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import { LIMITE_PFPS } from "@/lib/pfp";
import { STORAGE_KINDS } from "@/lib/storage/env";
import { downloadUrl, fileUrl, uploadFile } from "@/lib/storage/client";

/** Botão redondo sobre a imagem: fundo escuro translúcido para ler em qualquer PFP. */
const ICONE_SOBRE_A_IMAGEM =
  "grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80 disabled:opacity-60";

/**
 * Conta → Perfil → "Gerar meu PFP": a foto da pessoa (enviada agora ou a foto
 * de perfil) no estilo da arte do NFT, pelo GPT Image. Ver lib/pfp-server.ts.
 */
export function GerarPfp({ fotoDoPerfil }: { fotoDoPerfil: string | null }) {
  const { conta, recarregar } = useCreditos();
  // Só o admin exclui; para os outros, o limite é o total da vida da conta.
  const admin = !!conta?.admin;
  const [pfps, setPfps] = useState<string[] | null>(null);
  const [gerando, setGerando] = useState<"perfil" | "envio" | null>(null);
  const [usando, setUsando] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  /** PFP aberto em tela cheia. */
  const [aberta, setAberta] = useState<string | null>(null);
  const noLimite = (pfps?.length ?? 0) >= LIMITE_PFPS;

  useEffect(() => {
    if (!aberta) return;
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && setAberta(null);
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aberta]);
  const [erro, setErro] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/conta/pfp", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => setPfps(b?.pfps ?? []))
      .catch(() => setPfps([]));
  }, []);

  async function gerar(origem: "perfil" | File) {
    setErro(null);
    setGerando(origem === "perfil" ? "perfil" : "envio");
    try {
      const key = origem === "perfil" ? null : await uploadFile(origem, "refs");
      const r = await fetch("/api/conta/pfp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const b = await r.json().catch(() => null);
      if (!r.ok || !b?.key)
        return setErro(txErro(b?.error ?? "Falha. Tente de novo."));
      setPfps((p) => [b.key, ...(p ?? [])]);
    } catch (e) {
      setErro((e as Error).message || tx("Falha de rede. Tente de novo."));
    } finally {
      setGerando(null);
      recarregar();
    }
  }

  function escolherArquivo(f: File | undefined) {
    if (arquivo.current) arquivo.current.value = "";
    if (!f) return;
    const regras = STORAGE_KINDS.refs;
    if (!(regras.types as readonly string[]).includes(f.type))
      return setErro(tx("Envie uma foto em JPG, PNG ou WebP."));
    if (f.size > regras.maxBytes)
      return setErro(tx("A foto passa de 10 MB."));
    gerar(f);
  }

  async function usarComoFoto(key: string) {
    setErro(null);
    setUsando(key);
    const r = await authClient.updateUser({ image: fileUrl(key) });
    if (r.error) setErro(tx("Não consegui trocar a foto de perfil. Tente de novo."));
    setUsando(null);
  }

  async function excluir(key: string) {
    const ok = await confirmar({
      titulo: tx("Excluir este PFP?"),
      mensagem: tx("A imagem é apagada e não dá para recuperar."),
      confirmar: tx("Excluir"),
      tom: "perigo",
    });
    if (!ok) return;
    setErro(null);
    setExcluindo(key);
    try {
      const r = await fetch("/api/conta/pfp", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const b = await r.json().catch(() => null);
      if (!r.ok) return setErro(txErro(b?.error ?? "Falha. Tente de novo."));
      setPfps((p) => (p ?? []).filter((k) => k !== key));
    } catch {
      setErro(tx("Falha de rede. Tente de novo."));
    } finally {
      setExcluindo(null);
    }
  }

  return (
    <section className="card grid grid-cols-1 gap-4 p-5">
      <div>
        <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          <Sparkles className="h-4 w-4" /> {tx("Gerar meu PFP")}
        </div>
        <p className="mt-0.5 text-[12.5px] text-ink-mute">
          {tx(
            "Transforme sua foto num avatar no estilo NIDO, com o colar da marca. Baixe ou use como foto de perfil.",
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {fotoDoPerfil ? (
          <Button
            variant="accent"
            onClick={() => gerar("perfil")}
            disabled={!!gerando || noLimite}
          >
            {gerando === "perfil" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fotoDoPerfil} alt="" className="h-5 w-5 rounded-full object-cover" />
            )}
            {tx("Usar minha foto de perfil")}
          </Button>
        ) : null}
        <Button
          variant={fotoDoPerfil ? "ghost" : "accent"}
          onClick={() => arquivo.current?.click()}
          disabled={!!gerando || noLimite}
        >
          {gerando === "envio" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImagePlus className="h-4 w-4" />
          )}
          {tx("Enviar uma foto")}
        </Button>
        <input
          ref={arquivo}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => escolherArquivo(e.target.files?.[0])}
        />
      </div>

      {pfps ? (
        <p className="-mt-2 text-[12px] text-ink-dim">
          {noLimite
            ? `${tx("Você já gerou os")} ${LIMITE_PFPS} ${tx("PFPs da sua conta.")}`
            : `${pfps.length} ${tx("de")} ${LIMITE_PFPS} ${tx("PFPs gerados.")}`}
        </p>
      ) : null}

      {gerando ? (
        <p className="text-[12.5px] text-ink-dim">
          {tx("Gerando o PFP. Leva até um minuto.")}
        </p>
      ) : null}
      {erro ? (
        <p className="text-[12.5px] text-pink" role="alert">
          {erro}
        </p>
      ) : null}

      {pfps && pfps.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {pfps.map((key) => {
            const atual = fotoDoPerfil === fileUrl(key);
            return (
              <div
                key={key}
                className={cn(
                  "overflow-hidden rounded-2xl border bg-bg",
                  atual ? "border-ok/60" : "border-line",
                )}
              >
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setAberta(key)}
                    aria-label={tx("Abrir")}
                    className="block w-full cursor-zoom-in"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={fileUrl(key)}
                      alt={tx("PFP gerado")}
                      className="aspect-square w-full object-cover"
                    />
                  </button>
                  {atual ? (
                    <span className="absolute left-2 top-2 inline-flex h-6 items-center gap-1 rounded-full bg-ok px-2 text-[11px] font-bold text-bg">
                      <Check className="h-3 w-3" strokeWidth={3} />
                      {tx("Sua foto")}
                    </span>
                  ) : null}
                  <div className="absolute right-2 top-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAberta(key)}
                      aria-label={tx("Abrir")}
                      title={tx("Abrir")}
                      className={ICONE_SOBRE_A_IMAGEM}
                    >
                      <Maximize2 className="h-4 w-4" />
                    </button>
                    <a
                      href={downloadUrl(key, "nido-pfp.jpg")}
                      aria-label={tx("Baixar")}
                      title={tx("Baixar")}
                      className={ICONE_SOBRE_A_IMAGEM}
                    >
                      <Download className="h-4 w-4" />
                    </a>
                    {atual || !admin ? null : (
                      <button
                        type="button"
                        onClick={() => excluir(key)}
                        disabled={excluindo === key}
                        aria-label={tx("Excluir")}
                        title={tx("Excluir")}
                        className={cn(ICONE_SOBRE_A_IMAGEM, "hover:text-pink")}
                      >
                        {excluindo === key ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <div className="p-2">
                  {atual ? (
                    <div className="flex h-9 items-center justify-center text-[12.5px] text-ink-dim">
                      {tx("Foto de perfil atual")}
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 w-full whitespace-nowrap"
                      onClick={() => usarComoFoto(key)}
                      disabled={!!usando}
                    >
                      {usando === key ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <UserRound className="h-3.5 w-3.5" />
                      )}
                      {tx("Usar como foto")}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {aberta ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={tx("PFP gerado")}
          onClick={() => setAberta(null)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4 backdrop-blur-sm"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileUrl(aberta)}
            alt={tx("PFP gerado")}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88dvh] w-auto max-w-full rounded-2xl object-contain shadow-2xl"
          />
          <div className="absolute right-4 top-4 flex gap-2">
            <a
              href={downloadUrl(aberta, "nido-pfp.jpg")}
              onClick={(e) => e.stopPropagation()}
              aria-label={tx("Baixar")}
              title={tx("Baixar")}
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            >
              <Download className="h-5 w-5" />
            </a>
            <button
              type="button"
              onClick={() => setAberta(null)}
              aria-label={tx("Fechar")}
              title={tx("Fechar")}
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

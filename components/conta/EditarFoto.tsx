"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { shrinkDataUrl } from "@/lib/image-resize";
import { tx } from "@/lib/i18n/tx";
import { STORAGE_KINDS } from "@/lib/storage/env";
import { fileUrl, uploadFile } from "@/lib/storage/client";

/** Lado da foto de perfil enviada, em pixels (o avatar aparece no máximo com 64). */
const LADO_FOTO = 512;

const lerComoDataUrl = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error(tx("Não consegui ler essa imagem.")));
    r.readAsDataURL(f);
  });

/**
 * A foto do Perfil, clicável: troca a foto de perfil por uma imagem enviada.
 * A foto é reduzida no navegador e fica no armazenamento da conta; a limpeza
 * de arquivos não apaga a que é a foto de perfil (lib/storage/cleanup.ts).
 */
export function EditarFoto({
  imagem,
  inicial,
  onErro,
}: {
  imagem: string | null;
  /** Letra mostrada quando não há foto. */
  inicial: string;
  onErro: (erro: string | null) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  async function trocar(f: File | undefined) {
    if (arquivo.current) arquivo.current.value = "";
    if (!f) return;
    const regras = STORAGE_KINDS.refs;
    if (!(regras.types as readonly string[]).includes(f.type))
      return onErro(tx("Envie uma foto em JPG, PNG ou WebP."));
    if (f.size > regras.maxBytes) return onErro(tx("A foto passa de 10 MB."));
    onErro(null);
    setEnviando(true);
    try {
      const reduzida = await shrinkDataUrl(await lerComoDataUrl(f), LADO_FOTO, 0.9);
      const blob = await (await fetch(reduzida)).blob();
      const key = await uploadFile(blob, "refs");
      const r = await authClient.updateUser({ image: fileUrl(key) });
      if (r.error)
        onErro(tx("Não consegui trocar a foto de perfil. Tente de novo."));
    } catch (e) {
      onErro((e as Error).message || tx("Falha de rede. Tente de novo."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={() => arquivo.current?.click()}
        disabled={enviando}
        aria-label={tx("Editar foto")}
        title={tx("Editar foto")}
        className="group relative grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#5c2a1f,#aa7d43)] text-2xl font-bold text-ink"
      >
        {imagem ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagem} alt="" className="h-full w-full object-cover" />
        ) : (
          inicial
        )}
        <span
          className={
            enviando
              ? "absolute inset-0 grid place-items-center bg-black/60 text-white"
              : "absolute inset-0 grid place-items-center bg-black/60 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
          }
        >
          {enviando ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Camera className="h-5 w-5" />
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={() => arquivo.current?.click()}
        disabled={enviando}
        className="text-[11.5px] font-semibold text-accent hover:underline disabled:opacity-60"
      >
        {tx("Editar foto")}
      </button>
      <input
        ref={arquivo}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => trocar(e.target.files?.[0])}
      />
    </div>
  );
}

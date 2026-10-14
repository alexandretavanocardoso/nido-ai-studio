"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";

/**
 * Copia o link do palco (/live/palco#u=…&t=…): a página que mostra só o
 * avatar, para a fonte de navegador do OBS. O acesso vale até o fim da live.
 */
export function LinkDoPalco({ id, rotulo }: { id: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function copiar() {
    setErro(null);
    const res = await fetch(`/api/live/${id}/palco`, { method: "POST" }).catch(() => null);
    const b = (await res?.json().catch(() => null)) as { url?: string; token?: string; error?: string } | null;
    if (!res?.ok || !b?.url || !b.token)
      return setErro(txErro(b?.error ?? `Falha (HTTP ${res?.status ?? 0}).`));
    const link = `${location.origin}/live/palco#${new URLSearchParams({ u: b.url, t: b.token })}`;
    await navigator.clipboard.writeText(link).catch(() => window.prompt(tx("Link do palco"), link));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }
  return (
    <div className="grid gap-1">
      <Button variant="ghost" size="sm" onClick={copiar} className="justify-self-start">
        <Copy className="w-3.5 h-3.5" />
        {copiado ? tx("Link copiado") : rotulo ?? tx("Copiar link do palco (OBS)")}
      </Button>
      <span className="text-[12px] text-ink-dim">
        {tx("Quem tiver o link vê a live: não compartilhe.")}
      </span>
      {erro ? <span className="text-[12px] text-pink">{erro}</span> : null}
    </div>
  );
}

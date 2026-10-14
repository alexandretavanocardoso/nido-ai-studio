"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import {
  REDES_TRANSMISSAO,
  type DestinoTransmissao,
  type EstadoTransmissao,
  type RedeTransmissao,
} from "@/lib/live/tipos";

const REDES = Object.keys(REDES_TRANSMISSAO) as RedeTransmissao[];
/** Chaves guardadas neste navegador (só quando a pessoa pede). */
const GUARDADO = "nido-live-destinos";

type Formulario = Record<RedeTransmissao, { ligada: boolean; servidor: string; chave: string }>;

function inicial(): { form: Formulario; lembrar: boolean } {
  const form = Object.fromEntries(
    REDES.map((r) => [r, { ligada: false, servidor: REDES_TRANSMISSAO[r].servidor, chave: "" }]),
  ) as Formulario;
  try {
    const salvo = JSON.parse(localStorage.getItem(GUARDADO) ?? "null") as Partial<Formulario> | null;
    if (salvo) {
      for (const r of REDES) if (salvo[r]) form[r] = { ...form[r], ...salvo[r] };
      return { form, lembrar: true };
    }
  } catch {}
  return { form, lembrar: false };
}

const NOME_ESTADO: Record<EstadoTransmissao["estado"], string> = {
  iniciando: "Conectando",
  ativa: "No ar",
  terminou: "Parou",
  falhou: "Falhou",
};

/**
 * Transmitir direto para as redes, sem OBS: a pessoa marca as redes e cola o
 * servidor e a chave de cada uma. Com a live no ar, começa sozinho assim que o
 * avatar aparece (ou pelo botão). As chaves vão para o servidor só na hora de
 * começar; ficam neste navegador apenas com "Lembrar".
 */
export function PainelTransmissao({
  id,
  noAr,
  avatarNoAr,
  transmitindo,
}: {
  id: string;
  noAr: boolean;
  avatarNoAr: boolean;
  /** Redes que o servidor diz estarem transmitindo (página recarregada). */
  transmitindo: RedeTransmissao[];
}) {
  const [{ form, lembrar }, setTudo] = useState(inicial);
  const [estados, setEstados] = useState<EstadoTransmissao[]>([]);
  const [ativa, setAtiva] = useState(transmitindo.length > 0);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const automatico = useRef(false);

  const ligadas = REDES.filter((r) => form[r].ligada);
  const destinos: DestinoTransmissao[] = ligadas.map((r) => ({
    rede: r,
    servidor: form[r].servidor,
    chave: form[r].chave,
  }));
  const completo = ligadas.length > 0 && destinos.every((d) => d.servidor.trim() && d.chave.trim());
  const destinosRef = useRef(destinos);
  destinosRef.current = destinos;

  function mudar(r: RedeTransmissao, campo: Partial<Formulario[RedeTransmissao]>) {
    setTudo((t) => ({ ...t, form: { ...t.form, [r]: { ...t.form[r], ...campo } } }));
  }

  // "Lembrar neste navegador": guarda ou apaga as chaves daqui.
  useEffect(() => {
    try {
      if (lembrar) localStorage.setItem(GUARDADO, JSON.stringify(form));
      else localStorage.removeItem(GUARDADO);
    } catch {}
  }, [form, lembrar]);

  const conferir = useCallback(async () => {
    const res = await fetch(`/api/live/${id}/transmitir`, { cache: "no-store" }).catch(() => null);
    const b = (await res?.json().catch(() => null)) as { redes?: EstadoTransmissao[] } | null;
    if (b?.redes) setEstados(b.redes);
  }, [id]);

  useEffect(() => {
    if (!ativa) return;
    void conferir();
    const t = setInterval(conferir, 10_000);
    return () => clearInterval(t);
  }, [ativa, conferir]);

  const comecar = useCallback(async () => {
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch(`/api/live/${id}/transmitir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinos: destinosRef.current }),
      });
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return setErro(txErro(b.error ?? `Falha (HTTP ${res.status}).`));
      setAtiva(true);
      setEstados(destinosRef.current.map((d) => ({ rede: d.rede, estado: "iniciando" })));
    } finally {
      setEnviando(false);
    }
  }, [id]);

  // Live no ar com redes prontas: começa sozinho quando o avatar aparece.
  useEffect(() => {
    if (!noAr || !avatarNoAr || ativa || !completo || automatico.current) return;
    automatico.current = true;
    void comecar();
  }, [noAr, avatarNoAr, ativa, completo, comecar]);

  async function parar() {
    await fetch(`/api/live/${id}/transmitir`, { method: "DELETE" }).catch(() => null);
    setAtiva(false);
    setEstados([]);
  }

  return (
    <div className="card p-4 grid gap-3">
      <div className="flex items-center gap-2">
        <Send className="w-4 h-4 text-accent" />
        <h2 className="label-cap">{tx("Transmitir para")}</h2>
      </div>

      {ativa ? (
        <>
          <ul className="grid gap-1.5 text-[13px]">
            {(estados.length ? estados : transmitindo.map((rede) => ({ rede, estado: "iniciando" as const }))).map(
              (e) => (
                <li key={e.rede} className="flex items-center gap-2">
                  <b className="w-20 text-ink">{REDES_TRANSMISSAO[e.rede].nome}</b>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-bold",
                      e.estado === "ativa"
                        ? "bg-pink/20 text-pink"
                        : e.estado === "falhou"
                          ? "bg-pink/10 text-pink"
                          : "bg-panel text-ink-mute",
                    )}
                  >
                    {tx(NOME_ESTADO[e.estado])}
                  </span>
                  {"erro" in e && e.erro ? <span className="truncate text-[12px] text-pink">{e.erro}</span> : null}
                </li>
              ),
            )}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="danger" onClick={parar}>
              <Square className="w-3.5 h-3.5" />
              {tx("Parar a transmissão")}
            </Button>
            {completo && avatarNoAr ? (
              <Button size="sm" variant="ghost" onClick={comecar} disabled={enviando}>
                {tx("Recomeçar")}
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          {REDES.map((r) => (
            <div key={r} className="grid gap-1.5">
              <label className="flex items-center gap-2 text-[13px] font-semibold text-ink cursor-pointer">
                <input type="checkbox" checked={form[r].ligada} onChange={(e) => mudar(r, { ligada: e.target.checked })} />
                {REDES_TRANSMISSAO[r].nome}
                {REDES_TRANSMISSAO[r].vertical ? (
                  <span className="text-[11px] font-normal text-ink-dim">{tx("(vídeo em pé)")}</span>
                ) : null}
              </label>
              {form[r].ligada ? (
                <div className="grid gap-1.5 pl-6">
                  <Input
                    value={form[r].servidor}
                    onChange={(e) => mudar(r, { servidor: e.target.value })}
                    placeholder={tx("Servidor (rtmp://… ou rtmps://…)")}
                  />
                  <Input
                    type="password"
                    autoComplete="off"
                    value={form[r].chave}
                    onChange={(e) => mudar(r, { chave: e.target.value })}
                    placeholder={tx("Chave de transmissão")}
                  />
                  <span className="text-[11px] text-ink-dim">{tx(REDES_TRANSMISSAO[r].onde)}</span>
                </div>
              ) : null}
            </div>
          ))}
          {ligadas.length > 0 && (
            <label className="flex items-center gap-2 text-[12px] text-ink-mute cursor-pointer">
              <input
                type="checkbox"
                checked={lembrar}
                onChange={(e) => setTudo((t) => ({ ...t, lembrar: e.target.checked }))}
              />
              {tx("Lembrar as chaves neste navegador")}
            </label>
          )}
          <span className="text-[12px] text-ink-dim">
            {noAr
              ? tx("Comece quando o avatar estiver no ar. Deixe a live aberta em cada rede antes (no YouTube, crie a transmissão; nas outras, basta a chave).")
              : tx("Com as redes prontas, a transmissão começa sozinha quando o avatar entrar no ar.")}
          </span>
          {noAr ? (
            <Button
              size="sm"
              variant="accent"
              className="justify-self-start"
              onClick={comecar}
              disabled={!completo || !avatarNoAr || enviando}
            >
              {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {ligadas.length > 1
                ? `${tx("Transmitir para")} ${ligadas.length} ${tx("redes")}`
                : tx("Começar a transmitir")}
            </Button>
          ) : null}
        </>
      )}
      {erro ? <p className="text-[12px] text-pink">{erro}</p> : null}
    </div>
  );
}

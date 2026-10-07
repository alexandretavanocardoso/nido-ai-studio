"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { copyToClipboard } from "@/lib/export";

/* ---------- formatos ---------- */

export const num = (v: number) => v.toLocaleString("pt-BR");
export const dinheiro = (v: number, moeda: string) =>
  v.toLocaleString("pt-BR", {
    style: "currency",
    currency: moeda === "BRL" ? "BRL" : "USD",
    minimumFractionDigits: 2,
  });
export const dia = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
export const diaHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
export const bytes = (b: number) =>
  b >= 1024 ** 3
    ? `${(b / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB`
    : `${(b / 1024 ** 2).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;

/** "há 5 min", "há 3 h", "há 2 dias". */
export function haQuanto(iso: string | null): string {
  if (!iso) return "nunca";
  const min = Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 60_000),
  );
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 60 * 24) return `há ${Math.round(min / 60)} h`;
  const d = Math.round(min / 1440);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

/** 1 crédito ≈ US$ 0,01 de custo de provedor. */
export const custoUSD = (creditos: number) => dinheiro(creditos / 100, "USD");

const MOTIVOS: Record<string, string> = {
  imagem: "Imagem",
  texto: "Texto com IA",
  video_troca: "Troca de pessoa em vídeo",
  video_criar: "Criar vídeo",
  video_legenda: "Legenda de vídeo",
  video_link: "Vídeo por link",
  video_fala: "Fala no vídeo",
  voz: "Voz",
  persona_treino: "Treino de persona",
  post_redes: "Post nas redes",
  estorno: "Estorno (geração falhou)",
  estorno_parcial: "Estorno parcial",
  bonus_cadastro: "Bônus de cadastro",
  ativacao_plano: "Plano ativado",
  renovacao_plano: "Plano renovado",
  recarga_plano: "Recarga mensal do plano",
  compra_pacote: "Compra de créditos",
  ajuste_admin: "Ajuste do admin",
  remocao_plano: "Plano removido",
};
export const nomeMotivo = (m: string) =>
  MOTIVOS[m] ?? m.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export const NOME_PLANO: Record<string, string> = {
  gratis: "Grátis",
  starter: "Starter",
  creator: "Creator",
  studio: "Studio",
};

const EXPLORER: Record<string, string> = {
  solana: "https://solscan.io/tx/",
  base: "https://basescan.org/tx/",
  arbitrum: "https://arbiscan.io/tx/",
  bnb: "https://bscscan.com/tx/",
  ethereum: "https://etherscan.io/tx/",
};

/** Link da transação no explorer (assinatura = hash na Solana; "rede:hash[:log]" nas EVM). */
export function linkExplorer(
  rede: string | null,
  assinatura: string | null,
): string | null {
  if (!assinatura || !rede || assinatura.startsWith("manual:")) return null;
  const hash = rede === "solana" ? assinatura : assinatura.split(":")[1];
  return hash && EXPLORER[rede] ? EXPLORER[rede] + hash : null;
}

/* ---------- dados ---------- */

/** GET em /api/admin/*, com recarregar e erro. */
export function useAdmin<T>(url: string | null) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    if (!url) return;
    let vivo = true;
    setCarregando(true);
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok)
          throw new Error(b.error ?? `Falha ao carregar (HTTP ${r.status}).`);
        if (vivo) {
          setDados(b as T);
          setErro(null);
        }
      })
      .catch((e) => vivo && setErro((e as Error).message))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [url, versao]);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  return { dados, erro, carregando, recarregar, setDados };
}

export async function acaoAdmin<T = unknown>(
  url: string,
  corpo: unknown,
): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error ?? `Falha (HTTP ${r.status}).`);
  return b as T;
}

/** Valor que só muda depois de `ms` sem digitar (para buscas). */
export function useAtrasado<T>(valor: T, ms = 300): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

/* ---------- peças visuais ---------- */

export function Kpi({
  rotulo,
  valor,
  detalhe,
  destaque,
  icone: Icone,
}: {
  rotulo: string;
  valor: React.ReactNode;
  detalhe?: React.ReactNode;
  destaque?: boolean;
  icone?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div
      className={cn("card p-4 sm:p-5 min-w-0", destaque && "border-accent/50")}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="label-cap truncate">{rotulo}</span>
        {Icone ? <Icone className="w-4 h-4 text-ink-dim shrink-0" /> : null}
      </div>
      <div className="mt-2 text-2xl sm:text-3xl font-bold text-ink tabular-nums truncate">
        {valor}
      </div>
      {detalhe ? (
        <div className="mt-1 text-[12px] text-ink-mute">{detalhe}</div>
      ) : null}
    </div>
  );
}

const TONS = {
  ok: "border-ok/40 bg-ok/10 text-ok",
  alerta: "border-accent/40 bg-accent/10 text-accent",
  erro: "border-pink/40 bg-pink/10 text-pink",
  neutro: "border-line bg-panel text-ink-mute",
} as const;

export function Selo({
  tom = "neutro",
  children,
}: {
  tom?: keyof typeof TONS;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold whitespace-nowrap",
        TONS[tom],
      )}
    >
      {children}
    </span>
  );
}

export function SeloPlano({
  plano,
  ativo = true,
}: {
  plano: string;
  ativo?: boolean;
}) {
  if (plano === "gratis" || !ativo)
    return (
      <Selo>
        {ativo ? "Grátis" : `${NOME_PLANO[plano] ?? plano} · vencido`}
      </Selo>
    );
  return (
    <Selo tom={plano === "studio" ? "alerta" : "ok"}>
      {NOME_PLANO[plano] ?? plano}
    </Selo>
  );
}

export function Secao({
  titulo,
  descricao,
  acoes,
  children,
}: {
  titulo: string;
  descricao?: string;
  acoes?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3 min-w-0">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-ink">{titulo}</h2>
          {descricao ? (
            <p className="text-[13px] text-ink-mute">{descricao}</p>
          ) : null}
        </div>
        {acoes}
      </div>
      {children}
    </section>
  );
}

/**
 * Tabela que cabe na largura disponível, sem barra de rolagem: as colunas têm
 * largura definida (`larguras`, "" = o que sobrar) e o texto longo é cortado
 * com reticências. Em telas muito estreitas dá para arrastar para o lado, mas
 * a barra não aparece.
 */
export function Tabela({
  colunas,
  larguras,
  children,
  minimo = 640,
}: {
  colunas: string[];
  /** Largura de cada coluna em px ("" ou 0 = flexível). */
  larguras?: Array<number | "">;
  children: React.ReactNode;
  minimo?: number;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <table
          className="w-full table-fixed text-left text-[13px]"
          style={{ minWidth: minimo }}
        >
          {larguras ? (
            <colgroup>
              {larguras.map((l, i) => (
                <col key={i} style={l ? { width: l } : undefined} />
              ))}
            </colgroup>
          ) : null}
          <thead>
            <tr className="border-b border-line bg-panel">
              {colunas.map((c, i) => (
                <th
                  key={i}
                  className="px-3 py-2.5 label-cap font-semibold truncate"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function Estado({
  carregando,
  erro,
  vazio,
  textoVazio,
}: {
  carregando: boolean;
  erro: string | null;
  vazio: boolean;
  textoVazio: string;
}) {
  if (erro)
    return (
      <div className="rounded-xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink">
        {erro}
      </div>
    );
  if (carregando && vazio)
    return (
      <div className="card p-10 grid place-items-center text-ink-mute">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  if (vazio)
    return (
      <div className="card p-10 text-center text-[13px] text-ink-mute">
        {textoVazio}
      </div>
    );
  return null;
}

export function Busca({
  valor,
  onChange,
  placeholder,
}: {
  valor: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative block w-full sm:w-80">
      <Search className="w-4 h-4 text-ink-dim absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-line bg-panel pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-dim focus:outline-none focus:border-accent"
        spellCheck={false}
      />
    </label>
  );
}

/** Grupo de filtros em pílulas (com contagem opcional). */
export function Filtros<T extends string>({
  opcoes,
  valor,
  onChange,
  rotulo,
}: {
  opcoes: Array<{ id: T; rotulo: string; n?: number }>;
  valor: T;
  onChange: (v: T) => void;
  rotulo: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={rotulo}
      className="flex gap-1 border border-line rounded-full p-1 bg-panel flex-wrap"
    >
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={valor === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "px-3 h-7 rounded-full text-[12px] font-semibold transition inline-flex items-center gap-1.5",
            valor === o.id
              ? "bg-card text-ink"
              : "text-ink-mute hover:text-ink",
          )}
        >
          {o.rotulo}
          {o.n !== undefined ? (
            <span className="text-ink-dim tabular-nums">{num(o.n)}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** Texto técnico curto (id, hash, carteira) com botão de copiar. */
export function Copiavel({
  texto,
  curto = 10,
}: {
  texto: string;
  curto?: number;
}) {
  const [ok, setOk] = useState(false);
  const exibido =
    texto.length > curto + 6
      ? `${texto.slice(0, curto)}…${texto.slice(-4)}`
      : texto;
  return (
    <button
      type="button"
      title={`Copiar: ${texto}`}
      onClick={async (e) => {
        e.stopPropagation();
        if (await copyToClipboard(texto)) {
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        }
      }}
      className="inline-flex items-center gap-1 mono text-[12px] text-ink-mute hover:text-ink"
    >
      {exibido}
      {ok ? (
        <Check className="w-3 h-3 text-ok" />
      ) : (
        <Copy className="w-3 h-3" />
      )}
    </button>
  );
}

export function Avatar({
  nome,
  imagem,
  tamanho = "h-8 w-8",
}: {
  nome: string;
  imagem: string | null;
  tamanho?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full overflow-hidden bg-accent/15 text-accent font-bold text-[13px] inline-flex items-center justify-center shrink-0",
        tamanho,
      )}
    >
      {imagem ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imagem}
          alt=""
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        nome.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

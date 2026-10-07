import { SECOES, type Pergunta } from "@/data/perguntas";
import { GERAR_NO_CLAUDE } from "@/data/prompts/gerar-no-claude";
import { extractJson } from "@/lib/extract-json";
import { readPath, writePath } from "@/lib/paths";
import type { Suggestion } from "@/lib/store";
import type { PontoEmAberto } from "@/lib/types";

const IDEIA_VAZIA =
  "(Ainda não escrevi a ideia. Faça as perguntas que precisar antes de montar a ficha.)";

/* ------------------------------------------------------------------ */
/* Montagem do prompt                                                  */
/* ------------------------------------------------------------------ */

export function buildPromptClaude(ideia: string): string {
  const valores: Record<string, string> = {
    ideia: ideia.trim() || IDEIA_VAZIA,
    perguntas: montarPerguntas(),
    esqueleto: montarEsqueleto(),
  };
  // passada única: o texto da ideia nunca é reinterpretado como placeholder
  return GERAR_NO_CLAUDE.replace(/\{\{(ideia|perguntas|esqueleto)\}\}/g, (_, k: string) => valores[k]);
}

export function montarPerguntas(): string {
  return SECOES.map((s, i) => {
    const linhas = s.perguntas.map((p) => `- ${p.id}: ${p.descricao}${sufixo(p)}`);
    return `${i + 1}. ${s.titulo.toUpperCase()}\n${linhas.join("\n")}`;
  }).join("\n\n");
}

function sufixo(p: Pergunta): string {
  if (p.tipo === "opcao" && p.opcoes) return ` — opções: ${p.opcoes.join(" | ")}`;
  if (p.tipo === "lista" && p.soOpcoes && p.opcoes) return ` — itens permitidos: ${p.opcoes.join(" | ")}`;
  return "";
}

function placeholder(p: Pergunta): unknown {
  switch (p.tipo) {
    case "texto":
      return "...";
    case "lista":
      return p.soOpcoes && p.opcoes ? p.opcoes.slice(0, 2) : ["...", "..."];
    case "opcao":
      return (p.opcoes ?? []).join(" | ");
    case "numero":
      return 50;
    case "ideias":
      return [{ formato: "Reels", titulo: "...", descricao: "..." }];
  }
}

export function montarEsqueleto(): string {
  const obj: Record<string, unknown> = {};
  for (const s of SECOES) for (const p of s.perguntas) writePath(obj, p.id, placeholder(p));
  obj.pontosEmAberto = [{ decisao: "...", porQueImporta: "..." }];
  return JSON.stringify(obj, null, 2);
}

/* ------------------------------------------------------------------ */
/* Importação da resposta                                              */
/* ------------------------------------------------------------------ */

export type ImportOutcome =
  | {
      ok: true;
      suggestions: Suggestion[];
      pontosEmAberto: PontoEmAberto[];
      /** Campos que vieram fora do formato esperado e foram descartados. */
      ignorados: string[];
    }
  | { ok: false; error: string };

export function parseRespostaClaude(raw: string): ImportOutcome {
  if (!raw.trim()) return { ok: false, error: "Cole aqui a resposta que a IA te devolveu." };

  let data: unknown;
  try {
    data = JSON.parse(extractJson(raw));
  } catch {
    return {
      ok: false,
      error:
        "Não consegui ler o JSON. Copie o bloco inteiro da resposta da IA (do { ao }) e cole de novo.",
    };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "A resposta precisa ser um objeto JSON com as seções da ficha." };
  }

  const suggestions: Suggestion[] = [];
  const ignorados: string[] = [];

  for (const secao of SECOES) {
    for (const p of secao.perguntas) {
      const bruto = readPath(data, p.id);
      if (bruto === undefined || bruto === null) continue;
      const r = coagir(p, bruto);
      if (r.ok) suggestions.push({ fieldId: p.id, valor: r.valor, origem: "suposicao" });
      else ignorados.push(`${p.id}: ${r.motivo}`);
    }
  }

  if (suggestions.length === 0) {
    return {
      ok: false,
      error:
        "O JSON não trouxe nenhum campo reconhecido. Confira se você usou o prompt gerado pelo site.",
    };
  }

  return {
    ok: true,
    suggestions,
    pontosEmAberto: lerPontosEmAberto((data as Record<string, unknown>).pontosEmAberto),
    ignorados,
  };
}

type Coercao = { ok: true; valor: unknown } | { ok: false; motivo: string };

function coagir(p: Pergunta, v: unknown): Coercao {
  switch (p.tipo) {
    case "texto": {
      if (typeof v !== "string" && typeof v !== "number") return { ok: false, motivo: "esperava texto" };
      const t = String(v).trim();
      if (!t) return { ok: false, motivo: "vazio" };
      return { ok: true, valor: p.max ? t.slice(0, p.max) : t };
    }
    case "lista": {
      const itens = paraLista(v);
      if (!itens) return { ok: false, motivo: "esperava uma lista" };
      let out = itens;
      if (p.soOpcoes && p.opcoes) {
        const canon = new Map(p.opcoes.map((o) => [norm(o), o]));
        out = itens.map((i) => canon.get(norm(i))).filter((x): x is string => !!x);
      }
      out = [...new Set(out)];
      if (p.max) out = out.slice(0, p.max);
      return out.length ? { ok: true, valor: out } : { ok: false, motivo: "nenhum item válido" };
    }
    case "opcao": {
      if (typeof v !== "string") return { ok: false, motivo: "esperava uma das opções" };
      const achada = (p.opcoes ?? []).find((o) => norm(o) === norm(v));
      return achada ? { ok: true, valor: achada } : { ok: false, motivo: `opção inválida "${v}"` };
    }
    case "numero": {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) return { ok: false, motivo: "esperava um número" };
      return { ok: true, valor: Math.min(100, Math.max(0, Math.round(n))) };
    }
    case "ideias": {
      if (!Array.isArray(v)) return { ok: false, motivo: "esperava uma lista de ideias" };
      const out = v
        .map((x) => {
          const o = x as Record<string, unknown> | null;
          const titulo = typeof o?.titulo === "string" ? o.titulo.trim() : "";
          if (!titulo) return null;
          return {
            formato: typeof o?.formato === "string" ? o.formato.trim() : "",
            titulo,
            descricao: typeof o?.descricao === "string" ? o.descricao.trim() : "",
          };
        })
        .filter((x): x is { formato: string; titulo: string; descricao: string } => !!x)
        .slice(0, 12);
      return out.length ? { ok: true, valor: out } : { ok: false, motivo: "nenhuma ideia válida" };
    }
  }
}

function paraLista(v: unknown): string[] | null {
  const bruto = Array.isArray(v) ? v : typeof v === "string" ? v.split(/,|\n/) : null;
  if (!bruto) return null;
  return bruto
    .map((x) => (typeof x === "string" || typeof x === "number" ? String(x).trim() : ""))
    .filter(Boolean);
}

function lerPontosEmAberto(v: unknown): PontoEmAberto[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      const o = x as Record<string, unknown> | null;
      const decisao = typeof o?.decisao === "string" ? o.decisao.trim() : "";
      if (!decisao) return null;
      return {
        decisao,
        porQueImporta: typeof o?.porQueImporta === "string" ? o.porQueImporta.trim() : "",
      };
    })
    .filter((x): x is PontoEmAberto => !!x)
    .slice(0, 5);
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-");
}

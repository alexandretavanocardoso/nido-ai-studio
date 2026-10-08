/** Primeiro texto não vazio entre as chaves dadas (a IA nem sempre usa a pedida). */
function campo(o: Record<string, unknown>, chaves: string[]): string {
  for (const k of Object.keys(o)) {
    const nome = k
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^a-z]/g, "");
    if (chaves.includes(nome) && typeof o[k] === "string" && o[k].trim())
      return o[k] as string;
  }
  return "";
}

/**
 * Lê as cenas da resposta da IA. O pedido é {"cenas": [{fala, cenario}]}, mas
 * a leitura aceita as variações que aparecem: lista solta, chaves em inglês
 * ou com acento, cena como texto puro, JSON cortado ou com sobras em volta.
 */
export function cenasDaResposta(
  texto: string,
): Array<{ fala: string; cenario: string }> {
  const FALA = ["fala", "falas", "speech", "texto", "text", "line", "dialogue"];
  const CENARIO = ["cenario", "setting", "background", "scene", "local", "fundo"];
  const ler = (bruto: string | undefined): unknown => {
    if (!bruto) return null;
    try {
      return JSON.parse(bruto);
    } catch {
      return null;
    }
  };
  const dado =
    ler(texto.match(/\{[\s\S]*\}/)?.[0]) ?? ler(texto.match(/\[[\s\S]*\]/)?.[0]);
  let lista: unknown[] = [];
  if (Array.isArray(dado)) lista = dado;
  else if (dado && typeof dado === "object") {
    const o = dado as Record<string, unknown>;
    const interna = Object.values(o).find(Array.isArray);
    lista = interna ?? [o];
  }
  const cenas = lista
    .map((c) =>
      typeof c === "string"
        ? { fala: c, cenario: "" }
        : c && typeof c === "object"
          ? {
              fala: campo(c as Record<string, unknown>, FALA),
              cenario: campo(c as Record<string, unknown>, CENARIO),
            }
          : { fala: "", cenario: "" },
    )
    .filter((c) => c.fala.trim());
  if (cenas.length) return cenas;

  // JSON quebrado (cortado, aspas soltas): pesca os pares pelo nome da chave.
  const aspas = (t: string) => {
    try {
      return JSON.parse(`"${t}"`) as string;
    } catch {
      return t;
    }
  };
  const falas = [...texto.matchAll(/"fala"\s*:\s*"((?:[^"\\]|\\.)*)"/g)];
  const cenarios = [
    ...texto.matchAll(/"cen[aá]rio"\s*:\s*"((?:[^"\\]|\\.)*)"/g),
  ];
  if (falas.length)
    return falas.map((m, i) => ({
      fala: aspas(m[1]),
      cenario: aspas(cenarios[i]?.[1] ?? ""),
    }));
  // Sem JSON nenhum: se for só texto corrido, é a fala inteira numa cena.
  const corrido = texto.replace(/```[a-z]*|```/g, "").trim();
  return /[{}\[\]]/.test(corrido) ? [] : [{ fala: corrido, cenario: "" }];
}

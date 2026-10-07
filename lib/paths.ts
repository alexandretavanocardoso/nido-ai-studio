/**
 * Helpers para ler/escrever um campo por "fieldId" em dot-notation
 * (ex.: "identidade.bio", "soul.gostos.comidas", "nicho.pilares").
 *
 * Usado pela UI de sugestões, pelo cadeado e pelas rotas de IA.
 */

type AnyObj = Record<string, unknown>;

export function readPath<T = unknown>(obj: unknown, path: string): T | undefined {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as AnyObj)[p];
  }
  return cur as T | undefined;
}

export function writePath(obj: AnyObj, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur: AnyObj = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p] as AnyObj;
  }
  cur[parts[parts.length - 1]] = value;
}

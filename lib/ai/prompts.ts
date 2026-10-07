import { promises as fs } from "node:fs";
import path from "node:path";

const PROMPT_DIR = path.join(process.cwd(), "data", "prompts");

type Templates =
  | "expandir-ficha"
  | "sugerir-campo"
  | "regenerar-secao"
  | "checar-consistencia"
  | "sistema-personagem";

const cache = new Map<string, string>();

async function readTemplate(name: Templates): Promise<string> {
  const cached = cache.get(name);
  if (cached) return cached;
  const text = await fs.readFile(path.join(PROMPT_DIR, `${name}.md`), "utf8");
  cache.set(name, text);
  return text;
}

/**
 * Substitui `{{nome}}` por valores. Chaves ausentes viram "não informado"
 * para não deixar o modelo vendo literais `{{...}}`.
 */
export function render(
  template: string,
  vars: Record<string, string | undefined | null>,
): string {
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_, key: string) => {
      const v = vars[key];
      return v == null || v === "" ? "(não informado)" : String(v);
    },
  );
}

export async function expandirPrompt(contexto: string): Promise<string> {
  const t = await readTemplate("expandir-ficha");
  return render(t, { contexto });
}

export async function sugerirCampoPrompt(args: {
  ficha: string;
  fieldId: string;
  fieldDescricao: string;
  instrucao?: string;
}): Promise<string> {
  const t = await readTemplate("sugerir-campo");
  return render(t, args);
}

export async function regenerarSecaoPrompt(args: {
  ficha: string;
  stepId: string;
  stepTitulo: string;
  campos: string;
  instrucao?: string;
  travados?: string;
}): Promise<string> {
  const t = await readTemplate("regenerar-secao");
  return render(t, args);
}

export async function checarConsistenciaPrompt(ficha: string): Promise<string> {
  const t = await readTemplate("checar-consistencia");
  return render(t, { ficha });
}

export async function sistemaPersonagemTemplate(): Promise<string> {
  return readTemplate("sistema-personagem");
}

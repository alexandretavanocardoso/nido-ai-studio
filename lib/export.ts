"use client";

import type { Character } from "./types";
import { assembleMasterPrompt } from "./prompts";

export function toMarkdown(c: Character): string {
  const p = assembleMasterPrompt(c);
  const d = c.identidade;
  const s = c.soul;
  const n = c.nicho;
  const v = c.voz;
  const m = c.monetizacao;

  const out: string[] = [];
  out.push(`# ${d.nome || "Sem nome"}`);
  if (d.bio) out.push(`\n> ${d.bio}\n`);

  out.push(`\n## Identidade`);
  out.push(line("Gênero", d.genero));
  out.push(line("Forma", d.forma));
  out.push(line("Idade aparente", d.idadeAparente));
  out.push(line("Cidade", d.cidade));
  out.push(line("Idioma", d.idioma));
  out.push(line("Sotaque", d.sotaque));

  out.push(`\n## Visual`);
  out.push(line("Cabelo", c.visual.cabelo));
  out.push(line("Pele", c.visual.pele));
  out.push(line("Olhos", c.visual.olhos));
  out.push(line("Roupa", c.visual.roupa));
  out.push(line("Acessórios", c.visual.acessorios));
  out.push(line("Traços marcantes", c.visual.tracosMarcantes));
  out.push(line("Paleta", c.visual.paleta));
  out.push(line("Referências", `${c.visual.referencias.length} imagem(ns)`));

  out.push(`\n## Personalidade`);
  out.push(line("Arquétipo", s.arquetipo));
  if (s.adjetivos.length) out.push(line("Adjetivos", s.adjetivos.join(", ")));
  const gostos = Object.entries(s.gostos)
    .filter(([, v]) => (v as string[]).length)
    .map(([k, v]) => `**${k}**: ${(v as string[]).join(", ")}`)
    .join("; ");
  if (gostos) out.push(`- Gostos — ${gostos}`);
  const odeia = Object.entries(s.odeia)
    .filter(([, v]) => (v as string[]).length)
    .map(([k, v]) => `**${k}**: ${(v as string[]).join(", ")}`)
    .join("; ");
  if (odeia) out.push(`- Odeia — ${odeia}`);
  out.push(line("Defende", s.valoresDefende));
  out.push(line("Combate", s.valoresCombate));
  out.push(line("Medos", s.medos));
  out.push(line("Manias", s.manias));
  out.push(line("Defeitos", s.defeitos));
  out.push(line("Origem", s.origem));
  out.push(line("Reage ao elogio", s.reacoes.elogio));
  out.push(line("Reage à crítica", s.reacoes.critica));
  out.push(line("Reage à polêmica", s.reacoes.polemica));
  out.push(line("Reage a hater", s.reacoes.hater));

  out.push(`\n## Nicho e Estratégia`);
  out.push(line("Nicho principal", n.principal));
  out.push(line("Subnicho", n.subnicho));
  out.push(line("Público", n.publico));
  out.push(line("Promessa", n.promessa));
  out.push(line("Diferencial", n.diferencial));
  if (n.plataformas.length) out.push(line("Plataformas", n.plataformas.join(", ")));
  if (n.performaFormatos.length) out.push(line("Formatos", n.performaFormatos.join(", ")));
  if (n.concorrentes.length) out.push(line("Referências", n.concorrentes.join(", ")));

  out.push(`\n## Voz e Linguagem`);
  out.push(line("Formalidade", `${v.tomFormalidade}/100`));
  out.push(line("Humor", `${v.tomHumor}/100`));
  out.push(line("Complexidade", `${v.tomComplexidade}/100`));
  out.push(line("Emoji", v.emoji));
  out.push(line("Frases", v.tamanhoFrase));
  if (v.girias.length) out.push(line("Gírias", v.girias.join(", ")));
  if (v.bordoes.length) out.push(line("Bordões", v.bordoes.join(", ")));
  if (v.proibidas.length) out.push(line("Proibidas", v.proibidas.join(", ")));
  out.push(line("Abertura", v.abertura));
  out.push(line("Fechamento", v.fechamento));
  const falas = v.exemplos.filter((e) => e.trim());
  if (falas.length) {
    out.push(`- Exemplos de falas:`);
    falas.forEach((f, i) => out.push(`  ${i + 1}. ${f}`));
  }

  out.push(`\n## Monetização`);
  if (m.modelos.length) out.push(line("Modelos", m.modelos.join(", ")));
  if (m.marcasOk.length) out.push(line("Marcas OK", m.marcasOk.join(", ")));
  if (m.marcasNao.length) out.push(line("Marcas NÃO", m.marcasNao.join(", ")));
  out.push(line("Limites éticos", m.limites));
  out.push(line("Transparência", m.transparencia));

  out.push(`\n## Prompt Mestre — Imagem\n\n\`\`\`\n${p.imagem}\n\`\`\``);
  out.push(`\n## Prompt Mestre — Roteiro/Texto\n\n\`\`\`\n${p.roteiro}\n\`\`\``);
  out.push(`\n## Prompt Mestre — Vídeo\n\n\`\`\`\n${p.video}\n\`\`\``);

  return out.filter(Boolean).join("\n");
}

function line(label: string, value?: string): string {
  if (!value || !String(value).trim()) return "";
  return `- **${label}**: ${value}`;
}

export function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  trigger(blob, filename);
}

export function downloadJson(filename: string, data: unknown) {
  const str = JSON.stringify(data, null, 2);
  downloadText(filename, str, "application/json;charset=utf-8");
}

function trigger(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadPng(node: HTMLElement, filename: string) {
  const html2canvas = (await import("html2canvas")).default;
  const canvas = await html2canvas(node, {
    backgroundColor: "#0a0a0a",
    scale: 2,
    useCORS: true,
  });
  canvas.toBlob((blob) => {
    if (blob) trigger(blob, filename);
  }, "image/png");
}

export async function downloadPdf(node: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const canvas = await html2canvas(node, {
    backgroundColor: "#0a0a0a",
    scale: 2,
    useCORS: true,
  });
  const img = canvas.toDataURL("image/png");
  const pdf = new jsPDF({
    orientation: canvas.width > canvas.height ? "landscape" : "portrait",
    unit: "pt",
    format: [canvas.width, canvas.height],
  });
  pdf.addImage(img, "PNG", 0, 0, canvas.width, canvas.height);
  pdf.save(filename);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

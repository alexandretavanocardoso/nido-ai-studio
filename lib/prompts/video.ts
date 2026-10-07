import type { Character } from "@/lib/types";

export function promptVideo(c: Character): string {
  const d = c.identidade;
  const v = c.visual;
  const n = c.nicho;
  const voz = c.voz;

  const linhas: string[] = [];

  const sujeito = [d.nome, d.genero && labelGenero(d.genero), d.idadeAparente]
    .filter(Boolean)
    .join(", ");
  linhas.push(`Vídeo de ${sujeito || "o personagem"}.`);

  const look: string[] = [];
  if (v.cabelo) look.push(`cabelo ${v.cabelo}`);
  if (v.roupa) look.push(`vestindo ${v.roupa}`);
  if (v.acessorios) look.push(`com ${v.acessorios}`);
  if (look.length) linhas.push(`Aparência: ${look.join(", ")}.`);

  if (v.paleta) linhas.push(`Paleta: ${v.paleta}.`);
  if (v.cenarios) linhas.push(`Cenários: ${v.cenarios}.`);

  const formato = n.performaFormatos[0] ?? "Reels vertical 9:16";
  const dur = n.performaDuracao ?? "30–45s";
  linhas.push(`Formato: ${formato}, duração ${dur}.`);

  if (voz.vozGenero || voz.vozTimbre || voz.vozRitmo) {
    const audio = [voz.vozGenero, voz.vozTimbre, voz.vozRitmo].filter(Boolean).join(", ");
    linhas.push(`Voz: ${audio}.`);
  }

  if (n.promessa) linhas.push(`Mensagem central: ${n.promessa}`);
  if (voz.abertura) linhas.push(`Abertura (gancho): ${voz.abertura}`);
  if (voz.fechamento) linhas.push(`CTA / fechamento: ${voz.fechamento}`);

  linhas.push("");
  linhas.push("Direção:");
  linhas.push("- Primeiros 2s: gancho visual + fala curta.");
  linhas.push("- Corte dinâmico, legendas grandes, ritmo do nicho.");

  return linhas.join("\n");
}

function labelGenero(g: string) {
  if (g === "feminino") return "mulher";
  if (g === "masculino") return "homem";
  return "pessoa não-binária";
}

import type { Character } from "@/lib/types";

/**
 * Prompt "Substituir pessoa em vídeo (Sombra)": pronto para colar numa IA de
 * vídeo-para-vídeo (Runway, Kling, Veo, Pika) junto com o vídeo original e a
 * imagem do personagem. Troca só a identidade da pessoa; movimento, câmera e
 * cenário do vídeo ficam iguais. Campos vazios da ficha somem do texto.
 */
export function promptSubstituirVideo(c: Character): string {
  const d = c.identidade;
  const v = c.visual;
  const nome = d.nome?.trim();
  const realista = (v.estilo ?? "realista") === "realista";
  const limpo = (s?: string) => s?.trim().replace(/[.;,\s]+$/, "") ?? "";

  const idade = limpo(d.idadeAparente);
  const quem = [sujeito(d.genero, d.forma), idade && `de ${idade}`]
    .filter(Boolean)
    .join(" ");
  const descricao = [
    quem,
    limpo(v.cabelo) && `cabelo ${limpo(v.cabelo)}`,
    limpo(v.pele),
    limpo(v.olhos) && `olhos ${limpo(v.olhos)}`,
    limpo(v.tracosMarcantes),
    realista
      ? "rugas e textura de pele real"
      : "o mesmo acabamento 3D da imagem de referência",
    "sem emenda de máscara visível",
  ].filter(Boolean);

  const roupa = [limpo(v.roupa), limpo(v.acessorios)].filter(Boolean).join(", ");
  const expressao = limpo(c.soul.adjetivos[0]).toLowerCase();
  const cenarios = limpo(v.cenarios);

  const blocos = [
    [
      `Substitua a pessoa do vídeo pelo personagem ${nome || "da imagem de referência"}, ${descricao.join(", ")}.`,
      "Mantenha 100% de consistência com o vídeo de referência: os mesmos movimentos, gestual, ritmo, enquadramento, câmera, iluminação e cenário do vídeo original, frame a frame. Não invente nem altere nada do vídeo original além da identidade da pessoa.",
    ],
    [
      `Imagem: ${nome || "o personagem"} de frente${expressao ? `, com expressão ${expressao}` : ""}, olhando direto para a câmera. Referência de rosto e roupa.`,
    ],
    roupa ? [`Roupa fixa em todo o vídeo: ${roupa}.`] : [],
    [
      `Estilo: ${
        realista
          ? "fotografia realista, luz natural, pele e tecido com textura real"
          : "render 3D igual ao da imagem de referência, com a luz do vídeo original"
      }${cenarios ? `, cenário ${cenarios}` : ""}.`,
    ],
    [
      "Não altere nenhuma característica do personagem: rosto, cabelo, pele, olhos, roupa, acessórios e paleta devem ficar idênticos em todos os frames, sem variação nem reinterpretação.",
      "Não adicione fala, texto, legenda, voz ou narração. O personagem não deve dizer nada além do que já existir no áudio original do vídeo, a menos que seja pedido explicitamente.",
      ...(roupa ? ["Não mude as peças de roupa descritas acima."] : []),
    ],
  ];
  return blocos
    .filter((b) => b.length)
    .map((b) => b.join("\n"))
    .join("\n\n");
}

function sujeito(genero?: string, forma?: string): string {
  if (forma && forma !== "humano" && forma !== "humanoide")
    return `personagem do tipo ${forma}`;
  if (genero === "feminino") return "uma mulher";
  if (genero === "masculino") return "um homem";
  return "uma pessoa";
}

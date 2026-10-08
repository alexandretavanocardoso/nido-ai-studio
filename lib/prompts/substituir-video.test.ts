import { describe, expect, it } from "vitest";
import { emptyCharacter } from "@/lib/defaults";
import { promptSubstituirVideo } from "./substituir-video";

function ricardo() {
  const c = emptyCharacter();
  c.identidade.nome = "ricardofit";
  c.identidade.genero = "masculino";
  c.identidade.forma = "humano";
  c.identidade.idadeAparente = "26";
  c.visual.cabelo = "careca";
  c.visual.pele = "pardo";
  c.visual.olhos = "castanho claro";
  c.visual.tracosMarcantes = "tatuagem no braço esquerdo";
  c.visual.roupa = "regatas";
  c.visual.acessorios = "relógio";
  c.visual.cenarios = "academia, rua, treinando, no computador, quarto.";
  c.soul.adjetivos = ["Forte", "disciplinado"];
  return c;
}

describe("promptSubstituirVideo", () => {
  it("monta o prompt com os dados da ficha", () => {
    expect(promptSubstituirVideo(ricardo())).toBe(
      [
        "Substitua a pessoa do vídeo pelo personagem ricardofit, um homem de 26, cabelo careca, pardo, olhos castanho claro, tatuagem no braço esquerdo, rugas e textura de pele real, sem emenda de máscara visível.",
        "Mantenha 100% de consistência com o vídeo de referência: os mesmos movimentos, gestual, ritmo, enquadramento, câmera, iluminação e cenário do vídeo original, frame a frame. Não invente nem altere nada do vídeo original além da identidade da pessoa.",
        "",
        "Imagem: ricardofit de frente, com expressão forte, olhando direto para a câmera. Referência de rosto e roupa.",
        "",
        "Roupa fixa em todo o vídeo: regatas, relógio.",
        "",
        "Estilo: fotografia realista, luz natural, pele e tecido com textura real, cenário academia, rua, treinando, no computador, quarto.",
        "",
        "Não altere nenhuma característica do personagem: rosto, cabelo, pele, olhos, roupa, acessórios e paleta devem ficar idênticos em todos os frames, sem variação nem reinterpretação.",
        "Não adicione fala, texto, legenda, voz ou narração. O personagem não deve dizer nada além do que já existir no áudio original do vídeo, a menos que seja pedido explicitamente.",
        "Não mude as peças de roupa descritas acima.",
      ].join("\n"),
    );
  });

  it("some com o que a ficha não tem", () => {
    const p = promptSubstituirVideo(emptyCharacter());
    expect(p).toContain(
      "pelo personagem da imagem de referência, uma pessoa, rugas",
    );
    expect(p).toContain("Imagem: o personagem de frente, olhando");
    expect(p).not.toContain("Roupa fixa");
    expect(p).not.toContain("peças de roupa");
    expect(p).toContain("com textura real.\n");
    expect(p).not.toMatch(/undefined|, ,|\.\./);
  });

  it("personagem 3D não pede pele real", () => {
    const c = ricardo();
    c.visual.estilo = "3d";
    const p = promptSubstituirVideo(c);
    expect(p).not.toContain("textura de pele real");
    expect(p).toContain("render 3D");
  });
});

import { describe, expect, it } from "vitest";
import { emptyCharacter } from "@/lib/defaults";
import type { ImagemGerada } from "@/lib/types";
import { imagemDoNft, temRetrato } from "./imagem";

const gerada = (
  key: string,
  tipo: ImagemGerada["tipo"],
  createdAt: number,
): ImagemGerada => ({
  id: key,
  key,
  tipo,
  estilo: "3d",
  qualidade: "padrao",
  size: 1,
  createdAt,
});

function personagem() {
  const c = emptyCharacter();
  c.visual.referencias = [
    { id: "r", name: "r.jpg", dataUrl: "", size: 1, key: "users/u/refs/ref.jpg" },
  ];
  return c;
}

describe("imagemDoNft", () => {
  it("usa o retrato, mesmo que o card de referência seja mais recente", () => {
    const c = personagem();
    c.geradas = [
      gerada("users/u/generated/card.jpg", "referencia", 300),
      gerada("users/u/generated/retrato.jpg", "retrato", 200),
    ];
    expect(imagemDoNft(c)).toBe("users/u/generated/retrato.jpg");
    expect(temRetrato(c)).toBe(true);
  });

  it("entre vários retratos, vale o mais recente — ou o que foi escolhido como capa", () => {
    const c = personagem();
    c.geradas = [
      gerada("users/u/generated/antigo.jpg", "retrato", 100),
      gerada("users/u/generated/novo.jpg", "retrato", 200),
    ];
    expect(imagemDoNft(c)).toBe("users/u/generated/novo.jpg");
    c.visual.capaKey = "users/u/generated/antigo.jpg";
    expect(imagemDoNft(c)).toBe("users/u/generated/antigo.jpg");
  });

  it("capa que não é retrato (card, referência) não passa na frente do retrato", () => {
    const c = personagem();
    c.geradas = [
      gerada("users/u/generated/card.jpg", "referencia", 300),
      gerada("users/u/generated/retrato.jpg", "retrato", 200),
    ];
    c.visual.capaKey = "users/u/generated/card.jpg";
    expect(imagemDoNft(c)).toBe("users/u/generated/retrato.jpg");
    c.visual.capaKey = "users/u/refs/ref.jpg";
    expect(imagemDoNft(c)).toBe("users/u/generated/retrato.jpg");
  });

  it("sem retrato não há imagem: referência enviada e outras imagens nunca viram a imagem pública", () => {
    const c = personagem();
    expect(temRetrato(c)).toBe(false);
    expect(imagemDoNft(c)).toBeNull();
    c.geradas = [
      gerada("users/u/generated/troca.jpg", "troca", 50),
      gerada("users/u/generated/card.jpg", "referencia", 60),
    ];
    expect(imagemDoNft(c)).toBeNull();
    // nem quando a pessoa escolheu a referência ou outra imagem como capa
    c.visual.capaKey = "users/u/refs/ref.jpg";
    expect(imagemDoNft(c)).toBeNull();
    c.visual.capaKey = "users/u/generated/troca.jpg";
    expect(imagemDoNft(c)).toBeNull();
    expect(temRetrato(c)).toBe(false);
  });

  it("sem nenhuma imagem salva, não há imagem", () => {
    const c = emptyCharacter();
    expect(imagemDoNft(c)).toBeNull();
    // referência só no navegador (base64), sem arquivo salvo
    c.visual.referencias = [
      { id: "r", name: "r.jpg", dataUrl: "data:image/jpeg;base64,xx", size: 1 },
    ];
    expect(imagemDoNft(c)).toBeNull();
  });
});

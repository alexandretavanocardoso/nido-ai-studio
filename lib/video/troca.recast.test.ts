import { describe, expect, it } from "vitest";
import { RECAST_PEDIDO_MAX } from "./sapiens";
import { promptRecast, trechosRecast } from "./troca";

/** Maior tomada dentro de cada envio (o Recast recusa tomada acima de 15s). */
function maiorTomada(
  envio: { inicio: number; duracao: number },
  cortes: number[],
): number {
  const fim = envio.inicio + envio.duracao;
  const pontos = [
    envio.inicio,
    ...cortes.filter((c) => c > envio.inicio && c < fim).sort((a, b) => a - b),
    fim,
  ];
  return Math.max(...pontos.slice(1).map((p, i) => p - pontos[i]));
}

describe("divisão do vídeo para o Recast", () => {
  it("até 30s com cortes vai num envio só", () => {
    expect(trechosRecast(28, [4, 8, 12, 16, 20, 24])).toEqual([
      { inicio: 0, duracao: 28 },
    ]);
  });

  it("uma tomada de mais de 15s é dividida no meio, em partes iguais", () => {
    expect(trechosRecast(25, [])).toEqual([
      { inicio: 0, duracao: 12.5 },
      { inicio: 12.5, duracao: 12.5 },
    ]);
  });

  it("vídeo longo: cada envio junta as tomadas que couberem em 30s, dividindo nos cortes", () => {
    expect(trechosRecast(45, [10, 20, 30, 40])).toEqual([
      { inicio: 0, duracao: 20 },
      { inicio: 20, duracao: 25 },
    ]);
  });

  it("o último envio não fica abaixo de 5s: ele pega a última tomada do anterior", () => {
    expect(trechosRecast(32, [14, 28])).toEqual([
      { inicio: 0, duracao: 14 },
      { inicio: 14, duracao: 18 },
    ]);
  });

  it("tomada curta depois de uma longa vai junto com a última parte dela", () => {
    expect(trechosRecast(20, [18])).toEqual([
      { inicio: 0, duracao: 9 },
      { inicio: 9, duracao: 11 },
    ]);
  });

  it("ignora cortes colados no começo ou no fim e aceita cortes fora de ordem", () => {
    expect(trechosRecast(20, [19.95, 12, 0.02])).toEqual([
      { inicio: 0, duracao: 20 },
    ]);
  });

  it("cobre o vídeo todo, com envios de 5 a 30s e nenhuma tomada acima de 15s", () => {
    // Sorteio fixo (o mesmo a cada execução).
    let semente = 7;
    const sorteio = () => {
      semente = (semente * 16807) % 2147483647;
      return semente / 2147483647;
    };
    for (let caso = 0; caso < 300; caso++) {
      const duracao = 5.2 + sorteio() * 54.8;
      const cortes: number[] = [];
      for (let t = sorteio() * 8; t < duracao; t += 0.3 + sorteio() * 20)
        cortes.push(Number(t.toFixed(2)));
      const envios = trechosRecast(duracao, cortes);
      expect(envios[0].inicio).toBe(0);
      const ultimo = envios[envios.length - 1];
      expect(ultimo.inicio + ultimo.duracao).toBeCloseTo(duracao, 2);
      envios.forEach((e, i) => {
        if (i > 0)
          expect(e.inicio).toBeCloseTo(
            envios[i - 1].inicio + envios[i - 1].duracao,
            2,
          );
        expect(e.duracao).toBeGreaterThanOrEqual(5);
        expect(e.duracao).toBeLessThanOrEqual(29.9 + 1e-6);
        expect(maiorTomada(e, cortes)).toBeLessThanOrEqual(14.9 + 1e-3);
      });
    }
  });
});

describe("pedido ao Recast", () => {
  it("sem ninguém marcado: a pessoa principal vira a da foto", () => {
    const p = promptRecast([{}], false);
    expect(p).toContain("- the main person → the person in reference photo 1.");
    expect(p).toContain("Follow each of them through every cut");
    expect(p).toContain("Add no text, letters or captions that are not in the video.");
    expect(p).not.toContain("Each photo goes only");
  });

  it("várias pessoas: cada foto vai só para quem foi marcado, na ordem", () => {
    const p = promptRecast(
      [
        { descricao: "the woman in a red dress on the left" },
        { descricao: "the bald man holding a cup" },
      ],
      true,
    );
    expect(p).toContain(
      "- the woman in a red dress on the left → the person in reference photo 1.",
    );
    expect(p).toContain("- the bald man holding a cup → the person in reference photo 2.");
    expect(p).toContain("Each photo goes only to its own person");
    expect(p).toContain("Remove all on-screen text, captions and subtitles.");
  });

  it("o instante da marca vai como pista de quem é a pessoa", () => {
    const p = promptRecast(
      [
        { descricao: "the man in a black suit", instante: 0 },
        { descricao: "the man with half-white hair", instante: 1.248 },
        { descricao: "the woman in red" },
      ],
      false,
    );
    expect(p).toContain(
      "- the man in a black suit (the one visible at 0.0s) → the person in reference photo 1.",
    );
    expect(p).toContain("(the one visible at 1.2s) → the person in reference photo 2.");
    expect(p).toContain("- the woman in red → the person in reference photo 3.");
  });

  it("roupa do vídeo: só o rosto e o cabelo vêm da foto", () => {
    expect(promptRecast([{}], false, "foto")).toContain(
      "keeps the clothes, shoes and accessories they wear in the video",
    );
    expect(promptRecast([{}], false, "personagem")).toContain(
      "face, hair and outfit",
    );
  });

  it("descrições longas encolhem: o pedido cabe no teto enviado ao Sapiens", () => {
    const longa = "a person ".repeat(60).trim();
    const p = promptRecast(
      [{ descricao: longa }, { descricao: longa }, { descricao: longa }],
      true,
    );
    expect(p.length).toBeLessThanOrEqual(RECAST_PEDIDO_MAX);
    expect(p).toContain("Remove all on-screen text");
  });
});

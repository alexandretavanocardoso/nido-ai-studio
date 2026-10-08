import { describe, expect, it } from "vitest";
import { promptTroca } from "./troca";

describe("promptTroca", () => {
  it("sem descrição: troca a pessoa principal e protege as outras pessoas", () => {
    const p = promptTroca("kling", [{}], false);
    expect(p).toMatch(
      /- the main person → replace with the character @Element1/,
    );
    expect(p).toMatch(
      /Every other person in @Video1 must stay exactly as they are/,
    );
    expect(p).toMatch(/hands and finger gestures/);
    expect(p).not.toMatch(/@Image1/);
  });

  it("com descrições: cada pessoa pelo seu personagem", () => {
    const p = promptTroca(
      "kling",
      [{ descricao: "the man in green" }, { descricao: "the man in black" }],
      false,
    );
    expect(p).toMatch(/replace ONLY these people/);
    expect(p).toMatch(
      /the man in green → replace with the character @Element1/,
    );
    expect(p).toMatch(
      /the man in black → replace with the character @Element2/,
    );
  });

  it("Kling com âncora: o quadro pronto (@Image1) manda no visual", () => {
    const p = promptTroca("kling", [{ descricao: "a" }], false, true);
    expect(p).toMatch(
      /@Image1 is a frame of this same scene with the replacement already done/,
    );
    expect(p).not.toMatch(/exactly as in @Element1/);
  });

  it("Seedance usa @Image para os personagens, ignora a âncora e remove texto quando pedido", () => {
    const p = promptTroca("seedance", [{ descricao: "a" }], true, true);
    expect(p).toMatch(/replace with the character @Image1/);
    expect(p).toMatch(/exactly as in @Image1/);
    expect(p).not.toMatch(/replacement already done/);
    expect(p).toMatch(/Remove all on-screen text/);
  });
});

describe("promptTroca — outras pessoas", () => {
  it("lista quem não pode mudar (nos dois motores)", () => {
    const outras = [
      "a woman with red hair and headphones",
      "a man in a green cap",
    ];
    for (const motor of ["kling", "seedance"] as const) {
      const p = promptTroca(
        motor,
        [{ descricao: "a" }],
        false,
        motor === "kling",
        outras,
      );
      expect(p).toMatch(
        /must NOT be changed in any way: a woman with red hair and headphones; a man in a green cap\./,
      );
    }
    expect(promptTroca("kling", [{}], false)).not.toMatch(
      /must NOT be changed/,
    );
  });
});

describe("troca de várias pessoas", () => {
  const alvos = [{ descricao: "the man in green" }, { descricao: "the man in a cap" }];

  it("exige a troca de todos e proíbe sobras soltas na cena", () => {
    const p = promptTroca("kling", alvos, false);
    expect(p).toMatch(/All 2 listed people must be replaced/);
    expect(p).toMatch(/loose object/);
    expect(promptTroca("kling", [{}], false)).not.toMatch(/listed people must be replaced/);
  });

  it("âncora com só um dos alvos: avisa que o outro também tem que ser trocado", () => {
    const p = promptTroca("kling", alvos, false, true, [], [0]);
    expect(p).toMatch(/already done ONLY for @Element1/);
    expect(p).toMatch(/does NOT show the replacement of the man in a cap \(@Element2\)/);
    // Âncora com todos: a frase de sempre, sem o aviso.
    const todos = promptTroca("kling", alvos, false, true, [], [0, 1]);
    expect(todos).not.toMatch(/ONLY for/);
    expect(todos).toMatch(/replacement already done:/);
  });
});

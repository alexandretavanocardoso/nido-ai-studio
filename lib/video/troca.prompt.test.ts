import { describe, expect, it } from "vitest";
import { alvosDoTrecho, PEDIDO_MAX, promptTroca } from "./troca";

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

describe("promptTroca — tamanho", () => {
  const longa = (n: number) => "the man " + "word ".repeat(n).trim();

  it("cabe no limite do Kling mesmo com 3 pessoas, âncora parcial e descrições no máximo", () => {
    const alvos = [0, 1, 2].map(() => ({ descricao: longa(43).slice(0, 220) }));
    const outras = [0, 1, 2].map(() => longa(47).slice(0, 240));
    const p = promptTroca("kling", alvos, true, true, outras, [0], true);
    expect(p.length).toBeLessThanOrEqual(PEDIDO_MAX);
    // Encolheu as descrições, mas as regras e as 3 pessoas continuam lá.
    expect(p).toMatch(/@Element3/);
    expect(p).toMatch(/A back view stays a back view/);
    expect(p).toMatch(/Remove all on-screen text/);
  });

  it("caso comum (2 pessoas, âncora, 2 outras) vai com as descrições inteiras", () => {
    const d = "the stout man with a brown bob haircut with bangs, wearing glasses and a green pinstriped double-breasted suit jacket over a white shirt and mustard tie";
    const p = promptTroca("kling", [{ descricao: d }, { descricao: d }], false, true, [d.slice(0, 140), d.slice(0, 140)], [0, 1]);
    expect(p.length).toBeLessThanOrEqual(PEDIDO_MAX);
    expect(p.split(d).length - 1).toBe(2);
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

  it("cada pessoa fica com o mesmo personagem, também de costas ou fora de cena", () => {
    const p = promptTroca("kling", alvos, false);
    expect(p).toMatch(/A back view stays a back view/);
    expect(p).toMatch(/while they are not on screen their character does not appear/);
    // A regra de costas vale também com uma pessoa só.
    expect(promptTroca("kling", [{}], false)).toMatch(/A back view stays a back view/);
  });

  it("trecho em que só uma das pessoas aparece: vai só o personagem dela", () => {
    const completos = [
      { personagemUrl: "a", descricao: "the man in green" },
      { personagemUrl: "b", descricao: "the man in a cap" },
    ];
    // Só a segunda pessoa aparece; a âncora mostra as duas.
    const so2 = alvosDoTrecho(completos, [1], [0, 1]);
    expect(so2.alvos.map((a) => a.personagemUrl)).toEqual(["b"]);
    expect(so2.naAncora).toEqual([0]);
    expect(so2.sobraNaAncora).toBe(true);
    const p = promptTroca("kling", so2.alvos, false, true, [], so2.naAncora, so2.sobraNaAncora);
    expect(p).toMatch(/the man in a cap → replace with the character @Element1/);
    expect(p).not.toMatch(/the man in green/);
    expect(p).toMatch(/also shows another replaced person who does NOT appear/);
    // Todos presentes, lista vazia ou sem leitura: fica como sempre foi.
    for (const presentes of [[0, 1], [], undefined])
      expect(alvosDoTrecho(completos, presentes, [0, 1])).toEqual({
        alvos: completos,
        naAncora: [0, 1],
        sobraNaAncora: false,
      });
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

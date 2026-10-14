import { describe, expect, it } from "vitest";
import {
  acaoDoTrecho,
  alvosDoTrecho,
  alvosNosTrechos,
  entradasDosAlvos,
  PEDIDO_MAX,
  promptEdicao,
  promptTroca,
} from "./troca";
import { trechosTroca } from "./ffmpeg";

describe("quem aparece quando", () => {
  // 1 quadro por segundo: A fica até 7 s, some, volta aos 12 s e sai aos 15 s;
  // B fica até 10 s, some e volta aos 16 s.
  const instantes = Array.from({ length: 26 }, (_, k) => k + 0.5);
  const linha = {
    instantes,
    visiveis: instantes.map((t) => [
      ...(t < 8 || (t > 12 && t < 15) ? [0] : []),
      ...(t < 11 || t > 16 ? [1] : []),
    ]),
  };

  it("acha o instante em que cada pessoa volta à cena", () => {
    expect(entradasDosAlvos(linha, 2)).toEqual([12.5, 16.5]);
    // Um quadro só de ausência (alguém passou na frente) não é uma entrada.
    expect(
      entradasDosAlvos({ instantes: [0.5, 1.5, 2.5, 3.5], visiveis: [[0], [], [0], [0]] }, 1),
    ).toEqual([]);
  });

  it("começa um trecho novo em cada entrada e manda a cada trecho só quem aparece nele", () => {
    // As entradas têm prioridade; o golpe dos 8 s abre um trecho 0,75 s antes
    // dele, e o movimento dos 11,5 s fica perto demais da entrada dos 12,5 s.
    const viradas = [{ t: 8, forca: 0.09 }, { t: 11.5, forca: 0.095 }];
    const trechos = trechosTroca(26.19, 15, viradas, 3, entradasDosAlvos(linha, 2));
    expect(trechos.map((t) => t.inicio)).toEqual([0, 7.25, 12.5, 16.5]);
    expect(alvosNosTrechos(trechos, linha, 2)).toEqual([[0, 1], [0, 1], [0], [1]]);
    expect(trechos.every((t) => t.duracao >= 3 && t.duracao <= 15)).toBe(true);
  });

  it("a ação do trecho troca [[n]] pela referência do motor, na numeração do trecho", () => {
    const acao = "[[1]] stands up and slaps [[2]], who falls backwards.";
    expect(acaoDoTrecho(acao, undefined, 2, "kling")).toBe(
      "@Element1 stands up and slaps @Element2, who falls backwards.",
    );
    // Trecho só com a 2ª pessoa: ela é o @Element1 dali; a 1ª vira "another person".
    expect(acaoDoTrecho(acao, [1], 2, "kling")).toBe(
      "another person stands up and slaps @Element1, who falls backwards.",
    );
    expect(acaoDoTrecho(acao, [0, 1], 2, "seedance")).toMatch(/@Image1 .* @Image2/);
    expect(acaoDoTrecho("  ", [0], 1, "kling")).toBeUndefined();
    const p = promptTroca("kling", [{ descricao: "a" }], false, false, [], undefined, false, undefined, "@Element1 jumps.");
    expect(p).toMatch(/What happens in @Video1 .*: @Element1 jumps\./);
  });

  it("trecho sem ninguém visto fica com todos", () => {
    expect(
      alvosNosTrechos([{ inicio: 0, duracao: 5 }], { instantes: [1, 3], visiveis: [[], []] }, 2),
    ).toEqual([[0, 1]]);
  });
});

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

describe("animal ou objeto marcado", () => {
  const carro = { descricao: "the white hatchback car", tipo: "objeto" as const };
  const cao = { descricao: "the golden retriever", tipo: "animal" as const };

  it("troca pelo que a imagem mostra, sem as regras de rosto, roupa e costas", () => {
    const p = promptTroca("kling", [carro], false);
    expect(p).toMatch(/replace ONLY what is listed here/);
    expect(p).toMatch(/the white hatchback car → replace with the object shown in @Element1/);
    expect(p).toMatch(/shape, colours, markings and details .* exactly as in @Element1/);
    expect(p).toMatch(/follows the original frame by frame/);
    expect(p).not.toMatch(/character|A back view|real people filmed|finger gestures/);
    // As pessoas do vídeo (o motorista) continuam protegidas.
    expect(p).toMatch(/Every person in @Video1 must stay exactly as they are/);
    expect(promptTroca("seedance", [cao], false)).toMatch(
      /replace with the animal shown in @Image1/,
    );
  });

  it("pessoa e animal juntos: cada um com as regras do seu tipo", () => {
    const p = promptTroca("kling", [{ descricao: "the man in green" }, cao], false, true, [], [0]);
    expect(p).toMatch(/the man in green → replace with the character @Element1/);
    expect(p).toMatch(/the golden retriever → replace with the animal shown in @Element2/);
    expect(p).toMatch(/All 2 listed targets must be replaced/);
    expect(p).toMatch(/does NOT show the replacement of the golden retriever \(@Element2\)/);
    expect(p).toMatch(/A back view stays a back view/);
    expect(p).toMatch(/Each replaced animal or object stays the SAME one/);
  });

  it("só a cabeça não vale para coisas, e o pedido cabe no limite", () => {
    const p = promptTroca("kling", [carro], false, false, [], undefined, false, undefined, undefined, "foto");
    expect(p).not.toMatch(/ONLY their head|CLOTHING:/);
    const d = "the " + "word ".repeat(43).trim();
    const cheio = promptTroca(
      "kling",
      [{ descricao: d }, { ...carro, descricao: d }, { ...cao, descricao: d }],
      true,
      true,
      [d, d, d],
      [0],
      false,
      undefined,
      d,
    );
    expect(cheio.length).toBeLessThanOrEqual(PEDIDO_MAX);
    // Encolheu as descrições, mas as regras do fim continuam inteiras.
    expect(cheio).toMatch(/Remove all on-screen text, captions and subtitles\.$/);
  });
});

describe("pedido escrito (o que mudar)", () => {
  it("só a cena: troca o fundo e mantém as pessoas", () => {
    const p = promptEdicao("kling", { modo: "cena", pedido: "on a beach at sunset." }, false, true);
    expect(p).toMatch(/change ONLY the background and setting: on a beach at sunset\.$/m);
    expect(p).toMatch(/@Image1 is a frame of this same video with the change already done/);
    expect(p).toMatch(/Every person, animal and object in the foreground stays exactly/);
    expect(p).toMatch(/Keep the on-screen text of @Video1/);
    expect(p).not.toMatch(/character|@Element/);
    // Seedance não usa quadro-guia.
    expect(promptEdicao("seedance", { modo: "cena", pedido: "x" }, true, true)).not.toMatch(/@Image1/);
  });

  it("só um detalhe: muda só o pedido, o fundo fica", () => {
    const p = promptEdicao("kling", { modo: "detalhe", pedido: "swap the cap for a straw hat" }, true);
    expect(p).toMatch(/change ONLY this: swap the cap for a straw hat\./);
    expect(p).toMatch(/Everything else stays exactly as in @Video1: every person .* the background/);
    expect(p).toMatch(/Remove all on-screen text/);
  });

  it("personagem e cena: o lugar novo entra no lugar da regra de manter o cenário", () => {
    const p = promptTroca("kling", [{ descricao: "the man in green" }], false, true, [], undefined, false, undefined, undefined, undefined, { modo: "personagem_cena", pedido: "in a snowy forest" });
    expect(p).toMatch(/the man in green → replace with the character @Element1/);
    expect(p).toMatch(/NEW SCENE: in a snowy forest\. Everyone is now in this new place/);
    expect(p).not.toMatch(/Keep the background, objects/);
    expect(p.length).toBeLessThanOrEqual(PEDIDO_MAX);
  });

  it("personagem com pedido: vale como pedido a mais, e o cenário continua", () => {
    const p = promptTroca("kling", [{}], false, false, [], undefined, false, undefined, undefined, undefined, { modo: "personagem", pedido: "he holds a white cup" });
    expect(p).toMatch(/Also do this \(it takes priority over the rules above where they conflict\): he holds a white cup\./);
    expect(p).toMatch(/Keep the background, objects/);
    // Sem pedido, nada muda.
    expect(promptTroca("kling", [{}], false, false, [], undefined, false, undefined, undefined, undefined, { modo: "personagem" })).toBe(
      promptTroca("kling", [{}], false),
    );
  });
});

describe("estilo do vídeo", () => {
  it("realista (padrão): o pedido de sempre, parecendo filmado", () => {
    const p = promptTroca("kling", [{ descricao: "a" }], false);
    expect(p).toMatch(/look like real people filmed by this camera/);
    expect(p).toMatch(/Keep the background, objects, on-screen text, camera angle/);
    expect(promptTroca("kling", [{ descricao: "a" }], false, false, [], undefined, false, "realista")).toBe(p);
  });

  it("anime: redesenha o vídeo inteiro e não pede mais aparência de filmagem", () => {
    const p = promptTroca("kling", [{ descricao: "a" }], false, false, [], undefined, false, "anime");
    expect(p).toMatch(/Render the ENTIRE video/);
    expect(p).toMatch(/2D anime illustration/);
    expect(p).toMatch(/drawn in the same style/);
    expect(p).not.toMatch(/real people filmed/);
    expect(p).not.toMatch(/lighting of @Video1 unchanged/);
    expect(p.length).toBeLessThanOrEqual(2500);
  });

  it("vale para o motor premium também", () => {
    expect(
      promptTroca("seedance", [{ descricao: "a" }], false, false, [], undefined, false, "desenho"),
    ).toMatch(/hand-drawn 2D cartoon/);
  });
});

describe("só a cabeça (roupa do vídeo)", () => {
  const pedir = (ancora: boolean) =>
    promptTroca(
      "kling",
      [{ descricao: "the woman in a green jacket" }],
      false,
      ancora,
      [],
      undefined,
      false,
      undefined,
      undefined,
      "foto",
    );

  it("troca só a cabeça e manda manter a roupa do vídeo", () => {
    const p = pedir(false);
    expect(p).toMatch(/replace ONLY their head/);
    expect(p).toMatch(/CLOTHING: each replaced person keeps exactly the clothes/);
    expect(p).toMatch(/Never copy the outfit from @Element1/);
    // A regra da roupa do personagem não pode aparecer junto.
    expect(p).not.toMatch(/style and outfit exactly as in/);
  });

  it("com quadro-guia a regra da roupa continua, e o pedido cabe no limite", () => {
    const p = pedir(true);
    expect(p).toMatch(/@Image1 is a frame of this same scene/);
    expect(p).toMatch(/CLOTHING:/);
    expect(p.length).toBeLessThanOrEqual(PEDIDO_MAX);
  });

  it("sem a opção, nada muda no pedido", () => {
    const p = promptTroca("kling", [{ descricao: "a" }], false);
    expect(p).not.toMatch(/CLOTHING:/);
    expect(p).toMatch(/replace with the character @Element1/);
  });
});

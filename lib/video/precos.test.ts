import { describe, expect, it } from "vitest";
import {
  custoCriar,
  custoPorSegundoTroca,
  custoTroca,
  custoTrocaOmni,
  custoTrocaPremium,
  custoTrocaRecast,
  fimDoTrecho,
  MINIMO_TROCA,
  MODELOS_TROCA,
  MODELOS_TROCA_IDS,
  modeloTrocaLigado,
  resolucaoRecast,
  MAX_TOMADAS,
  segundosCobradosTroca,
  segundosDaTomada,
  TOMADA_MIN,
  tomadasDoVideo,
  trocaPorTomadas,
} from "./precos";

describe("estimativas de custo de vídeo", () => {
  it("troca (Kling O3 Pro) cobra US$ 0,168/s, mínimo 3s", () => {
    expect(custoTroca(10)).toBe(1.68);
    expect(custoTroca(1)).toBe(0.5);
  });

  it("troca (Kling O3): Standard US$ 0,126/s e 4K US$ 0,42/s", () => {
    expect(custoTroca(10, "standard")).toBe(1.26);
    expect(custoTroca(10, "4k")).toBe(4.2);
  });

  it("Premium (Seedance 2.5) cobra US$ 0,568/s (entrada + saída), mínimo 4s gerados", () => {
    expect(custoTrocaPremium(30)).toBe(17.04);
    expect(custoTrocaPremium(3)).toBe(2.27);
  });

  it("Gemini Omni Flash: ~US$ 0,10/s em 720p, mínimo 3s", () => {
    expect(custoTrocaOmni(10)).toBe(1);
    expect(custoTrocaOmni(1)).toBe(0.3);
    expect(custoPorSegundoTroca("omni")).toBe(0.1);
    expect(MINIMO_TROCA).toEqual({ kling: 3, seedance: 3, omni: 3, recast: 5 });
  });

  it("primeiros N segundos: corte de câmera logo antes do fim vira o fim", () => {
    // Os cortes do reel testado em 16/10/2026: o de 9,67 deixava 0,33s no fim.
    const cortes = [1.33, 3.33, 3.73, 4.73, 5.57, 6.4, 7.17, 8.13, 9, 9.667];
    expect(fimDoTrecho(10, cortes, [1, 0.9])).toBe(9.667);
    expect(fimDoTrecho(15, [...cortes, 11, 12, 13.23, 14.17])).toBe(15);
    // Cortes em sequência, cada um a menos de meio segundo do outro.
    expect(fimDoTrecho(10, [9.3, 9.7])).toBe(9.3);
    // Nunca mais de 1s, nem deixando de fora quem foi marcado.
    expect(fimDoTrecho(10, [8.5, 8.9, 9.3, 9.7])).toBe(10);
    expect(fimDoTrecho(10, [9.67], [9.8])).toBe(10);
  });

  it("MiniMax Recast (Sapiens): US$ 0,2592/s em 768p e 0,3888/s em 1080p, mínimo 5s", () => {
    expect(custoTrocaRecast(10, "768p")).toBe(2.59);
    expect(custoTrocaRecast(10, "1080p")).toBe(3.89);
    expect(custoTrocaRecast(3, "768p")).toBe(1.3);
    expect(custoPorSegundoTroca("recast")).toBe(0.2592);
    expect(custoPorSegundoTroca("recast_1080p")).toBe(0.3888);
    expect(resolucaoRecast("recast")).toBe("768p");
    expect(resolucaoRecast("recast_1080p")).toBe("1080p");
  });

  it("o Omni só aparece com a chave do Gemini e o Recast, com a do Sapiens", () => {
    const ligados = (ligado: { gemini: boolean; sapiens: boolean }) =>
      MODELOS_TROCA_IDS.filter((id) => modeloTrocaLigado(id, ligado));
    expect(ligados({ gemini: false, sapiens: false })).toEqual([
      "kling_standard",
      "kling_pro",
      "kling_4k",
      "seedance",
    ]);
    expect(ligados({ gemini: true, sapiens: true })).toEqual(MODELOS_TROCA_IDS);
  });

  it("só o Seedance e o Omni avisam que podem recusar rostos reais", () => {
    expect(MODELOS_TROCA_IDS.filter((id) => MODELOS_TROCA[id].recusaRostoReal)).toEqual(["seedance", "omni"]);
  });

  it("criar vídeo: Veo com áudio custa mais; Gen-4 ignora áudio", () => {
    expect(custoCriar("veo3.1_fast", 8, false)).toBe(0.8);
    expect(custoCriar("veo3.1_fast", 8, true)).toBe(1.2);
    expect(custoCriar("gen4.5", 10, true)).toBe(1.2);
    expect(custoCriar("gen4_turbo", 10, false)).toBe(0.5);
  });

  it("Veo 3.1 Lite: o mesmo preço com ou sem áudio (o Google sempre gera o som)", () => {
    expect(custoCriar("veo3.1_lite", 8, false)).toBe(0.4);
    expect(custoCriar("veo3.1_lite", 8, true)).toBe(0.4);
  });
});

describe("criar vídeo em cenas", () => {
  it("Gen-4 (5 ou 10s por cena): 10, 15 e 30s exatos", async () => {
    const { cenasDoVideo } = await import("./precos");
    expect(cenasDoVideo("gen4_turbo", 10)).toEqual([10]);
    expect(cenasDoVideo("gen4_turbo", 15)).toEqual([10, 5]);
    expect(cenasDoVideo("gen4.5", 30)).toEqual([10, 10, 10]);
  });

  it("Veo (4, 6 ou 8s por cena): soma o mínimo que cobre o pedido", async () => {
    const { cenasDoVideo, segundosGerados } = await import("./precos");
    expect(cenasDoVideo("veo3.1_fast", 10)).toEqual([6, 4]);
    expect(cenasDoVideo("veo3.1_fast", 15)).toEqual([8, 8]);
    expect(cenasDoVideo("veo3.1_fast", 30)).toEqual([8, 8, 8, 6]);
    expect(segundosGerados("veo3.1_fast", 15)).toBe(16);
    expect(cenasDoVideo("veo3.1_lite", 30)).toEqual([8, 8, 8, 6]);
    expect(segundosGerados("gen4.5", 15)).toBe(15);
  });

  it("Kling V3 (até 15s por cena): menos emendas que os outros", async () => {
    const { cenasDoVideo, custoCriar } = await import("./precos");
    expect(cenasDoVideo("kling_v3", 10)).toEqual([10]);
    expect(cenasDoVideo("kling_v3", 15)).toEqual([15]);
    expect(cenasDoVideo("kling_v3", 30)).toEqual([15, 15]);
    expect(custoCriar("kling_v3", 10, false)).toBe(0.53);
    expect(custoCriar("kling_v3", 10, true)).toBe(0.79);
  });

  it("serviço de cada modelo: o Veo vai pelo Sapiens quando a chave existe", async () => {
    const { provedorCriar } = await import("./precos");
    const os2 = { runway: true, sapiens: true };
    expect(provedorCriar("veo3.1_fast", os2)).toBe("sapiens");
    expect(provedorCriar("kling_v3", os2)).toBe("sapiens");
    expect(provedorCriar("gen4.5", os2)).toBe("runway");
    const soRunway = { runway: true, sapiens: false };
    expect(provedorCriar("veo3.1_fast", soRunway)).toBe("runway");
    expect(provedorCriar("kling_v3", soRunway)).toBeNull();
    const soSapiens = { runway: false, sapiens: true };
    expect(provedorCriar("gen4_turbo", soSapiens)).toBeNull();
    expect(provedorCriar("veo3.1_fast", soSapiens)).toBe("sapiens");
    expect(provedorCriar("wan3", os2)).toBeNull();
    expect(provedorCriar("wan3", { ...os2, fal: true })).toBe("fal");
    expect(
      provedorCriar("gen4.5", { runway: false, sapiens: false, fal: true }),
    ).toBeNull();
    // O Lite só existe na API do Gemini; o Fast nunca vai por ela.
    expect(provedorCriar("veo3.1_lite", os2)).toBeNull();
    expect(provedorCriar("veo3.1_lite", { ...os2, gemini: true })).toBe("google");
    expect(
      provedorCriar("veo3.1_fast", { runway: false, sapiens: false, gemini: true }),
    ).toBeNull();
    const { modeloPadraoCriar } = await import("./precos");
    expect(modeloPadraoCriar({ sapiens: true })).toBe("kling_v3");
    expect(modeloPadraoCriar({ sapiens: false })).toBe("gen4.5");
  });
});

describe("modelos do vídeo falado", () => {
  it("corpo inteiro: mínimo por cena de cada modelo, até 15s", async () => {
    const { segundosDaCenaInteira, provedorFalado } = await import("./precos");
    expect(segundosDaCenaInteira(3.2)).toBe(5); // Hailuo 3: mínimo 5s
    expect(segundosDaCenaInteira(3.2, "wan3")).toBe(4);
    expect(segundosDaCenaInteira(0.8, "wan3")).toBe(2);
    expect(segundosDaCenaInteira(20, "wan3")).toBe(15);
    expect(provedorFalado("wan3")).toBe("fal");
    expect(provedorFalado("hailuo3")).toBe("runway");
    expect(provedorFalado("avatar")).toBe("runway");
    expect(provedorFalado("seedance20_mini")).toBe("sapiens");
    expect(segundosDaCenaInteira(2.1, "seedance25")).toBe(4); // Seedance: 4 a 15s
    expect(segundosDaCenaInteira(14.2, "seedance20")).toBe(15);
  });

  it("Wan 3.0 no criar vídeo: cada duração sai numa cena só", async () => {
    const { cenasDoVideo } = await import("./precos");
    expect(cenasDoVideo("wan3", 10)).toEqual([10]);
    expect(cenasDoVideo("wan3", 15)).toEqual([15]);
    expect(cenasDoVideo("wan3", 30)).toEqual([30]);
  });
});

describe("recorte do avatar (vídeo falado)", () => {
  it("corpo inteiro: quadrado de cabeça e ombros em volta do rosto", async () => {
    const { quadroDoRosto } = await import("./falado");
    // Imagem 1024x1536 com o rosto no alto (como um retrato de corpo inteiro).
    const q = quadroDoRosto(1024, 1536, { x0: 0.41, y0: 0.07, x1: 0.59, y1: 0.2 });
    expect(q.lado).toBeGreaterThan(450);
    expect(q.lado).toBeLessThan(700);
    expect(q.top).toBe(0);
    expect(q.left + q.lado / 2).toBeGreaterThan(480);
    expect(q.left + q.lado / 2).toBeLessThan(545);
  });

  it("sem rosto localizado: alto da imagem, centralizado, dentro dos limites", async () => {
    const { quadroDoRosto } = await import("./falado");
    expect(quadroDoRosto(1024, 1536, null)).toEqual({ left: 231, top: 0, lado: 563 });
    const paisagem = quadroDoRosto(1600, 900, null);
    expect(paisagem.lado).toBe(900);
    expect(paisagem.left + paisagem.lado).toBeLessThanOrEqual(1600);
  });

  it("close: nunca passa do tamanho da imagem", async () => {
    const { quadroDoRosto } = await import("./falado");
    const q = quadroDoRosto(800, 800, { x0: 0.2, y0: 0.15, x1: 0.8, y1: 0.9 });
    expect(q).toEqual({ left: 0, top: 0, lado: 800 });
  });
});

describe("cenas do vídeo falado", () => {
  it("cada parágrafo é uma cena; o que passa de 4 entra na última", async () => {
    const { cenasDaFala } = await import("./precos");
    expect(cenasDaFala("Oi, gente!")).toEqual(["Oi, gente!"]);
    expect(cenasDaFala("Um.\n\nDois.\n \nTrês.")).toEqual(["Um.", "Dois.", "Três."]);
    expect(cenasDaFala("a\n\nb\n\nc\n\nd\n\ne")).toEqual(["a", "b", "c", "d e"]);
    expect(cenasDaFala("linha um\nlinha dois")).toEqual(["linha um\nlinha dois"]);
  });
});

describe("leitura das cenas do roteiro (resposta da IA)", () => {
  it("aceita o formato pedido, com cerca de código em volta", async () => {
    const { cenasDaResposta } = await import("./cenas-roteiro");
    expect(
      cenasDaResposta('```json\n{"cenas": [{"fala": "Oi, gente!", "cenario": "a bedroom"}, {"fala": "Bora!", "cenario": "a gym"}]}\n```'),
    ).toEqual([
      { fala: "Oi, gente!", cenario: "a bedroom" },
      { fala: "Bora!", cenario: "a gym" },
    ]);
  });

  it("aceita lista solta, chaves com acento ou em inglês e cena como texto", async () => {
    const { cenasDaResposta } = await import("./cenas-roteiro");
    expect(cenasDaResposta('[{"Fala": "Um.", "cenário": "street"}]')).toEqual([
      { fala: "Um.", cenario: "street" },
    ]);
    expect(cenasDaResposta('{"scenes": [{"speech": "One.", "setting": "park"}]}')).toEqual([
      { fala: "One.", cenario: "park" },
    ]);
    expect(cenasDaResposta('{"fala": "Só uma.", "cenario": "room"}')).toEqual([
      { fala: "Só uma.", cenario: "room" },
    ]);
    expect(cenasDaResposta('{"cenas": ["Fala um.", "Fala dois."]}')).toEqual([
      { fala: "Fala um.", cenario: "" },
      { fala: "Fala dois.", cenario: "" },
    ]);
  });

  it("JSON cortado: pesca o que dá; texto corrido vira uma cena", async () => {
    const { cenasDaResposta } = await import("./cenas-roteiro");
    expect(
      cenasDaResposta('{"cenas": [{"fala": "Primeira \\"fala\\".", "cenario": "dojo"}, {"fala": "Segunda", "cen'),
    ).toEqual([
      { fala: 'Primeira "fala".', cenario: "dojo" },
      { fala: "Segunda", cenario: "" },
    ]);
    expect(cenasDaResposta("Gente, bora treinar junto!")).toEqual([
      { fala: "Gente, bora treinar junto!", cenario: "" },
    ]);
  });
});

describe("troca tomada por tomada", () => {
  // O reel de teste: 9 cortes de câmera em 9,667 s.
  const cortes = [1.333, 3.333, 3.733, 4.733, 5.567, 6.4, 7.167, 8.133, 9.0];

  it("as tomadas vão de corte a corte e cobrem o vídeo inteiro", () => {
    const t = tomadasDoVideo(cortes, 9.667);
    // 10 tomadas no vídeo; a de 0,4 s (aos 3,333 s) vai junto com a seguinte.
    expect(t).toHaveLength(9);
    expect(t[0]).toEqual({ inicio: 0, duracao: 1.333 });
    expect(t[2]).toEqual({ inicio: 3.333, duracao: 1.4 });
    expect(t.reduce((s, x) => s + x.duracao, 0)).toBeCloseTo(9.667, 2);
  });

  it("tomada minúscula no fim do vídeo se junta à anterior", () => {
    expect(tomadasDoVideo([5, 9.6], 10)).toEqual([
      { inicio: 0, duracao: 5 },
      { inicio: 5, duracao: 5 },
    ]);
    // Duas minúsculas seguidas vão as duas com a próxima tomada de verdade.
    expect(tomadasDoVideo([2, 2.4, 2.8], 6).map((x) => x.inicio)).toEqual([0, 2]);
  });

  it("um corte colado em outro (ou no fim) não cria tomada própria", () => {
    expect(tomadasDoVideo([2, 2.1, 9.9], 10).map((x) => x.inicio)).toEqual([0, 2]);
  });

  it("só entra no modo quando há tomada mais curta que o mínimo do motor", () => {
    expect(trocaPorTomadas(cortes, 9.667)).toHaveLength(9);
    // Sem cortes, ou só com tomadas longas: modo normal.
    expect(trocaPorTomadas([], 20)).toBeNull();
    expect(trocaPorTomadas([8, 14], 20)).toBeNull();
    // Tomadas demais: modo normal.
    const muitos = Array.from({ length: MAX_TOMADAS + 3 }, (_, i) => (i + 1) * 1.5);
    expect(trocaPorTomadas(muitos, 60)).toBeNull();
  });

  it("cobra o que o Kling processa: cada tomada curta conta como TOMADA_MIN", () => {
    // 9 pedidos: a tomada de 0,4 s vai junto com a seguinte, num pedido só.
    expect(segundosCobradosTroca(cortes, 9.667)).toBeCloseTo(9 * TOMADA_MIN, 2);
    expect(segundosDaTomada({ inicio: 0, duracao: 0.5 })).toBe(TOMADA_MIN);
    expect(segundosDaTomada({ inicio: 0, duracao: 8 })).toBe(8);
    // Tomada longa conta pela duração dela.
    expect(segundosCobradosTroca([1, 9], 12)).toBeCloseTo(TOMADA_MIN + 8 + TOMADA_MIN, 2);
    // Modo normal: a duração do vídeo.
    expect(segundosCobradosTroca([], 20)).toBe(20);
    expect(segundosCobradosTroca([8, 14], 20)).toBe(20);
  });
});

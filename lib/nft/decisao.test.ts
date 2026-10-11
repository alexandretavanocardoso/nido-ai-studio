import { describe, expect, it } from "vitest";
import { FOLGA_BLOCOS, proximoPasso } from "./decisao";

const VALIDO = 1_000;
const DEPOIS = VALIDO + FOLGA_BLOCOS + 1;

describe("proximoPasso (o que fazer com um mint enviado)", () => {
  it("transação finalizada: confirma", () => {
    expect(proximoPasso({ situacao: "finalizada", validoAteBloco: VALIDO })).toBe(
      "confirmar",
    );
  });

  it("transação recusada pela rede: falha (com estorno)", () => {
    expect(proximoPasso({ situacao: "revertida", validoAteBloco: VALIDO })).toBe(
      "falhar_recusada",
    );
  });

  it("entrou mas ainda não finalizou: aguarda, não confirma nem estorna", () => {
    expect(proximoPasso({ situacao: "pendente", validoAteBloco: VALIDO })).toBe(
      "aguardar",
    );
  });

  it("a rede não conhece a transação: primeiro lê a altura", () => {
    expect(
      proximoPasso({ situacao: "sem_registro", validoAteBloco: VALIDO }),
    ).toBe("ler_altura");
  });

  it("dentro do prazo (e da folga) nunca dá por perdida", () => {
    for (const altura of [1, VALIDO, VALIDO + 1, VALIDO + FOLGA_BLOCOS])
      expect(
        proximoPasso({ situacao: "sem_registro", validoAteBloco: VALIDO, altura }),
      ).toBe("aguardar");
  });

  it("passado o prazo, consulta de novo antes de decidir", () => {
    expect(
      proximoPasso({
        situacao: "sem_registro",
        validoAteBloco: VALIDO,
        altura: DEPOIS,
      }),
    ).toBe("ler_de_novo");
    // falta um dos dois fatos: ainda não decide
    expect(
      proximoPasso({
        situacao: "sem_registro",
        validoAteBloco: VALIDO,
        altura: DEPOIS,
        situacaoDepois: "sem_registro",
      }),
    ).toBe("ler_de_novo");
  });

  it("só dá por vencida quando a segunda consulta e a conta do NFT confirmam", () => {
    expect(
      proximoPasso({
        situacao: "sem_registro",
        validoAteBloco: VALIDO,
        altura: DEPOIS,
        situacaoDepois: "sem_registro",
        contaExiste: false,
      }),
    ).toBe("falhar_vencida");
  });

  it("se a conta do NFT existe, entrou — mesmo sem a rede achar a transação", () => {
    expect(
      proximoPasso({
        situacao: "sem_registro",
        validoAteBloco: VALIDO,
        altura: DEPOIS,
        situacaoDepois: "sem_registro",
        contaExiste: true,
      }),
    ).toBe("confirmar");
  });

  it("a segunda consulta achou a transação: vale o que ela diz", () => {
    const base = {
      situacao: "sem_registro" as const,
      validoAteBloco: VALIDO,
      altura: DEPOIS,
      contaExiste: false,
    };
    expect(proximoPasso({ ...base, situacaoDepois: "finalizada" })).toBe(
      "confirmar",
    );
    expect(proximoPasso({ ...base, situacaoDepois: "revertida" })).toBe(
      "falhar_recusada",
    );
    expect(proximoPasso({ ...base, situacaoDepois: "pendente" })).toBe(
      "aguardar",
    );
  });
});

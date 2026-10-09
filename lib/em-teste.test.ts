import { describe, expect, it } from "vitest";
import {
  liberadoNaTela,
  RECURSOS_EM_TESTE,
  SO_ADMIN,
  SOBRE_O_RECURSO,
} from "./em-teste";

describe("recursos em teste na tela", () => {
  it("sem estado do servidor vale o padrão do código: fechado para quem não é admin", () => {
    expect(SO_ADMIN.mcp).toBe(true);
    expect(liberadoNaTela("mcp", { admin: false })).toBe(false);
    expect(liberadoNaTela("mcp", { admin: true })).toBe(true);
    // Conta ainda carregando: fechado.
    expect(liberadoNaTela("mcp", null)).toBe(false);
    expect(liberadoNaTela("mcp", undefined)).toBe(false);
  });

  it("liberado pelo admin: aparece para qualquer conta", () => {
    const conta = { admin: false, emTeste: { mcp: false, stripe: true } };
    expect(liberadoNaTela("mcp", conta)).toBe(true);
    // Só o que foi liberado: os outros seguem fechados.
    expect(liberadoNaTela("stripe", conta)).toBe(false);
    expect(liberadoNaTela("indicacoes", conta)).toBe(false);
  });

  it("fechado de novo pelo admin: some para a conta comum, o admin continua vendo", () => {
    const estado = { mcp: true, indicacoes: true, stripe: true };
    expect(liberadoNaTela("indicacoes", { admin: false, emTeste: estado })).toBe(false);
    expect(liberadoNaTela("indicacoes", { admin: true, emTeste: estado })).toBe(true);
  });

  it("todo recurso tem título e descrição para a aba do admin", () => {
    for (const r of RECURSOS_EM_TESTE) {
      expect(SOBRE_O_RECURSO[r].titulo.length).toBeGreaterThan(3);
      expect(SOBRE_O_RECURSO[r].descricao.length).toBeGreaterThan(20);
    }
  });
});

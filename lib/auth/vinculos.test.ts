import { describe, expect, it } from "vitest";
import {
  ehProvedorVinculo,
  erroDoRetorno,
  nomeDaConta,
  PROVEDORES_VINCULO,
} from "./vinculos";

describe("redes que dá para vincular", () => {
  it("aceita Discord, LinkedIn e X — e nunca o Google, que é o login", () => {
    for (const p of PROVEDORES_VINCULO) expect(ehProvedorVinculo(p)).toBe(true);
    // A rota de desvincular apaga a conta da rede pedida: o Google não entra.
    expect(ehProvedorVinculo("google")).toBe(false);
    expect(ehProvedorVinculo("Twitter")).toBe(false);
    expect(ehProvedorVinculo("")).toBe(false);
  });
});

describe("nomeDaConta", () => {
  it("no X mostra o @, não o nome de exibição", () => {
    expect(
      nomeDaConta("twitter", {
        user: { name: "Alexandre" },
        data: { data: { id: "1", name: "Alexandre", username: "tavano_dev" } },
      }),
    ).toBe("@tavano_dev");
  });
  it("no X, sem o @, cai no nome de exibição", () => {
    expect(nomeDaConta("twitter", { user: { name: " Alexandre " } })).toBe(
      "Alexandre",
    );
    expect(
      nomeDaConta("twitter", { user: { name: "Alexandre" }, data: null }),
    ).toBe("Alexandre");
  });
  it("nas outras redes mostra o nome do perfil", () => {
    expect(
      nomeDaConta("linkedin", {
        user: { name: "Alexandre Tavano" },
        data: { sub: "abc", name: "Alexandre Tavano" },
      }),
    ).toBe("Alexandre Tavano");
    expect(nomeDaConta("discord", { user: { name: "tavano" } })).toBe("tavano");
  });
  it("sem nome, devolve null (a tela mostra só que está vinculada)", () => {
    expect(nomeDaConta("linkedin", { user: { name: "  " } })).toBeNull();
    expect(nomeDaConta("discord", { user: {} })).toBeNull();
  });
});

describe("erroDoRetorno", () => {
  it("explica a conta que já é de outro usuário e a recusa na tela da rede", () => {
    expect(
      erroDoRetorno("account_already_linked_to_different_user").aviso,
    ).toMatch(/outro usuário/);
    expect(erroDoRetorno("access_denied")).toEqual({
      aviso: "Você não autorizou o acesso. Nada foi vinculado.",
    });
    expect(erroDoRetorno("user_cancelled_authorize").aviso).toMatch(
      /não autorizou/,
    );
  });
  it("qualquer outro código vira um aviso geral, com o código junto", () => {
    expect(erroDoRetorno("unauthorized_scope_error")).toEqual({
      aviso: "Não deu para concluir o vínculo. Tente de novo.",
      codigo: "unauthorized_scope_error",
    });
  });
  it("não repete na tela um texto qualquer posto no endereço", () => {
    expect(
      erroDoRetorno("Sua conta foi suspensa, ligue para 0800").codigo,
    ).toBeUndefined();
    expect(erroDoRetorno("<b>x</b>").codigo).toBeUndefined();
  });
});

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  dadosDoRecurso,
  dadosDoServidor,
  desafioValido,
  pkceConfere,
  redirectDoCliente,
  redirectValido,
} from "./oauth";

describe("endereço de retorno do OAuth", () => {
  it("aceita https em qualquer lugar e http só na própria máquina", () => {
    expect(redirectValido("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(redirectValido("http://localhost:6274/oauth/callback")).toBe(true);
    expect(redirectValido("http://127.0.0.1:3000/cb")).toBe(true);
  });

  it("recusa http na rede, outros protocolos, fragmento e lixo", () => {
    expect(redirectValido("http://exemplo.com/cb")).toBe(false);
    expect(redirectValido("javascript:alert(1)")).toBe(false);
    expect(redirectValido("meuapp://cb")).toBe(false);
    expect(redirectValido("https://claude.ai/cb#x")).toBe(false);
    expect(redirectValido("não é url")).toBe(false);
    expect(redirectValido(undefined)).toBe(false);
    expect(redirectValido("https://a.com/" + "x".repeat(400))).toBe(false);
  });

  it("só vale o endereço exato que o cliente registrou", () => {
    const cliente = {
      id: "c",
      nome: "Claude",
      redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
    };
    expect(redirectDoCliente(cliente, "https://claude.ai/api/mcp/auth_callback")).toBe(true);
    // Um caminho a mais, outro domínio ou um parâmetro extra: não é o registrado.
    expect(redirectDoCliente(cliente, "https://claude.ai/api/mcp/auth_callback/x")).toBe(false);
    expect(redirectDoCliente(cliente, "https://claude.ai.evil.com/api/mcp/auth_callback")).toBe(false);
    expect(redirectDoCliente(cliente, "https://claude.ai/api/mcp/auth_callback?a=1")).toBe(false);
    expect(redirectDoCliente(cliente, null)).toBe(false);
  });
});

describe("PKCE (S256)", () => {
  const verificador = "a".repeat(43) + "-._~Z9";
  const desafio = createHash("sha256").update(verificador).digest("base64url");

  it("confere o verificador com o desafio do pedido", () => {
    expect(desafioValido(desafio)).toBe(true);
    expect(pkceConfere(verificador, desafio)).toBe(true);
  });

  it("recusa verificador errado, curto ou ausente", () => {
    expect(pkceConfere(verificador + "x", desafio)).toBe(false);
    expect(pkceConfere("curto", desafio)).toBe(false);
    expect(pkceConfere(undefined, desafio)).toBe(false);
    // O próprio desafio não serve de verificador (método "plain" não é aceito).
    expect(pkceConfere(desafio, desafio)).toBe(false);
    expect(desafioValido("curto")).toBe(false);
    expect(desafioValido(null)).toBe(false);
  });
});

describe("documentos de descoberta", () => {
  const origem = "https://aistudio.nido.global";

  it("o recurso aponta para o servidor de autorização do próprio app", () => {
    expect(dadosDoRecurso(origem)).toMatchObject({
      resource: `${origem}/api/mcp`,
      authorization_servers: [origem],
    });
  });

  it("o servidor anuncia os três endereços e exige PKCE S256, sem segredo de cliente", () => {
    expect(dadosDoServidor(origem)).toMatchObject({
      issuer: origem,
      authorization_endpoint: `${origem}/api/mcp/oauth/autorizar`,
      token_endpoint: `${origem}/api/mcp/oauth/token`,
      registration_endpoint: `${origem}/api/mcp/oauth/registrar`,
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  });
});

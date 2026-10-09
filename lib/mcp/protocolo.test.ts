import { describe, expect, it } from "vitest";
import { listaDeFerramentas, tratarMensagem } from "./protocolo";
import {
  gerarToken,
  hashDoToken,
  PREFIXO_TOKEN,
  tokenDoCabecalho,
} from "./tokens";

const ctx = { userId: "u1", req: new Request("https://app.exemplo/api/mcp") };

describe("MCP: protocolo", () => {
  it("initialize devolve a versão pedida (se conhecida) e anuncia as ferramentas", async () => {
    const r = await tratarMensagem(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26" },
      },
      ctx,
    );
    expect(r).toMatchObject({
      id: 1,
      result: { protocolVersion: "2025-03-26", capabilities: { tools: {} } },
    });
    const outra = await tratarMensagem(
      { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } },
      ctx,
    );
    expect((outra as { result: { protocolVersion: string } }).result.protocolVersion).toBe("2025-06-18");
  });

  it("notificação não tem resposta; método desconhecido dá erro", async () => {
    expect(
      await tratarMensagem({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx),
    ).toBeNull();
    expect(
      await tratarMensagem({ jsonrpc: "2.0", id: 3, method: "resources/list" }, ctx),
    ).toMatchObject({ id: 3, error: { code: -32601 } });
    expect(await tratarMensagem({ id: 4, method: "ping" }, ctx)).toMatchObject({
      error: { code: -32600 },
    });
  });

  it("tools/list: toda ferramenta tem nome único, descrição e esquema de objeto", () => {
    const lista = listaDeFerramentas();
    expect(lista.length).toBeGreaterThan(8);
    expect(new Set(lista.map((f) => f.name)).size).toBe(lista.length);
    for (const f of lista) {
      expect(f.name).toMatch(/^[a-z_]+$/);
      expect(f.description.length).toBeGreaterThan(20);
      expect(f.inputSchema).toMatchObject({ type: "object" });
    }
  });

  it("tools/call: ferramenta inexistente e argumentos inválidos", async () => {
    expect(
      await tratarMensagem(
        { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "nao_existe" } },
        ctx,
      ),
    ).toMatchObject({ error: { code: -32602 } });
    const r = await tratarMensagem(
      {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { name: "ver_personagem", arguments: {} },
      },
      ctx,
    );
    expect(r).toMatchObject({ id: 6, result: { isError: true } });
  });

  it("nenhuma ferramenta mexe com dinheiro", () => {
    for (const f of listaDeFerramentas())
      expect(f.name).not.toMatch(/pag|saque|sacar|reembols|checkout|admin/);
  });
});

describe("MCP: tokens", () => {
  it("token tem o prefixo, é longo e o hash é estável", () => {
    const t = gerarToken();
    expect(t.startsWith(PREFIXO_TOKEN)).toBe(true);
    expect(t.length).toBeGreaterThan(30);
    expect(gerarToken()).not.toBe(t);
    expect(hashDoToken(t)).toBe(hashDoToken(t));
    expect(hashDoToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("só aceita Bearer com token nosso", () => {
    const t = gerarToken();
    expect(tokenDoCabecalho(`Bearer ${t}`)).toBe(t);
    expect(tokenDoCabecalho(`bearer ${t}`)).toBe(t);
    expect(tokenDoCabecalho(null)).toBeNull();
    expect(tokenDoCabecalho("Bearer outro_token_qualquer_bem_comprido_123")).toBeNull();
    expect(tokenDoCabecalho("Bearer nidoaistudio_curto")).toBeNull();
    expect(tokenDoCabecalho(`Basic ${t}`)).toBeNull();
  });
});

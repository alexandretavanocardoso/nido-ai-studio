import { afterAll, describe, expect, it, vi } from "vitest";

// Recurso fechado (só admin), sem sessão de navegador (como no MCP).
vi.mock("./em-teste-server", () => ({ soAdminAgora: vi.fn(async () => true) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth/server", () => ({ getAuth: () => ({ api: { getSession: async () => null } }) }));
vi.mock("@/lib/db", () => ({
  getPool: () => ({
    query: async (_sql: string, [id]: [string]) => ({
      rows: [{ email: id === "admin" ? "admin@teste.com" : "outra@teste.com", v: true }],
    }),
  }),
}));

const antes = process.env.ADMIN_EMAILS;
process.env.ADMIN_EMAILS = "admin@teste.com";
afterAll(() => {
  process.env.ADMIN_EMAILS = antes;
});

const { liberadoOuResponder } = await import("./acesso");
const { comoUsuario } = await import("@/lib/auth/contexto");

describe("recurso em teste pelo MCP", () => {
  it("sem sessão e sem token: recusa (404)", async () => {
    expect((await liberadoOuResponder("motion"))?.status).toBe(404);
  });

  it("o dono do token vale no lugar da sessão: admin passa, os outros não", async () => {
    expect(await comoUsuario("admin", () => liberadoOuResponder("motion"))).toBeNull();
    expect((await comoUsuario("comum", () => liberadoOuResponder("video_produto")))?.status).toBe(404);
  });
});

import { describe, expect, it, vi } from "vitest";

// Só "admin" pode usar os recursos em teste (vídeo de produto, motion).
vi.mock("@/lib/admin/acesso", async (original) => ({
  ...(await original<typeof import("@/lib/admin/acesso")>()),
  usuarioLiberado: vi.fn(async (_recurso: string, userId: string) => userId === "admin"),
}));

const { tratarMensagem } = await import("./protocolo");
const { musicaDoPedido } = await import("./ferramentas-produto");
const { ErroDaFerramenta } = await import("./ferramentas");
const { DECLARACAO_MUSICA } = await import("@/lib/declaracoes");

const req = new Request("https://app.exemplo/api/mcp");
const NOVAS = [
  "listar_produtos",
  "criar_produto",
  "excluir_produto",
  "montar_cenas_do_produto",
  "criar_video_de_produto",
  "musica_de_link",
  "criar_motion",
  "status_do_motion",
  "listar_motions",
  "exportar_video_do_motion",
  "ajustar_motion",
];

const nomes = async (userId: string) => {
  const r = (await tratarMensagem({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { userId, req })) as {
    result: { tools: Array<{ name: string }> };
  };
  return r.result.tools.map((t) => t.name);
};

const chamar = (userId: string, name: string, args: unknown) =>
  tratarMensagem({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } }, { userId, req });

describe("MCP: vídeo de produto, criar produto e motion", () => {
  it("só aparecem para quem pode usar os recursos em teste", async () => {
    const admin = await nomes("admin");
    for (const n of NOVAS) expect(admin).toContain(n);
    const comum = await nomes("comum");
    for (const n of NOVAS) expect(comum).not.toContain(n);
    expect(comum).toContain("listar_personagens");
  });

  it("chamar sem acesso é como se a ferramenta não existisse", async () => {
    expect(await chamar("comum", "criar_motion", { tipo: "site", site_url: "https://exemplo.com" })).toMatchObject({
      error: { code: -32602 },
    });
  });

  it("criar_produto pede a foto básica ou a aparência antes de cobrar", async () => {
    const r = await chamar("admin", "criar_produto", { nome: "Caneca", logo_key: "users/admin/refs/logo.png" });
    expect(r).toMatchObject({ result: { isError: true } });
    expect(JSON.stringify(r)).toContain("foto_key");
  });

  it("vídeo de produto: diz quem aparece antes de qualquer coisa", async () => {
    const r = await chamar("admin", "criar_video_de_produto", {
      produto_id: "p1",
      cenas: [{ cena: "Ela mostra a caneca", fala: "Olha que linda" }],
    });
    expect(r).toMatchObject({ result: { isError: true } });
    expect(JSON.stringify(r)).toContain("Diga quem aparece");
  });

  it("motion a partir de um vídeo: pede o vídeo e a declaração de direito de uso", async () => {
    const semVideo = await chamar("admin", "criar_motion", { tipo: "video" });
    expect(JSON.stringify(semVideo)).toContain("video_referencia_key");
    const semDeclaracao = await chamar("admin", "criar_motion", {
      tipo: "video",
      video_referencia_key: "users/admin/videos/r.mp4",
    });
    expect(semDeclaracao).toMatchObject({ result: { isError: true } });
    expect(JSON.stringify(semDeclaracao)).toContain("direito_de_uso_do_video");
  });

  it("música de fundo só com a declaração de direito de uso confirmada", () => {
    expect(musicaDoPedido({})).toBeUndefined();
    expect(() => musicaDoPedido({ musica_key: "users/u/audios/a.m4a" })).toThrow(ErroDaFerramenta);
    expect(musicaDoPedido({ musica_key: "users/u/audios/a.m4a", musica_nome: "Trilha", musica_direito_de_uso: true })).toEqual({
      key: "users/u/audios/a.m4a",
      nome: "Trilha",
      declaracao: DECLARACAO_MUSICA,
    });
  });
});

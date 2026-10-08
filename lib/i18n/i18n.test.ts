import { describe, expect, it } from "vitest";
import { en } from "./en";
import { pt } from "./pt";
import { traduzir } from "./index";

describe("idiomas", () => {
  it("todo texto em português existe em inglês (e nenhum vazio)", () => {
    for (const k of Object.keys(pt) as Array<keyof typeof pt>)
      expect(en[k]?.trim(), k).toBeTruthy();
  });
  it("troca variáveis e cai pro português se faltar", () => {
    expect(traduzir("en", "etapa.xDeY", { x: 2, y: 7 })).toBe("Step 2 of 7");
    expect(traduzir("pt", "etapa.xDeY", { x: 2, y: 7 })).toBe("Etapa 2 de 7");
  });
});

describe("tx", () => {
  it("devolve o português em PT e traduz em EN, mantendo espaços das pontas", async () => {
    const { tx, definirIdiomaAtivo } = await import("./tx");
    definirIdiomaAtivo("pt");
    expect(tx("Cancelar")).toBe("Cancelar");
    definirIdiomaAtivo("en");
    expect(tx("Cancelar")).toBe("Cancel");
    expect(tx(" ou crie um vídeo novo")).toBe(" or create a new video");
    expect(tx("Texto sem tradução")).toBe("Texto sem tradução");
    definirIdiomaAtivo("pt");
  });
});

describe("txErro (mensagens do servidor)", () => {
  it("traduz texto fixo, texto com variáveis, final somado e frases juntas", async () => {
    const { definirIdiomaAtivo } = await import("./tx");
    const { txErro } = await import("./erros");
    const pt = "Muitas imagens seguidas. Tente de novo em 12s.";
    definirIdiomaAtivo("pt");
    expect(txErro(pt)).toBe(pt);
    definirIdiomaAtivo("en");
    expect(txErro(pt)).toBe("Too many images in a row. Try again in 12s.");
    expect(txErro("Voz não encontrada.")).toBe("Voice not found.");
    expect(txErro("Falha ao gerar (HTTP 502).")).toBe(
      "Failed to generate (HTTP 502).",
    );
    expect(
      txErro(
        "Você já tem 2 vídeos sendo gerados. O plano Starter permite 2 ao mesmo tempo — aguarde terminar ou faça upgrade.",
      ),
    ).toBe(
      "You already have 2 videos being generated. The Starter plan allows 2 at a time — wait for it to finish or upgrade.",
    );
    expect(
      txErro(
        'Sem espaço: 1,5 GB de 1 GB usados no plano Free. Remova vídeos e use "Liberar espaço" na página de planos, ou faça upgrade.',
      ),
    ).toBe(
      'Out of space: 1.5 GB of 1 GB used on the Free plan. Remove videos and use "Free up space" on the plans page, or upgrade.',
    );
    expect(
      txErro("Vídeo grande demais (máx. 300 MB). Os créditos foram devolvidos."),
    ).toBe("Video too large (max 300 MB). Your credits were refunded.");
    expect(
      txErro("TikTok precisa de um vídeo ou imagem. O YouTube precisa de um título."),
    ).toBe("TikTok needs a video or an image. YouTube needs a title.");
    expect(txErro("Erro que ninguém traduziu.")).toBe(
      "Erro que ninguém traduziu.",
    );
    definirIdiomaAtivo("pt");
  });

  it("toda mensagem fixa das rotas tem tradução", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { definirIdiomaAtivo } = await import("./tx");
    const { txErro } = await import("./erros");
    // Admin fica só em português; cron e webhooks não são vistos pelo usuário.
    const fora = /[\\/](admin|cron|webhook|auth)[\\/]/;
    const arquivos = (readdirSync("app/api", { recursive: true }) as string[])
      .map((f) => join("app/api", f))
      .filter((f) => f.endsWith("route.ts") && !fora.test(f));
    const faltam: string[] = [];
    definirIdiomaAtivo("en");
    for (const f of arquivos)
      for (const m of readFileSync(f, "utf8").matchAll(
        /\b(?:error|erro|message):\s*"([^"\n]*[a-zà-ú][^"\n]*)"/g,
      ))
        if (txErro(m[1]) === m[1]) faltam.push(`${f}: ${m[1]}`);
    definirIdiomaAtivo("pt");
    expect(faltam).toEqual([]);
  });
});

describe("idioma da IA", () => {
  it("lê o cookie e só instrui quando é inglês", async () => {
    const { idiomaDoPedido, instrucaoIdioma } = await import("../ai/idioma");
    const pedido = (cookie?: string) =>
      new Request("http://x", { headers: cookie ? { cookie } : {} });
    expect(idiomaDoPedido(pedido("a=1; nido-idioma=en"))).toBe("en");
    expect(idiomaDoPedido(pedido("nido-idioma=pt"))).toBe("pt");
    expect(idiomaDoPedido(pedido())).toBe("pt");
    expect(instrucaoIdioma("pt")).toBe("");
    expect(instrucaoIdioma("en")).toMatch(/English/);
  });
});

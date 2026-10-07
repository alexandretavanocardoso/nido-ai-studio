import { afterEach, describe, expect, it, vi } from "vitest";
import { tokenValido, urlPublica, webhookUrl } from "./webhook";
import { trechos } from "./ffmpeg";
import { bloqueioLegendaIA, creditosLegendaIA } from "@/lib/planos";

afterEach(() => vi.unstubAllEnvs());

describe("webhook", () => {
  it("só gera URL com domínio https público", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "segredo");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    expect(webhookUrl("job1")).toBeUndefined();
    vi.stubEnv("BETTER_AUTH_URL", "https://app.nido.studio/");
    expect(urlPublica()).toBe("https://app.nido.studio");
    expect(webhookUrl("job1")).toMatch(/^https:\/\/app\.nido\.studio\/api\/videos\/webhook\?job=job1&t=[0-9a-f]{32}$/);
  });

  it("token vale só para o próprio job", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "segredo");
    vi.stubEnv("BETTER_AUTH_URL", "https://app.nido.studio");
    const t = new URL(webhookUrl("job1")!).searchParams.get("t");
    expect(tokenValido("job1", t)).toBe(true);
    expect(tokenValido("job2", t)).toBe(false);
    expect(tokenValido("job1", "x".repeat(32))).toBe(false);
    expect(tokenValido("job1", null)).toBe(false);
  });
});

describe("remoção com IA", () => {
  it("divide o vídeo em trechos de até 4,8s cobrindo tudo", () => {
    const t = trechos(38.1);
    expect(t.length).toBe(8);
    expect(t.every((x) => x.duracao <= 4.8)).toBe(true);
    expect(t.reduce((s, x) => s + x.duracao, 0)).toBeCloseTo(38.1, 2);
    expect(trechos(4)).toEqual([{ inicio: 0, duracao: 4 }]);
  });

  it("custa 15 créditos/s e exige plano pago, até 60s", () => {
    expect(creditosLegendaIA(38.1)).toBe(585);
    expect(bloqueioLegendaIA("gratis", 10)).not.toBeNull();
    expect(bloqueioLegendaIA("starter", 60)).toBeNull();
    expect(bloqueioLegendaIA("studio", 61)).not.toBeNull();
  });
});

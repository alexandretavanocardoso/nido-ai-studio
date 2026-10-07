import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tarefa diária do radar com a fila cheia: usa o código real da rota e simula
 * só o que custa dinheiro (gerar o radar) e o banco. Confere o paralelismo, o
 * encadeamento de rodadas (?salto=N) e as travas contra laço infinito.
 */
const estado = vi.hoisted(() => ({
  pendentes: [] as string[],
  feitos: [] as string[],
  falham: new Set<string>(),
  emAndamento: 0,
  pico: 0,
  depois: [] as Array<() => unknown>,
}));

vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  // `after` roda depois da resposta: aqui só guardamos para executar em seguida.
  after: (fn: () => unknown) => {
    estado.depois.push(fn);
  },
}));
vi.mock("@/lib/db", () => ({ getPool: () => ({}) }));
vi.mock("@/lib/recursos", () => ({ recursosDisponiveis: () => ({ ia: true }) }));
vi.mock("@/lib/radar/server", () => ({
  pendentesDeHoje: async (limite: number) =>
    estado.pendentes.slice(0, limite).map((characterId) => ({ userId: "u", characterId })),
  atualizarRadar: async ({ characterId }: { characterId: string }) => {
    estado.emAndamento++;
    estado.pico = Math.max(estado.pico, estado.emAndamento);
    await new Promise((r) => setTimeout(r, 5));
    estado.emAndamento--;
    if (estado.falham.has(characterId)) throw new Error("sem temas");
    // Radar gravado: sai da fila de pendentes (como no banco de verdade).
    estado.pendentes = estado.pendentes.filter((id) => id !== characterId);
    estado.feitos.push(characterId);
    return { status: "ok" };
  },
}));

import { GET } from "@/app/api/cron/radar/route";

const SEGREDO = "segredo-de-teste";
const pedido = (salto?: number, auth = `Bearer ${SEGREDO}`) =>
  new Request(`https://app.exemplo/api/cron/radar${salto ? `?salto=${salto}` : ""}`, {
    headers: { authorization: auth },
  });

/** Roda a tarefa e todas as rodadas que ela encadear; devolve o resumo de cada uma. */
async function rodarAteOFim(saltoInicial = 0) {
  const rodadas: Array<Record<string, unknown>> = [];
  const chamadas: Array<{ url: string; auth: string | null }> = [];
  vi.stubGlobal("fetch", async (url: URL | string, init?: RequestInit) => {
    const u = new URL(String(url));
    const auth = new Headers(init?.headers).get("authorization");
    chamadas.push({ url: u.pathname + u.search, auth });
    rodadas.push(await (await GET(new Request(u, { headers: { authorization: auth ?? "" } }))).json());
    return new Response("{}");
  });
  rodadas.push(await (await GET(pedido(saltoInicial))).json());
  // Executa os `after` em cadeia (cada rodada pode agendar a próxima).
  while (estado.depois.length) await estado.depois.shift()!();
  return { rodadas, chamadas };
}

beforeEach(() => {
  process.env.CRON_SECRET = SEGREDO;
  Object.assign(estado, { pendentes: [], feitos: [], falham: new Set(), emAndamento: 0, pico: 0, depois: [] });
});

describe("tarefa diária do radar", () => {
  it("recusa quem não manda a senha", async () => {
    expect((await GET(pedido(0, "Bearer errada"))).status).toBe(401);
    expect((await GET(new Request("https://app.exemplo/api/cron/radar"))).status).toBe(401);
  });

  it("fila de 45: três rodadas encadeadas, todos feitos, no máximo 5 ao mesmo tempo", async () => {
    estado.pendentes = Array.from({ length: 45 }, (_, i) => `c${i}`);
    const { rodadas, chamadas } = await rodarAteOFim();
    expect(rodadas.map((r) => r.feitos)).toEqual([20, 20, 5]);
    expect(rodadas.map((r) => r.continuar)).toEqual([true, true, false]);
    expect(new Set(estado.feitos).size).toBe(45);
    expect(estado.pico).toBe(5);
    // Cada rodada seguinte é chamada com a senha e o número do salto.
    expect(chamadas).toEqual([
      { url: "/api/cron/radar?salto=1", auth: `Bearer ${SEGREDO}` },
      { url: "/api/cron/radar?salto=2", auth: `Bearer ${SEGREDO}` },
    ]);
  });

  it("fila exata de 20: faz uma rodada a mais, que encontra a fila vazia e para", async () => {
    estado.pendentes = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const { rodadas } = await rodarAteOFim();
    expect(rodadas.map((r) => [r.feitos, r.continuar])).toEqual([
      [20, true],
      [0, false],
    ]);
  });

  it("não entra em laço quando ninguém da fila consegue gerar (ex.: personagens sem temas)", async () => {
    estado.pendentes = Array.from({ length: 30 }, (_, i) => `c${i}`);
    estado.falham = new Set(estado.pendentes);
    const { rodadas, chamadas } = await rodarAteOFim();
    expect(rodadas).toHaveLength(1);
    expect(rodadas[0]).toMatchObject({ feitos: 20, pulado: 20, continuar: false });
    expect(chamadas).toEqual([]);
  });

  it("personagens que falham não travam os outros: os bons são feitos e a cadeia termina", async () => {
    estado.pendentes = Array.from({ length: 30 }, (_, i) => `c${i}`);
    estado.falham = new Set(["c0", "c1", "c2"]);
    const { rodadas } = await rodarAteOFim();
    expect(estado.feitos).toHaveLength(27);
    expect(rodadas.at(-1)!.continuar).toBe(false);
    expect(rodadas.length).toBeLessThanOrEqual(3);
  });

  it("para no limite de saltos mesmo com fila sobrando", async () => {
    estado.pendentes = Array.from({ length: 100 }, (_, i) => `c${i}`);
    const { rodadas, chamadas } = await rodarAteOFim(20);
    expect(rodadas).toHaveLength(1);
    expect(rodadas[0]).toMatchObject({ salto: 20, feitos: 20, continuar: false });
    expect(chamadas).toEqual([]);
  });
});

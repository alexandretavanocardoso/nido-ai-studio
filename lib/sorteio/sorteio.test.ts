import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "@neondatabase/serverless";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const banco = vi.hoisted(() => ({ pool: null as Pool | null }));
vi.mock("@/lib/db", () => ({ getPool: () => banco.pool }));

const contas = vi.hoisted(() => ({
  plano: {} as Record<string, string>,
  ativacoes: [] as { userId: string; plano: string; intervalo: string; ate: Date; ref: string }[],
  creditos: [] as { userId: string; qtd: number; ref: string }[],
  avisos: [] as { userId: string; rotulo: string; chave?: string | null }[],
  personagens: {} as Record<string, unknown>,
}));
vi.mock("@/lib/creditos", () => ({
  creditosAtivos: () => true,
  carregarConta: async (userId: string) => ({ plano: contas.plano[userId] ?? "gratis" }),
  ativarPlano: async (userId: string, plano: string, intervalo: string, ate: Date, o: { ref: string }) => {
    contas.ativacoes.push({ userId, plano, intervalo, ate, ref: o.ref });
  },
  creditarAvulsos: async (userId: string, qtd: number, _motivo: string, ref: string) => {
    contas.creditos.push({ userId, qtd, ref });
  },
}));
const pontos = vi.hoisted(() => ({
  dados: [] as { userId: string; pontos: number; sorteioId: string }[],
  /** Pontos de participação: quem correu em cada sorteio. */
  participou: [] as { userIds: string[]; pontos: number; sorteioId: string }[],
}));
vi.mock("@/lib/pontos-server", () => ({
  pontosDoSorteio: async (userId: string, qtd: number, sorteioId: string) => {
    pontos.dados.push({ userId, pontos: qtd, sorteioId });
  },
  pontosPorParticipar: async (userIds: string[], qtd: number, sorteioId: string) => {
    pontos.participou.push({ userIds: [...userIds].sort(), pontos: qtd, sorteioId });
  },
}));
vi.mock("@/lib/avisos-server", () => ({
  criarAviso: async (userId: string, a: { rotulo: string; chave?: string | null }) => {
    contas.avisos.push({ userId, rotulo: a.rotulo, chave: a.chave });
    return true;
  },
}));
vi.mock("@/lib/personagens", () => ({
  carregarPersonagem: async (userId: string, id: string) => contas.personagens[`${userId}:${id}`] ?? null,
}));
const foto = vi.hoisted(() => ({
  buffer: null as Buffer | null,
  desenhos: 0,
  falhar: false,
  /** Roda no meio do desenho (que leva uns 15 s de verdade). */
  durante: null as (() => Promise<void>) | null,
  /** A folha das poses não saiu com as 4 separadas. */
  semPassos: false,
}));
vi.mock("./corredor", () => ({
  desenharCorredor: async () => {
    foto.desenhos++;
    if (foto.durante) await foto.durante();
    if (foto.falhar) throw new Error("gemini fora");
    return { corpo: Buffer.from("figura-webp"), correndo: Buffer.from("correndo-jpg") };
  },
  desenharPassos: async () => (foto.semPassos ? null : Buffer.from("passos-webp")),
}));
vi.mock("@/lib/storage/s3", async (original) => ({
  ...(await original<typeof import("@/lib/storage/s3")>()),
  getObjectBuffer: async () => foto.buffer!,
}));

import { classificacao, CONTAGEM_S, DURACAO_PADRAO, DURACOES, fimDaCorrida, montarRoteiro, progresso } from "./corrida";
import {
  cancelarSorteio,
  capaDoPersonagem,
  carregarSorteio,
  concluirSeAcabou,
  criarSorteio,
  duplicarSorteio,
  ErroSorteio,
  imagemDoCorredor,
  informarPix,
  marcarPixPago,
  largar,
  listarSorteios,
  minhaParticipacao,
  mudarInscricoes,
  participar,
  removerParticipante,
  sairDoSorteio,
  sorteioAtual,
  sorteioPublico,
} from "./server";
import { corDoCorredor, creditosDoPresente, limparChavePix, limparNome, nomePremio, type Premio } from "./tipos";

describe("corrida (a receita que todas as telas montam)", () => {
  it("o sorteado cruza a linha primeiro, na duração escolhida, em qualquer semente e tamanho; os outros só depois", () => {
    for (const D of DURACOES)
      for (const n of [1, 2, 3, 8, 40, 300])
        for (let k = 0; k < (n === 300 ? 4 : 12); k++) {
          const semente = 1000 + k * 7919 + D;
          const vencedor = (k * 13) % n;
          const r = montarRoteiro(n, vencedor, semente, D);
          expect(r.chegada[vencedor]).toBe(D);
          expect(progresso(r, vencedor, D)).toBeCloseTo(1, 5);
          expect(progresso(r, vencedor, D - 0.1)).toBeLessThan(1);
          for (let i = 0; i < n; i++) if (i !== vencedor) expect(progresso(r, i, D)).toBeLessThan(1);
          expect(classificacao(r, D + 0.05)[0]).toBe(vencedor);
          expect(classificacao(r, fimDaCorrida(D))[0]).toBe(vencedor);
        }
  });

  it("é a mesma corrida em toda tela (mesma semente, mesmo resultado) e ninguém anda para trás", () => {
    const a = montarRoteiro(25, 7, 424242, 20);
    const b = montarRoteiro(25, 7, 424242, 20);
    expect(a).toEqual(b);
    for (let i = 0; i < 25; i++) {
      let antes = 0;
      for (let t = 0; t < fimDaCorrida(20) + 1; t += 0.05) {
        const p = progresso(a, i, t);
        expect(p).toBeGreaterThanOrEqual(antes - 1e-6);
        antes = p;
      }
      expect(progresso(a, i, -1)).toBe(0);
    }
  });

  it("tem emoção de corrida de patinhos: turbos, freadas e a liderança trocando de mão", () => {
    for (const D of [15, 30]) {
      let trocas = 0;
      let turbos = 0;
      let freios = 0;
      for (let k = 0; k < 20; k++) {
        const r = montarRoteiro(12, 0, 5000 + k, D);
        trocas += r.lideres.length - 1;
        turbos += r.eventos.filter((e) => e.tipo === "turbo").length;
        freios += r.eventos.filter((e) => e.tipo === "freio").length;
        // O sorteado faz a arrancada na reta final.
        expect(r.eventos.some((e) => e.i === 0 && e.tipo === "arrancada" && e.ini === r.retaFinal)).toBe(true);
      }
      // Em média, a liderança troca algumas vezes por corrida, e todo mundo vê turbos e freadas.
      expect(trocas / 20).toBeGreaterThanOrEqual(D === 15 ? 2 : 3);
      expect(turbos / 20).toBeGreaterThanOrEqual(D === 15 ? 2 : 4);
      expect(freios / 20).toBeGreaterThanOrEqual(1);
    }
  });

  it("o sorteado vem de trás na reta final e passa o líder perto da linha (chegada apertada)", () => {
    let pertoDaLinha = 0;
    for (let k = 0; k < 30; k++) {
      const D = DURACOES[k % DURACOES.length];
      const r = montarRoteiro(10, 3, 9000 + k, D);
      // No começo da reta final, alguém está na frente dele.
      expect(classificacao(r, r.retaFinal)[0]).not.toBe(3);
      // O 2º cruza menos de meio segundo depois.
      const segundo = Math.min(...r.chegada.filter((_, i) => i !== 3));
      expect(segundo - D).toBeLessThan(0.5);
      // A ultrapassagem decisiva acontece no último segundo e meio.
      const assumiu = r.lideres[r.lideres.length - 1];
      expect(assumiu.i).toBe(3);
      if (D - assumiu.t <= 1.5) pertoDaLinha++;
    }
    expect(pertoDaLinha).toBeGreaterThan(15);
  });
});

describe("textos do sorteio", () => {
  it("nome limpo de 2 a 24 letras; presente e créditos de quem já paga", () => {
    expect(limparNome("  Bia \n Santos  ")).toBe("Bia Santos");
    expect(limparNome("a")).toBeNull();
    expect(limparNome("x".repeat(25))).toBeNull();
    expect(nomePremio({ tipo: "plano", plano: "creator", meses: 1 })).toBe("Plano Creator · 1 mês");
    expect(nomePremio({ tipo: "plano", plano: "studio", meses: 3 })).toBe("Plano Studio · 3 meses");
    expect(nomePremio({ tipo: "creditos", quantidade: 1500 })).toBe("1.500 créditos");
    expect(nomePremio({ tipo: "pontos", quantidade: 300 })).toBe("300 pontos");
    expect(nomePremio({ tipo: "pix", centavos: 12345 }).replace(/\s/g, " ")).toBe("R$ 123,45 no Pix");
    expect(limparChavePix("  fulano@exemplo.com ")).toBe("fulano@exemplo.com");
    expect(limparChavePix("ab")).toBeNull();
    expect(creditosDoPresente("creator", 3)).toBe(1720 * 3);
    expect(corDoCorredor("abc")).toBe(corDoCorredor("abc"));
  });

  it("a capa do influencer: a escolhida, senão o retrato mais novo, senão a 1ª referência", () => {
    const base = { visual: { referencias: [{ key: "users/u/refs/ref.jpg" }] }, geradas: [] } as never;
    expect(capaDoPersonagem(base)).toBe("users/u/refs/ref.jpg");
    const comRetratos = {
      visual: { referencias: [] },
      geradas: [
        { tipo: "retrato", key: "velho", createdAt: 1 },
        { tipo: "card", key: "card", createdAt: 9 },
        { tipo: "retrato", key: "novo", createdAt: 5 },
      ],
    } as never;
    expect(capaDoPersonagem(comRetratos)).toBe("novo");
    expect(capaDoPersonagem({ visual: { capaKey: "capa", referencias: [] } } as never)).toBe("capa");
  });
});

describe("sorteio no banco (PGlite, com as migrations)", () => {
  let pool: Pool;
  const s3 = {} as never;

  beforeAll(async () => {
    const db = new PGlite();
    for (const f of readdirSync("db/migrations").sort()) await db.exec(readFileSync(`db/migrations/${f}`, "utf8"));
    pool = {
      query: async (sql: string, p?: unknown[]) => {
        const r = await db.query(sql, p);
        return { rows: r.rows, rowCount: r.rows.length || (r.affectedRows ?? 0) };
      },
    } as unknown as Pool;
    banco.pool = pool;
    for (const u of ["u1", "u2", "u3", "u4"])
      await pool.query(`insert into "user" (id, name, email, "emailVerified") values ($1, $1, $1 || '@exemplo.com', true)`, [u]);
    foto.buffer = await sharp({ create: { width: 400, height: 600, channels: 3, background: "#c08060" } }).jpeg().toBuffer();
    contas.personagens["u1:c1"] = { visual: { capaKey: "users/u1/refs/capa.jpg", referencias: [] }, geradas: [] };
  }, 60_000);

  beforeEach(() => {
    contas.ativacoes = [];
    contas.creditos = [];
    contas.avisos = [];
  });

  it("cria aberto (um de cada vez), as contas entram com nome e influencer (sem troca depois) e saem", async () => {
    const s = await criarSorteio(pool, { titulo: "Live de sexta", premio: { tipo: "plano", plano: "creator", meses: 1 }, adminEmail: "a@x.com" });
    expect(s.status).toBe("aberto");
    await expect(criarSorteio(pool, { titulo: "Outro", premio: { tipo: "plano", plano: "starter", meses: 1 }, adminEmail: "a@x.com" })).rejects.toThrow(ErroSorteio);
    expect((await sorteioAtual(pool))?.id).toBe(s.id);

    const eu = await participar(pool, s3, { userId: "u1", sorteioId: s.id, nome: "Alê", characterId: "c1" });
    expect(eu).toMatchObject({ nome: "Alê", characterId: "c1" });
    // O rosto do influencer vira uma foto quadrada de 256 px, e ele correndo vira a figura da corrida.
    const rosto = await imagemDoCorredor(pool, eu.id, "foto");
    expect((await sharp(rosto!).metadata()).width).toBe(256);
    expect((await imagemDoCorredor(pool, eu.id, "corpo"))?.toString()).toBe("figura-webp");
    expect(foto.desenhos).toBe(1);
    // O mesmo pedido de novo (clique duplo) só devolve a participação, sem desenhar de novo.
    expect((await participar(pool, s3, { userId: "u1", sorteioId: s.id, nome: "Alê", characterId: "c1" })).id).toBe(eu.id);
    expect(foto.desenhos).toBe(1);
    expect((await sorteioPublico(pool, s)).corredores[0].corpo).toBe(`/api/sorteio/corredor/${eu.id}?v=c1`);
    // E as poses das pernas se mexendo, na tira.
    expect((await imagemDoCorredor(pool, eu.id, "passos"))?.toString()).toBe("passos-webp");
    expect((await sorteioPublico(pool, s)).corredores[0].passos).toBe(`/api/sorteio/corredor/${eu.id}?v=c1&passos=1`);
    // Depois de entrar, não troca o nome nem quem corre.
    await expect(participar(pool, s3, { userId: "u1", sorteioId: s.id, nome: "Alê T.", characterId: "c1" })).rejects.toThrow("não dá para trocar");
    await expect(participar(pool, s3, { userId: "u1", sorteioId: s.id, nome: "Alê", characterId: null })).rejects.toThrow("não dá para trocar");
    expect(await minhaParticipacao(pool, s.id, "u1")).toMatchObject({ nome: "Alê", characterId: "c1" });
    expect(foto.desenhos).toBe(1);
    await expect(participar(pool, s3, { userId: "u2", sorteioId: s.id, nome: "Bia", characterId: "nao-existe" })).rejects.toThrow("Influencer não encontrado.");
    // Sem influencer: corre o boneco (sem rosto nem figura).
    const bia = await participar(pool, s3, { userId: "u2", sorteioId: s.id, nome: "Bia", characterId: null });
    expect(await imagemDoCorredor(pool, bia.id, "foto")).toBeNull();
    expect(await imagemDoCorredor(pool, bia.id, "corpo")).toBeNull();
    expect((await sorteioPublico(pool, s)).corredores[1]).toMatchObject({ nome: "Bia", corpo: null, passos: null });
    await participar(pool, s3, { userId: "u3", sorteioId: s.id, nome: "Caio", characterId: null });
    await participar(pool, s3, { userId: "u4", sorteioId: s.id, nome: "Ofensivo", characterId: null });
    await sairDoSorteio(pool, "u3", s.id);
    expect(await minhaParticipacao(pool, s.id, "u3")).toBeNull();
    const pub = await sorteioPublico(pool, s);
    expect(pub.corredores.map((c) => c.nome)).toEqual(["Alê", "Bia", "Ofensivo"]);
    expect(pub.vencedor).toBeNull();
  });

  it("se desenhar falhar, entra assim mesmo (boneco com o rosto); sem as poses, a figura parada", async () => {
    const s = (await sorteioAtual(pool))!;
    contas.personagens["u3:c3"] = { visual: { capaKey: "users/u3/refs/capa.jpg", referencias: [] }, geradas: [] };
    foto.falhar = true;
    const p = await participar(pool, s3, { userId: "u3", sorteioId: s.id, nome: "Caio", characterId: "c3" });
    expect(await imagemDoCorredor(pool, p.id, "corpo")).toBeNull();
    expect(await imagemDoCorredor(pool, p.id, "passos")).toBeNull();
    expect(await imagemDoCorredor(pool, p.id, "foto")).not.toBeNull();
    foto.falhar = false;
    await sairDoSorteio(pool, "u3", s.id);
    // A figura saiu, mas as poses não: corre a figura parada, pulando.
    foto.semPassos = true;
    try {
      const q = await participar(pool, s3, { userId: "u3", sorteioId: s.id, nome: "Caio", characterId: "c3" });
      expect(await imagemDoCorredor(pool, q.id, "corpo")).not.toBeNull();
      expect(await imagemDoCorredor(pool, q.id, "passos")).toBeNull();
    } finally {
      foto.semPassos = false;
    }
    await sairDoSorteio(pool, "u3", s.id);
  });

  it("fecha, reabre, tira um participante; fechado não aceita entrada; largar sorteia só entre quem ficou", async () => {
    const s = (await sorteioAtual(pool))!;
    await mudarInscricoes(pool, s.id, false);
    await expect(participar(pool, s3, { userId: "u3", sorteioId: s.id, nome: "Caio", characterId: null })).rejects.toThrow("fechadas");
    await mudarInscricoes(pool, s.id, true);
    const tirado = (await sorteioPublico(pool, s)).corredores.find((c) => c.nome === "Ofensivo")!;
    await removerParticipante(pool, s.id, tirado.id);
    // Quem foi tirado não volta sozinho.
    await expect(participar(pool, s3, { userId: "u4", sorteioId: s.id, nome: "Outro nome", characterId: null })).rejects.toThrow(ErroSorteio);
    const largado = await largar(pool, s.id);
    expect(largado.status).toBe("correndo");
    // A largada vem do relógio do servidor do app (o mesmo do "agora" das telas), não do banco.
    expect(Math.abs(new Date(largado.largada_em!).getTime() - Date.now())).toBeLessThan(2000);
    expect(largado.ordem).toHaveLength(2);
    expect(largado.ordem).toContain(largado.vencedor_id);
    expect(largado.ordem).not.toContain(tirado.id);
    await expect(largar(pool, s.id)).rejects.toThrow(ErroSorteio);
    await expect(cancelarSorteio(pool, s.id)).rejects.toThrow(ErroSorteio);
    await expect(removerParticipante(pool, s.id, largado.ordem![0])).rejects.toThrow(ErroSorteio);
    const pub = await sorteioPublico(pool, largado);
    expect(pub.corredores[pub.vencedor!].id).toBe(largado.vencedor_id);
    expect(pub.semente).toBeGreaterThan(0);
  });

  it("entrega quando o sorteado cruza a linha, uma vez só: conta no Grátis ganha o plano até daqui a N meses, sem assinatura", async () => {
    const s = (await sorteioAtual(pool))!;
    expect(s.duracao_s).toBe(DURACAO_PADRAO);
    const largada = new Date(s.largada_em!).getTime();
    expect((await concluirSeAcabou(pool, s, largada + (CONTAGEM_S + DURACAO_PADRAO - 1) * 1000)).status).toBe("correndo");
    const fim = largada + (CONTAGEM_S + DURACAO_PADRAO + 1) * 1000;
    const feito = await concluirSeAcabou(pool, s, fim);
    expect(feito.status).toBe("concluido");
    const ganhador = (await pool.query<{ user_id: string }>("select user_id from sorteio_participantes where id = $1", [s.vencedor_id])).rows[0].user_id;
    expect(contas.ativacoes).toHaveLength(1);
    expect(contas.ativacoes[0]).toMatchObject({ userId: ganhador, plano: "creator", intervalo: "mensal", ref: `sorteio:${s.id}` });
    const dias = (contas.ativacoes[0].ate.getTime() - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(27);
    expect(dias).toBeLessThan(32);
    expect(feito.entrega).toMatchObject({ tipo: "plano", plano: "creator" });
    expect(contas.avisos).toEqual([expect.objectContaining({ userId: ganhador, chave: `sorteio:${s.id}` })]);
    // Todo mundo que correu (os 2 que ficaram; quem saiu ou foi tirado não) ganha os pontos de participação.
    expect(pontos.participou.filter((x) => x.sorteioId === s.id)).toEqual([{ userIds: ["u1", "u2"], pontos: 50, sorteioId: s.id }]);
    // Outra tela pergunta de novo (com o objeto antigo): não entrega outra vez.
    await concluirSeAcabou(pool, s, fim + 5000);
    expect(contas.ativacoes).toHaveLength(1);
    expect(pontos.participou.filter((x) => x.sorteioId === s.id)).toHaveLength(1);
    const lista = await listarSorteios(pool);
    expect(lista[0]).toMatchObject({ status: "concluido", participantes: 2, ganhador: { userId: ganhador } });
  });

  it("duplica o sorteio que acabou: mesmo nome, prêmio e duração, e as mesmas pessoas com os corredores prontos", async () => {
    const velho = (await listarSorteios(pool))[0];
    const antes = foto.desenhos;
    const novo = await duplicarSorteio(pool, velho.id, "b@x.com");
    expect(novo).toMatchObject({ status: "aberto", titulo: "Live de sexta", premio: "plano", plano: "creator", meses: 1, duracao_s: DURACAO_PADRAO });
    expect(novo.id).not.toBe(velho.id);
    const pub = await sorteioPublico(pool, novo);
    expect(pub.corredores.map((c) => c.nome)).toEqual(["Alê", "Bia"]);
    // A figura e as poses vêm junto (sem desenhar de novo); quem foi tirado do original não volta.
    const ale = pub.corredores[0];
    expect(ale.id).not.toBe((await sorteioPublico(pool, (await carregarSorteio(pool, velho.id))!)).corredores[0].id);
    expect((await imagemDoCorredor(pool, ale.id, "corpo"))?.toString()).toBe("figura-webp");
    expect((await imagemDoCorredor(pool, ale.id, "passos"))?.toString()).toBe("passos-webp");
    expect(foto.desenhos).toBe(antes);
    expect(await minhaParticipacao(pool, novo.id, "u1")).toMatchObject({ nome: "Alê", characterId: "c1" });
    expect(await minhaParticipacao(pool, novo.id, "u4")).toBeNull();
    // Um em andamento por vez, e só duplica o que acabou.
    await expect(duplicarSorteio(pool, velho.id, "b@x.com")).rejects.toThrow("em andamento");
    await expect(duplicarSorteio(pool, novo.id, "b@x.com")).rejects.toThrow("já acabou");
    await cancelarSorteio(pool, novo.id);
  });

  it("a duração escolhida vale para a corrida e para a entrega", async () => {
    const s = await criarSorteio(pool, { titulo: "Rapidinho", premio: { tipo: "creditos", quantidade: 10 }, adminEmail: "a@x.com", duracao: 15 });
    await participar(pool, s3, { userId: "u2", sorteioId: s.id, nome: "Bia", characterId: null });
    const largado = await largar(pool, s.id);
    expect((await sorteioPublico(pool, largado)).duracao).toBe(15);
    const largada = new Date(largado.largada_em!).getTime();
    expect((await concluirSeAcabou(pool, largado, largada + (CONTAGEM_S + 14) * 1000)).status).toBe("correndo");
    expect((await concluirSeAcabou(pool, largado, largada + (CONTAGEM_S + 15.5) * 1000)).status).toBe("concluido");
  });

  it("quem já tem plano pago ganha os créditos do presente (sem mexer no plano)", async () => {
    const s = await criarSorteio(pool, { titulo: "Live de sábado", premio: { tipo: "plano", plano: "studio", meses: 3 }, adminEmail: "a@x.com" });
    contas.plano.u2 = "starter";
    await participar(pool, s3, { userId: "u2", sorteioId: s.id, nome: "Bia", characterId: null });
    const largado = await largar(pool, s.id);
    await concluirSeAcabou(pool, largado, new Date(largado.largada_em!).getTime() + 60_000);
    expect(contas.ativacoes).toEqual([]);
    expect(contas.creditos).toEqual([{ userId: "u2", qtd: creditosDoPresente("studio", 3), ref: `sorteio:${s.id}` }]);
    expect((await carregarSorteio(pool, s.id))?.entrega).toMatchObject({ tipo: "creditos", creditos: 4200 * 3 });
  });

  it("cancelado não sai na tela e libera criar outro", async () => {
    const s = await criarSorteio(pool, { titulo: "Teste", premio: { tipo: "plano", plano: "starter", meses: 12 }, adminEmail: "a@x.com" });
    await cancelarSorteio(pool, s.id);
    expect((await sorteioAtual(pool))?.id).not.toBe(s.id);
    await expect(criarSorteio(pool, { titulo: "Depois", premio: { tipo: "plano", plano: "starter", meses: 1 }, adminEmail: "a@x.com" })).resolves.toBeTruthy();
  });

  /** Um sorteio do começo ao fim com um participante só (ele ganha). */
  async function sorteioCom(premio: Premio, userId: string) {
    const aberto = await sorteioAtual(pool);
    if (aberto && (aberto.status === "aberto" || aberto.status === "fechado")) await cancelarSorteio(pool, aberto.id);
    const s = await criarSorteio(pool, { titulo: `Prêmio ${premio.tipo}`, premio, adminEmail: "a@x.com" });
    await participar(pool, s3, { userId, sorteioId: s.id, nome: "Ganhador", characterId: null });
    const largado = await largar(pool, s.id);
    await concluirSeAcabou(pool, largado, new Date(largado.largada_em!).getTime() + 60_000);
    return (await carregarSorteio(pool, s.id))!;
  }

  it("prêmio em créditos e em pontos: a quantidade escolhida cai na conta", async () => {
    const c = await sorteioCom({ tipo: "creditos", quantidade: 777 }, "u1");
    expect(contas.creditos).toEqual([{ userId: "u1", qtd: 777, ref: `sorteio:${c.id}` }]);
    expect(c.entrega).toEqual({ tipo: "creditos", creditos: 777 });
    expect((await sorteioPublico(pool, c)).premio).toEqual({ tipo: "creditos", quantidade: 777 });
    const p = await sorteioCom({ tipo: "pontos", quantidade: 250 }, "u2");
    expect(pontos.dados).toEqual([{ userId: "u2", pontos: 250, sorteioId: p.id }]);
    expect(p.entrega).toEqual({ tipo: "pontos", pontos: 250 });
    expect(contas.avisos.map((a) => a.rotulo)).toEqual([
      expect.stringContaining("777 créditos"),
      expect.stringContaining("250 pontos"),
    ]);
  });

  it("prêmio em Pix: o ganhador informa a chave (só ele) e o admin marca como pago (só com a chave)", async () => {
    const s = await sorteioCom({ tipo: "pix", centavos: 15000 }, "u4");
    expect(s.entrega).toEqual({ tipo: "pix", centavos: 15000 });
    expect(contas.avisos.at(-1)?.rotulo).toMatch(/Informe sua chave Pix/);
    await expect(marcarPixPago(pool, s.id)).rejects.toThrow(/chave Pix/);
    await expect(informarPix(pool, { userId: "u1", sorteioId: s.id, chave: "x@y.com", titular: "Outra Pessoa" })).rejects.toThrow(ErroSorteio);
    const e = await informarPix(pool, { userId: "u4", sorteioId: s.id, chave: "ganhador@exemplo.com", titular: "Fulano de Tal" });
    expect(e).toMatchObject({ tipo: "pix", centavos: 15000, chave: "ganhador@exemplo.com", titular: "Fulano de Tal" });
    // Pode corrigir antes do pagamento.
    await informarPix(pool, { userId: "u4", sorteioId: s.id, chave: "11999998888", titular: "Fulano de Tal" });
    await marcarPixPago(pool, s.id);
    const pago = (await carregarSorteio(pool, s.id))!.entrega;
    expect(pago).toMatchObject({ tipo: "pix", chave: "11999998888" });
    expect((pago as { pagoEm?: string }).pagoEm).toBeTruthy();
    expect(contas.avisos.at(-1)).toMatchObject({ userId: "u4", rotulo: expect.stringMatching(/Pagamos .*150,00/) });
    // Depois de pago: não muda mais a chave nem paga de novo.
    await expect(informarPix(pool, { userId: "u4", sorteioId: s.id, chave: "outra", titular: "Fulano de Tal" })).rejects.toThrow(ErroSorteio);
    await expect(marcarPixPago(pool, s.id)).rejects.toThrow(ErroSorteio);
  });

  it("quem não tem influencer entra com uma foto enviada: ela vira o corredor", async () => {
    const aberto = await sorteioAtual(pool);
    if (aberto && (aberto.status === "aberto" || aberto.status === "fechado")) await cancelarSorteio(pool, aberto.id);
    const s = await criarSorteio(pool, { titulo: "Com foto", premio: { tipo: "pontos", quantidade: 10 }, adminEmail: "a@x.com" });
    await expect(
      participar(pool, s3, { userId: "u2", sorteioId: s.id, nome: "Bia", characterId: null, fotoKey: "users/u1/refs/alheia.jpg" }),
    ).rejects.toThrow("Foto não encontrada.");
    const antes = foto.desenhos;
    const eu = await participar(pool, s3, { userId: "u2", sorteioId: s.id, nome: "Bia", characterId: null, fotoKey: "users/u2/refs/eu.jpg" });
    expect(eu).toMatchObject({ characterId: null, fotoKey: "users/u2/refs/eu.jpg" });
    expect(foto.desenhos).toBe(antes + 1);
    expect(await imagemDoCorredor(pool, eu.id, "corpo")).not.toBeNull();
    expect((await minhaParticipacao(pool, s.id, "u2"))?.fotoKey).toBe("users/u2/refs/eu.jpg");
    // Outra foto depois de entrar: não troca.
    await expect(
      participar(pool, s3, { userId: "u2", sorteioId: s.id, nome: "Bia", characterId: null, fotoKey: "users/u2/refs/outra.jpg" }),
    ).rejects.toThrow("não dá para trocar");
    expect(foto.desenhos).toBe(antes + 1);
    await cancelarSorteio(pool, s.id);
  });

  it("a vaga sai antes de desenhar: se o admin fechar (ou largar) no meio, a pessoa corre assim mesmo", async () => {
    const s = await criarSorteio(pool, { titulo: "Na correria", premio: { tipo: "pontos", quantidade: 10 }, adminEmail: "a@x.com" });
    contas.personagens["u3:c3"] = { visual: { capaKey: "users/u3/refs/capa.jpg", referencias: [] }, geradas: [] };
    let corpoNoMeio: Buffer | null = null;
    let rostoNoMeio: Buffer | null = null;
    foto.durante = async () => {
      const p = await minhaParticipacao(pool, s.id, "u3");
      rostoNoMeio = p && (await imagemDoCorredor(pool, p.id, "foto"));
      corpoNoMeio = p && (await imagemDoCorredor(pool, p.id, "corpo"));
      await mudarInscricoes(pool, s.id, false);
    };
    try {
      const p = await participar(pool, s3, { userId: "u3", sorteioId: s.id, nome: "Caio", characterId: "c3" });
      // Enquanto desenhava, já estava na corrida com o rosto (o boneco), sem a figura.
      expect(rostoNoMeio).not.toBeNull();
      expect(corpoNoMeio).toBeNull();
      expect(await imagemDoCorredor(pool, p.id, "corpo")).not.toBeNull();
      expect((await sorteioPublico(pool, (await carregarSorteio(pool, s.id))!)).corredores.map((c) => c.nome)).toEqual(["Caio"]);
    } finally {
      foto.durante = null;
    }
    await cancelarSorteio(pool, s.id);
  });
});

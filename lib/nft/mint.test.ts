import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O fluxo do mint com o código real de lib/nft/mint.ts. Só é simulado o que
 * está fora dele: o banco (uma tabela nft_mints em memória, com o índice único
 * por personagem e rede), a rede, os créditos e o S3. Confere a ordem que protege o
 * dinheiro — simular antes de cobrar, gravar a assinatura antes de transmitir
 * — e que nenhum caminho deixa cobrança sem NFT nem estorno em dobro.
 */
type Situacao = "finalizada" | "pendente" | "revertida" | "sem_registro";

interface LinhaFalsa {
  id: string;
  user_id: string;
  character_id: string;
  carteira: string;
  asset: string;
  rede: string;
  nome: string;
  ficha_hash: string;
  status: string;
  assinatura: string | null;
  valido_ate_bloco: string | null;
  cobranca: unknown;
  erro: string | null;
  created_at: Date;
  updated_at: Date;
  preparando_velho: boolean;
  capa_key?: string;
  estornado?: boolean;
}

const e = vi.hoisted(() => ({
  linhas: [] as LinhaFalsa[],
  /** O que aconteceu, em ordem. */
  eventos: [] as string[],
  consentimentos: 0,
  creditos: 100,
  plano: "starter",
  carteira: "CARTEIRA_DO_USUARIO" as string | null,
  simulacao: null as string | null,
  situacao: "finalizada" as Situacao,
  altura: 0,
  contaExiste: false,
  saldoSol: 1,
  teto: 200,
  esconderAnterior: false,
  falharAoGravarEnvio: false,
  extrato: [] as Array<{ total: number; do_plano: number; do_avulso: number }>,
  proximoAsset: 0,
  /** O RPC está apontando para outra rede (conferirAmbienteNft lança). */
  rpcNaRedeErrada: false,
}));

const VIVOS = ["preparando", "enviado", "confirmado"];

vi.mock("@/lib/db", () => ({
  getPool: () => ({
    query: async (sql: string, p: unknown[] = []) => {
      const achar = (id: unknown) => e.linhas.find((l) => l.id === id);
      if (sql.includes("insert into nft_mints")) {
        if (
          e.linhas.some(
            (l) =>
              l.character_id === p[2] && l.rede === p[5] && VIVOS.includes(l.status),
          )
        )
          throw Object.assign(new Error("duplicate key"), { code: "23505" });
        e.linhas.push({
          id: p[0] as string,
          user_id: p[1] as string,
          character_id: p[2] as string,
          carteira: p[3] as string,
          asset: p[4] as string,
          rede: p[5] as string,
          nome: p[6] as string,
          ficha_hash: p[7] as string,
          status: "preparando",
          assinatura: null,
          valido_ate_bloco: null,
          cobranca: null,
          erro: null,
          created_at: new Date(),
          updated_at: new Date(),
          preparando_velho: false,
        });
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("from nft_artes"))
        // A arte do NFT: todo personagem tem, menos o "sem_arte".
        return {
          rows: p[0] === "sem_arte" ? [] : [{ key: `users/${p[1]}/nft/arte-${p[0]}.jpg` }],
        };
      if (sql.includes("insert into consentimentos")) {
        e.consentimentos++;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("set capa_key")) {
        achar(p[0])!.capa_key = p[1] as string;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("set status = 'enviado'")) {
        if (e.falharAoGravarEnvio) throw new Error("banco caiu");
        const l = achar(p[0]);
        if (!l || l.status !== "preparando") return { rows: [], rowCount: 0 };
        Object.assign(l, {
          status: "enviado",
          assinatura: p[1],
          valido_ate_bloco: String(p[2]),
          cobranca: p[3] ? JSON.parse(p[3] as string) : null,
        });
        e.eventos.push("gravou_assinatura");
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("set status = 'falhou'")) {
        const l = achar(p[0]);
        if (!l || !["preparando", "enviado"].includes(l.status))
          return { rows: [], rowCount: 0 };
        const antes = l.status;
        Object.assign(l, { status: "falhou", erro: p[1] });
        e.eventos.push("falhou");
        return {
          rows: [
            {
              user_id: l.user_id,
              cobranca: l.cobranca,
              nome: l.nome,
              character_id: l.character_id,
              antes,
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("set status = 'confirmado'")) {
        const l = achar(p[0]);
        if (!l || l.status !== "enviado") return { rows: [], rowCount: 0 };
        l.status = "confirmado";
        e.eventos.push("confirmou");
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("set estornado = true")) {
        // devolver(): a marca na linha, o extrato e o saldo mudam num comando só.
        const l = achar(p[0])!;
        if (l.estornado) return { rows: [], rowCount: 0 };
        l.estornado = true;
        e.creditos += p[3] as number;
        e.eventos.push("estornou");
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("motivo = 'nft_mint'"))
        return { rows: e.extrato, rowCount: e.extrato.length };
      if (sql.includes("count(*)::int as n"))
        return {
          rows: [
            {
              n: e.linhas.filter(
                (l) => ["enviado", "confirmado"].includes(l.status) && l.rede === p[0],
              ).length,
            },
          ],
        };
      if (sql.includes("where user_id = $1 and character_id = $2")) {
        if (e.esconderAnterior) return { rows: [] };
        const meus = e.linhas.filter(
          (l) => l.user_id === p[0] && l.character_id === p[1] && l.rede === p[2],
        );
        const vivo = meus.find((l) => l.status !== "falhou");
        return { rows: vivo ? [vivo] : meus.slice(-1) };
      }
      if (sql.includes("from nft_mints where id = $1")) {
        const l = achar(p[0]);
        return { rows: l ? [{ ...l }] : [] };
      }
      throw new Error(`consulta não prevista no teste: ${sql.slice(0, 80)}`);
    },
  }),
}));

vi.mock("./config", async (original) => ({
  ...(await original<typeof import("./config")>()),
  conferirAmbienteNft: async () => {
    if (e.rpcNaRedeErrada) throw new Error("O RPC do NFT não está na devnet.");
  },
  redeNft: () => "devnet",
  baseUrlNft: () => "https://app.exemplo",
  tetoDiarioNft: () => e.teto,
  saldoMinimoNft: () => 0.02,
}));

vi.mock("./core", () => ({
  montarMint: async (o: { uri: (asset: string) => string }) => {
    const asset = `ASSET_${++e.proximoAsset}`;
    e.eventos.push(`assinou:${o.uri(asset)}`);
    return {
      asset,
      assinatura: `SIG_${e.proximoAsset}`,
      bytes: new Uint8Array([1, 2, 3]),
      validoAteBloco: 1_000,
    };
  },
}));

vi.mock("./rede", () => ({
  simular: async () => {
    e.eventos.push("simulou");
    return e.simulacao;
  },
  transmitirEAcompanhar: async () => {
    e.eventos.push("transmitiu");
    return e.situacao;
  },
  situacaoDaTransacao: async () => e.situacao,
  alturaFinalizada: async () => e.altura,
  contaExiste: async () => e.contaExiste,
  saldoDaChaveDeMint: async () => e.saldoSol,
}));

vi.mock("@/lib/creditos", async () => {
  const { NextResponse } = await import("next/server");
  const cobranca = (total: number) => ({
    id: "cob1",
    userId: "u1",
    total,
    doPlano: total,
    doAvulso: 0,
  });
  return {
    planoAtual: async () => e.plano,
    cobrarOuResponder: async (_u: string, qtd: number) => {
      if (e.creditos < qtd)
        return NextResponse.json({ code: "SEM_CREDITOS" }, { status: 402 });
      e.creditos -= qtd;
      e.eventos.push("cobrou");
      return { cobranca: cobranca(qtd) };
    },
    estornar: async (c: { total: number }) => {
      e.creditos += c.total;
      e.eventos.push("estornou");
    },
    estornarSeHouver: async (c: { total: number } | null) => {
      if (!c) return;
      e.creditos += c.total;
      e.eventos.push("estornou");
    },
  };
});

vi.mock("@/lib/personagens", () => ({
  carregarPersonagem: async (_u: string, id: string) =>
    id === "sumido"
      ? null
      : personagem(id === "rascunho"),
}));
vi.mock("./carteira-server", () => ({
  carteiraDaConta: async () => e.carteira,
}));
vi.mock("@/lib/storage/s3", () => ({
  ownsKey: (u: string, k: string) => k.startsWith(`users/${u}/`),
  getObjectBuffer: async () => Buffer.from("imagem"),
  putObject: async () => {},
}));
vi.mock("sharp", () => {
  const cadeia = {
    rotate: () => cadeia,
    resize: () => cadeia,
    jpeg: () => cadeia,
    toBuffer: async () => Buffer.from("jpeg"),
  };
  return { default: () => cadeia };
});
vi.mock("@/lib/avisos-server", () => ({
  criarAviso: async (_u: string, a: { erro?: boolean }) => {
    e.eventos.push(a.erro ? "avisou_erro" : "avisou");
    return true;
  },
}));

import { NextResponse } from "next/server";
import { emptyCharacter } from "@/lib/defaults";
import { FOLGA_BLOCOS } from "./decisao";
import { conferirMint, mintar } from "./mint";

function personagem(rascunho: boolean, comRetrato = true) {
  const c = emptyCharacter();
  c.identidade.nome = rascunho ? "" : "Lila Nova";
  c.visual.referencias = [
    { id: "r", name: "r.jpg", dataUrl: "", size: 1, key: "users/u1/refs/r.jpg" },
  ];
  if (comRetrato)
    c.geradas = [
      {
        id: "g",
        key: "users/u1/generated/retrato.jpg",
        tipo: "retrato",
        estilo: "3d",
        qualidade: "padrao",
        size: 1,
        createdAt: 1,
      },
    ];
  return c;
}

const pedir = (characterId = "char1") =>
  mintar({ userId: "u1", characterId, ip: "1.2.3.4", s3: {} as never });

const quantos = (evento: string) => e.eventos.filter((x) => x === evento).length;
const antesDe = (a: string, b: string) =>
  e.eventos.indexOf(a) >= 0 && e.eventos.indexOf(a) < e.eventos.indexOf(b);

async function recusa(r: Awaited<ReturnType<typeof pedir>>) {
  expect(r).toBeInstanceOf(NextResponse);
  const res = r as NextResponse;
  return { status: res.status, ...((await res.json()) as { code?: string }) };
}

beforeEach(() => {
  Object.assign(e, {
    linhas: [],
    eventos: [],
    consentimentos: 0,
    creditos: 100,
    plano: "starter",
    carteira: "CARTEIRA_DO_USUARIO",
    simulacao: null,
    situacao: "finalizada",
    altura: 0,
    contaExiste: false,
    saldoSol: 1,
    teto: 200,
    esconderAnterior: false,
    falharAoGravarEnvio: false,
    extrato: [],
    proximoAsset: 0,
    rpcNaRedeErrada: false,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("mintar", () => {
  it("caminho feliz: simula, cobra, grava a assinatura e só então transmite", async () => {
    const r = await pedir();
    expect(r).not.toBeInstanceOf(NextResponse);
    const { mint } = r as { mint: { status: string; asset: string; carteira: string } };
    expect(mint.status).toBe("confirmado");
    expect(mint.carteira).toBe("CARTEIRA_DO_USUARIO");
    expect(antesDe("simulou", "cobrou")).toBe(true);
    expect(antesDe("cobrou", "gravou_assinatura")).toBe(true);
    expect(antesDe("gravou_assinatura", "transmitiu")).toBe(true);
    expect(e.creditos).toBe(90);
    expect(quantos("estornou")).toBe(0);
    expect(e.consentimentos).toBe(1);
    // O endereço dos metadados leva o endereço do próprio NFT.
    expect(e.eventos).toContain(`assinou:https://app.exemplo/api/nft/meta/${mint.asset}`);
    expect(e.linhas[0].capa_key).toMatch(/^users\/u1\/nft\/nft_.+\.jpg$/);
  });

  it("a rede recusaria (simulação): não cobra e não transmite", async () => {
    e.simulacao = '{"InstructionError":[0,{"Custom":26}]}';
    expect(await recusa(await pedir())).toMatchObject({ status: 502 });
    expect(quantos("cobrou")).toBe(0);
    expect(quantos("transmitiu")).toBe(0);
    expect(e.creditos).toBe(100);
    expect(e.linhas[0].status).toBe("falhou");
  });

  it("sem créditos: não transmite, e libera o personagem para tentar de novo", async () => {
    e.creditos = 9;
    expect(await recusa(await pedir())).toMatchObject({ status: 402 });
    expect(quantos("transmitiu")).toBe(0);
    expect(quantos("estornou")).toBe(0);
    expect(e.linhas[0].status).toBe("falhou");
    e.creditos = 10;
    const de_novo = (await pedir()) as { mint: { status: string } };
    expect(de_novo.mint.status).toBe("confirmado");
    expect(e.creditos).toBe(0);
  });

  it("plano grátis, sem carteira, ficha em rascunho e personagem de outra conta: recusa antes de tudo", async () => {
    e.plano = "gratis";
    expect(await recusa(await pedir())).toMatchObject({ status: 403, code: "PLANO" });
    e.plano = "starter";
    e.carteira = null;
    expect(await recusa(await pedir())).toMatchObject({ code: "SEM_CARTEIRA" });
    e.carteira = "CARTEIRA_DO_USUARIO";
    expect(await recusa(await pedir("rascunho"))).toMatchObject({ status: 400 });
    expect(await recusa(await pedir("sumido"))).toMatchObject({ status: 404 });
    expect(e.linhas).toHaveLength(0);
    expect(e.eventos).toEqual([]);
  });

  it("sem a arte do NFT não minta: retrato, referência ou outra imagem nunca viram a imagem pública", async () => {
    expect(await recusa(await pedir("sem_arte"))).toMatchObject({
      status: 400,
      code: "SEM_ARTE",
    });
    expect(e.linhas).toHaveLength(0);
    expect(e.eventos).toEqual([]);
  });

  it("teto do dia e saldo baixo da chave: recusa sem cobrar", async () => {
    e.teto = 0;
    expect(await recusa(await pedir())).toMatchObject({ status: 429 });
    e.teto = 200;
    e.saldoSol = 0.001;
    expect(await recusa(await pedir())).toMatchObject({ status: 503 });
    expect(quantos("cobrou")).toBe(0);
    expect(e.linhas).toHaveLength(0);
  });

  it("personagem já mintado: 409, sem segundo NFT nem segunda cobrança", async () => {
    await pedir();
    expect(await recusa(await pedir())).toMatchObject({
      status: 409,
      code: "JA_MINTADO",
    });
    expect(quantos("cobrou")).toBe(1);
    expect(quantos("transmitiu")).toBe(1);
    expect(e.linhas.filter((l) => l.status === "confirmado")).toHaveLength(1);
  });

  it("dois pedidos ao mesmo tempo: o índice único deixa passar um só", async () => {
    e.situacao = "pendente";
    await pedir(); // fica "enviado"
    e.esconderAnterior = true; // o segundo pedido não viu o primeiro na leitura
    expect(await recusa(await pedir())).toMatchObject({ status: 409 });
    expect(quantos("cobrou")).toBe(1);
    expect(quantos("transmitiu")).toBe(1);
  });

  it("cem pedidos simultâneos do mesmo personagem dão um NFT e uma cobrança", async () => {
    e.creditos = 10_000;
    const respostas = await Promise.all(Array.from({ length: 100 }, () => pedir()));
    const ok = respostas.filter((r) => !(r instanceof NextResponse));
    expect(ok).toHaveLength(1);
    expect(quantos("cobrou")).toBe(1);
    expect(quantos("transmitiu")).toBe(1);
    expect(e.linhas.filter((l) => VIVOS.includes(l.status))).toHaveLength(1);
    expect(e.creditos).toBe(9_990);
  });

  it("o banco cai entre cobrar e gravar a assinatura: nada é transmitido e os créditos voltam", async () => {
    e.falharAoGravarEnvio = true;
    e.extrato = [{ total: 10, do_plano: 10, do_avulso: 0 }];
    expect(await recusa(await pedir())).toMatchObject({ status: 500 });
    expect(quantos("transmitiu")).toBe(0);
    expect(quantos("cobrou")).toBe(1);
    expect(quantos("estornou")).toBe(1);
    expect(e.creditos).toBe(100);
    expect(e.linhas[0].status).toBe("falhou");
  });
});

describe("conferirMint (depois do envio)", () => {
  async function enviado() {
    e.situacao = "sem_registro";
    const r = (await pedir()) as { mint: { id: string; status: string } };
    expect(r.mint.status).toBe("enviado");
    return r.mint.id;
  }

  it("a rede ainda não conhece a transação e o prazo não passou: espera, sem estornar", async () => {
    const id = await enviado();
    e.altura = 1_000 + FOLGA_BLOCOS;
    expect((await conferirMint(id))?.status).toBe("enviado");
    expect(quantos("estornou")).toBe(0);
    expect(e.creditos).toBe(90);
  });

  it("o prazo passou e nada entrou: falha e estorna UMA vez, mesmo conferindo de novo", async () => {
    const id = await enviado();
    e.altura = 1_000 + FOLGA_BLOCOS + 1;
    expect((await conferirMint(id))?.status).toBe("falhou");
    await conferirMint(id);
    await Promise.all([conferirMint(id), conferirMint(id)]);
    expect(quantos("estornou")).toBe(1);
    expect(e.creditos).toBe(100);
    expect(quantos("avisou_erro")).toBe(1);
  });

  it("o prazo passou mas a conta do NFT existe: confirma, não estorna", async () => {
    const id = await enviado();
    e.altura = 1_000 + FOLGA_BLOCOS + 1;
    e.contaExiste = true;
    expect((await conferirMint(id))?.status).toBe("confirmado");
    expect(quantos("estornou")).toBe(0);
    expect(e.creditos).toBe(90);
  });

  it("a transação entra depois da resposta: confirma na conferência seguinte", async () => {
    const id = await enviado();
    e.situacao = "pendente";
    expect((await conferirMint(id))?.status).toBe("enviado");
    e.situacao = "finalizada";
    expect((await conferirMint(id))?.status).toBe("confirmado");
    expect(quantos("avisou")).toBe(1);
    expect(quantos("estornou")).toBe(0);
  });

  it("a rede executa e recusa: falha e estorna", async () => {
    const id = await enviado();
    e.situacao = "revertida";
    expect((await conferirMint(id))?.status).toBe("falhou");
    expect(quantos("estornou")).toBe(1);
    expect(e.creditos).toBe(100);
  });

  it("depois de falhar, o personagem pode ser mintado de novo", async () => {
    const id = await enviado();
    e.situacao = "revertida";
    await conferirMint(id);
    e.situacao = "finalizada";
    const r = (await pedir()) as { mint: { status: string; id: string } };
    expect(r.mint.status).toBe("confirmado");
    expect(r.mint.id).not.toBe(id);
    expect(e.creditos).toBe(90);
  });

  it("mint parado em 'preparando' (servidor caiu antes de enviar): vira falho só depois de velho", async () => {
    e.falharAoGravarEnvio = true;
    // sem extrato: a cobrança não chegou a existir neste cenário
    e.creditos = 100;
    e.linhas.push({
      id: "nft_parado",
      user_id: "u1",
      character_id: "char9",
      carteira: "C",
      asset: "A",
      rede: "devnet",
      nome: "X",
      ficha_hash: "h",
      status: "preparando",
      assinatura: null,
      valido_ate_bloco: null,
      cobranca: null,
      erro: null,
      created_at: new Date(),
      updated_at: new Date(),
      preparando_velho: false,
    });
    expect((await conferirMint("nft_parado"))?.status).toBe("preparando");
    e.linhas[0].preparando_velho = true;
    expect((await conferirMint("nft_parado"))?.status).toBe("falhou");
    expect(quantos("estornou")).toBe(0);
  });

  it("id que não existe: null", async () => {
    expect(await conferirMint("nao_existe")).toBeNull();
  });
});

describe("devnet e mainnet no mesmo banco", () => {
  const deOutraRede = (status: string): LinhaFalsa => ({
    id: "nft_mainnet",
    user_id: "u1",
    character_id: "char1",
    carteira: "CARTEIRA_DO_USUARIO",
    asset: "ASSET_MAINNET",
    rede: "mainnet",
    nome: "Lila Nova",
    ficha_hash: "h",
    status,
    assinatura: "SIG_MAINNET",
    valido_ate_bloco: "1000",
    cobranca: { id: "cobM", userId: "u1", total: 10, doPlano: 10, doAvulso: 0 },
    erro: null,
    created_at: new Date(),
    updated_at: new Date(),
    preparando_velho: true,
  });

  it("mint de outra rede não é julgado por esta: nem confirma, nem falha, nem devolve", async () => {
    e.linhas.push(deOutraRede("enviado"));
    // Nesta rede a assinatura é desconhecida e o prazo "passou": sem a trava, viraria falha com estorno.
    e.situacao = "sem_registro";
    e.altura = 10_000_000;
    expect((await conferirMint("nft_mainnet"))?.status).toBe("enviado");
    e.situacao = "revertida";
    expect((await conferirMint("nft_mainnet"))?.status).toBe("enviado");
    e.linhas[0].status = "preparando";
    expect((await conferirMint("nft_mainnet"))?.status).toBe("preparando");
    expect(quantos("estornou")).toBe(0);
    expect(quantos("falhou")).toBe(0);
    expect(e.creditos).toBe(100);
  });

  it("NFT do personagem em outra rede não impede o mint nesta, e o teto do dia conta só esta", async () => {
    e.linhas.push(deOutraRede("confirmado"));
    e.teto = 1;
    const r = (await pedir()) as { mint: { status: string; rede: string } };
    expect(r.mint.status).toBe("confirmado");
    expect(r.mint.rede).toBe("devnet");
    expect(e.linhas.map((l) => `${l.rede}:${l.status}`).sort()).toEqual([
      "devnet:confirmado",
      "mainnet:confirmado",
    ]);
    // nesta rede o personagem agora tem NFT
    expect(await recusa(await pedir())).toMatchObject({ status: 409 });
  });

  it("RPC apontando para outra rede: a conferência para antes de julgar e nada muda", async () => {
    e.situacao = "sem_registro";
    const r = (await pedir()) as { mint: { id: string; status: string } };
    expect(r.mint.status).toBe("enviado");
    e.rpcNaRedeErrada = true;
    e.altura = 10_000_000;
    await expect(conferirMint(r.mint.id)).rejects.toThrow(/não está na devnet/);
    expect(e.linhas[0].status).toBe("enviado");
    expect(quantos("estornou")).toBe(0);
    expect(e.creditos).toBe(90);
  });
});

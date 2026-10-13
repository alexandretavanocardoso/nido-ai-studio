import { Keypair, Transaction } from "@solana/web3.js";
import { afterEach, describe, expect, it } from "vitest";
import { base58 as base58NoNavegador } from "@/lib/carteira/solana";
import { contaDeToken } from "@/lib/indicacao/onchain";
import {
  assinaturaDaTransacao,
  base58,
  conferirTransacaoSolana,
  montarPagamentoSolana,
  recebido,
  valorUSD,
} from "./usdc";
import { lerCompra } from "./aplicar";
import { PACOTES, pacoteMaisBarato, precoAvulso } from "@/lib/planos";

describe("base58", () => {
  it("codifica como os endereços Solana (zeros à esquerda viram '1')", () => {
    expect(base58(new Uint8Array([0, 0, 1]))).toBe("112");
    expect(base58(new Uint8Array(32)).length).toBe(32); // 32 zeros → 32 '1'
    expect(base58(Uint8Array.from(Buffer.from("hello")))).toBe("Cn8eVZg");
  });
});

describe("recebido", () => {
  const NIDO = "NidoWallet111";
  const USDC = "MintUSDC";
  const saldo = (owner: string, mint: string, amount: string) => ({
    owner,
    mint,
    uiTokenAmount: { amount },
  });

  it("soma só o que a carteira da NIDO recebeu em USDC", () => {
    const meta = {
      preTokenBalances: [
        saldo(NIDO, USDC, "1000000"),
        saldo("cliente", USDC, "50000000"),
      ],
      postTokenBalances: [
        saldo(NIDO, USDC, "16000000"),
        saldo("cliente", USDC, "35000000"),
      ],
    };
    expect(recebido(meta, NIDO, USDC)).toBe(BigInt(15_000_000)); // 15 USDC
  });

  it("ignora outro token e conta criada na própria transação (sem pre)", () => {
    expect(
      recebido(
        { postTokenBalances: [saldo(NIDO, "OUTRO", "9999999")] },
        NIDO,
        USDC,
      ),
    ).toBe(BigInt(0));
    expect(
      recebido(
        { postTokenBalances: [saldo(NIDO, USDC, "40000000")] },
        NIDO,
        USDC,
      ),
    ).toBe(BigInt(40_000_000));
  });
});

describe("transação colada (Solana)", () => {
  const NIDO = "NidoWallet111";
  const USDC = "MintUSDC";
  const REF = "ReferenciaDaCobranca";
  const envOriginal = { ...process.env };
  afterEach(() => {
    process.env = { ...envOriginal };
  });
  const naNido = () => {
    process.env.SOLANA_MERCHANT_WALLET = NIDO;
    process.env.SOLANA_USDC_MINT = USDC;
  };

  const criada = new Date("2026-10-12T12:00:00Z");
  const janela = {
    desde: new Date(criada.getTime() - 2 * 60_000),
    ate: new Date(criada.getTime() + 24 * 3600_000),
  };
  /** Transação que deixa `micro` de USDC na carteira da NIDO. */
  const tx = (
    micro: number,
    o: { ref?: boolean; quando?: Date; err?: unknown; mint?: string } = {},
  ) => ({
    blockTime: (o.quando ?? new Date(criada.getTime() + 60_000)).getTime() / 1000,
    meta: {
      err: o.err ?? null,
      preTokenBalances: [],
      postTokenBalances: [
        { owner: NIDO, mint: o.mint ?? USDC, uiTokenAmount: { amount: String(micro) } },
      ],
    },
    transaction: {
      message: {
        accountKeys: [{ pubkey: "cliente" }, ...(o.ref ? [{ pubkey: REF }] : [])],
      },
    },
  });
  const COBRADO = BigInt(18_010_000); // 18.01 USDC

  it("tira a assinatura de um link do explorer ou da assinatura pura", () => {
    const sig = base58(Uint8Array.from({ length: 64 }, (_, i) => i + 1));
    expect(assinaturaDaTransacao(`https://solscan.io/tx/${sig}`)).toBe(sig);
    expect(
      assinaturaDaTransacao(
        `https://explorer.solana.com/tx/${sig}?cluster=mainnet-beta`,
      ),
    ).toBe(sig);
    expect(assinaturaDaTransacao(` ${sig} `)).toBe(sig);
    expect(assinaturaDaTransacao(sig + "abc")).toBeNull(); // comprida demais
    expect(assinaturaDaTransacao(base58(new Uint8Array(32).fill(9)))).toBeNull(); // endereço
    expect(assinaturaDaTransacao("0x" + "ab".repeat(32))).toBeNull(); // hash EVM
  });

  it("sem a referência, só vale o valor exato da cobrança", () => {
    naNido();
    expect(conferirTransacaoSolana(tx(18_010_000), COBRADO, REF, janela).ok).toBe(
      true,
    );
    expect(conferirTransacaoSolana(tx(18_000_000), COBRADO, REF, janela)).toEqual(
      {
        ok: false,
        erro: "Valor enviado: 18.00 USDC. Esta cobrança é de exatamente 18.01 USDC.",
      },
    );
    // A mais também não: pode ser o pagamento de outra cobrança.
    expect(conferirTransacaoSolana(tx(18_020_000), COBRADO, REF, janela).ok).toBe(
      false,
    );
  });

  it("com a referência (QR), basta cobrir o valor", () => {
    naNido();
    const com = (micro: number) =>
      conferirTransacaoSolana(tx(micro, { ref: true }), COBRADO, REF, janela).ok;
    expect(com(18_010_000)).toBe(true);
    expect(com(19_000_000)).toBe(true);
    expect(com(18_000_000)).toBe(false);
  });

  it("recusa transação fora da janela, que falhou ou que não pagou a NIDO", () => {
    naNido();
    const conferir = (t: ReturnType<typeof tx> | null) =>
      conferirTransacaoSolana(t, COBRADO, REF, janela);
    expect(conferir(null)).toMatchObject({ ok: false, aguardar: true });
    expect(conferir(tx(18_010_000, { err: { InstructionError: [] } })).ok).toBe(
      false,
    );
    expect(conferir(tx(18_010_000, { mint: "OUTRO" })).ok).toBe(false);
    expect(
      conferir(
        tx(18_010_000, { quando: new Date(criada.getTime() - 10 * 60_000) }),
      ).ok,
    ).toBe(false);
    expect(
      conferir(
        tx(18_010_000, { quando: new Date(criada.getTime() + 25 * 3600_000) }),
      ).ok,
    ).toBe(false);
    // 1 min antes da cobrança ainda cabe na folga de relógio.
    expect(
      conferir(tx(18_010_000, { quando: new Date(criada.getTime() - 60_000) }))
        .ok,
    ).toBe(true);
  });
});

describe("pagamento pela carteira conectada (Solana)", () => {
  it("monta a transferência do QR: USDC do pagador para a NIDO, com a referência", () => {
    const chave = () => Keypair.generate().publicKey;
    const [pagador, nido, mint, referencia] = [chave(), chave(), chave(), chave()];
    const tx = Transaction.from(
      Buffer.from(
        montarPagamentoSolana({
          pagador: pagador.toBase58(),
          destino: nido.toBase58(),
          mint: mint.toBase58(),
          micro: BigInt(18_010_000),
          referencia: referencia.toBase58(),
          blockhash: chave().toBase58(),
          lastValidBlockHeight: 1,
        }),
        "base64",
      ),
    );
    expect(tx.feePayer?.equals(pagador)).toBe(true);
    expect(tx.instructions).toHaveLength(1);
    const [ix] = tx.instructions;
    expect(ix.keys.map((k) => k.pubkey.toBase58())).toEqual([
      contaDeToken(mint, pagador).toBase58(),
      mint.toBase58(),
      contaDeToken(mint, nido).toBase58(),
      pagador.toBase58(),
      referencia.toBase58(),
    ]);
    // Só o pagador assina; a referência é só de leitura.
    expect(ix.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58())).toEqual(
      [pagador.toBase58()],
    );
    expect(ix.keys[4].isWritable).toBe(false);
    // TransferChecked (12), valor em unidades mínimas, 6 casas.
    expect(ix.data[0]).toBe(12);
    expect(ix.data.readBigUInt64LE(1)).toBe(BigInt(18_010_000));
    expect(ix.data[9]).toBe(6);
  });

  it("a assinatura que o navegador devolve sai no mesmo base58 do servidor", () => {
    const bytes = Uint8Array.from({ length: 64 }, (_, i) => (i * 7) % 256);
    expect(base58NoNavegador(bytes)).toBe(base58(bytes));
    expect(assinaturaDaTransacao(base58NoNavegador(bytes))).toBe(base58(bytes));
  });
});

describe("compras", () => {
  it("lê plano e pacote válidos; recusa o resto", () => {
    expect(
      lerCompra({ tipo: "plano", plano: "creator", intervalo: "anual" }),
    ).toEqual({
      tipo: "plano",
      plano: "creator",
      intervalo: "anual",
    });
    expect(lerCompra({ tipo: "pacote", pacote: "p1500" })).toEqual({
      tipo: "pacote",
      pacote: "p1500",
    });
    expect(
      lerCompra({ tipo: "plano", plano: "gratis", intervalo: "mensal" }),
    ).toBeNull();
    expect(lerCompra({ tipo: "pacote", pacote: "p999" })).toBeNull();
  });

  it("compra manual: mínimo 100, inteiro, até 100 mil (metadata do Stripe vem como texto)", () => {
    expect(lerCompra({ tipo: "avulso", creditos: "250" })).toEqual({
      tipo: "avulso",
      creditos: 250,
    });
    expect(lerCompra({ tipo: "avulso", creditos: 100 })).toEqual({
      tipo: "avulso",
      creditos: 100,
    });
    expect(lerCompra({ tipo: "avulso", creditos: 99 })).toBeNull();
    expect(lerCompra({ tipo: "avulso", creditos: 150.5 })).toBeNull();
    expect(lerCompra({ tipo: "avulso", creditos: 100_001 })).toBeNull();
    expect(lerCompra({ tipo: "avulso", creditos: null })).toBeNull();
  });

  it("preço da compra manual = preço por crédito do menor pacote", () => {
    expect(valorUSD({ tipo: "avulso", creditos: 100 })).toBe(3);
    expect(valorUSD({ tipo: "avulso", creditos: 333 })).toBe(9.99);
    expect(precoAvulso(100, "BRL")).toBe(16);
    expect(precoAvulso(1234, "BRL")).toBe(197.44);
    // Pacote nunca sai mais caro que a mesma quantidade avulsa.
    for (const p of Object.values(PACOTES))
      expect(p.precoBRL).toBeLessThanOrEqual(precoAvulso(p.creditos, "BRL"));
    expect(pacoteMaisBarato(200)).toBeNull();
    expect(pacoteMaisBarato(495)).toBe("p500");
  });

  it("preço em USDC = tabela em dólar (anual com 20% off)", () => {
    expect(valorUSD({ tipo: "pacote", pacote: "p500" })).toBe(15);
    expect(
      valorUSD({ tipo: "plano", plano: "studio", intervalo: "mensal" }),
    ).toBe(99);
    expect(
      valorUSD({ tipo: "plano", plano: "studio", intervalo: "anual" }),
    ).toBe(950);
  });
});

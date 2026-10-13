import { encodeFunctionData, erc20Abi } from "viem";
import { afterEach, describe, expect, it } from "vitest";
import {
  hashDaTransacao,
  recebidoNaTransacao,
  linkEip681,
  microDoPreco,
  REDES_EVM,
  redesEvmAtivas,
  transferenciaUsdc,
  unidadesDoToken,
} from "./evm";
import { microDoTexto, textoMicro } from "./usdc";

const CARTEIRA = "0x1111111111111111111111111111111111111111";
const envOriginal = { ...process.env };
afterEach(() => {
  process.env = { ...envOriginal };
});

describe("valor único", () => {
  it("usa o preço com 2 casas e desempata em centavos", () => {
    expect(microDoPreco(39)).toBe(BigInt(39_000_000));
    expect(microDoPreco(4.9)).toBe(BigInt(4_900_000));
    expect(microDoPreco(39, 2)).toBe(BigInt(39_020_000));
  });
  it("converte texto ↔ micro sem erro de ponto flutuante", () => {
    expect(textoMicro(BigInt(15_003_721))).toBe("15.003721");
    expect(textoMicro(BigInt(4_900_001))).toBe("4.900001");
    expect(microDoTexto("15.003721")).toBe(BigInt(15_003_721));
    expect(microDoTexto("15")).toBe(BigInt(15_000_000));
    expect(microDoTexto("0.1")).toBe(BigInt(100_000));
  });
});

describe("redes EVM", () => {
  it("USDC da BNB Chain tem 18 casas; as outras 6", () => {
    expect(unidadesDoToken(BigInt(15_003_721), "base")).toBe(
      BigInt(15_003_721),
    );
    expect(unidadesDoToken(BigInt(15_003_721), "bnb")).toBe(
      BigInt("15003721000000000000"),
    );
  });

  it("monta o link EIP-681 com contrato, chainId, carteira e valor", () => {
    process.env.EVM_MERCHANT_WALLET = CARTEIRA;
    expect(linkEip681("base", BigInt(15_003_721))).toBe(
      `ethereum:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453/transfer?address=${CARTEIRA}&uint256=15003721`,
    );
  });

  it("monta a chamada transfer() que a carteira conectada assina, igual à do viem", () => {
    process.env.EVM_MERCHANT_WALLET = CARTEIRA;
    for (const rede of ["base", "bnb"] as const) {
      const micro = BigInt(18_010_000);
      expect(transferenciaUsdc(rede, micro)).toEqual({
        chainId: REDES_EVM[rede].chainId,
        para: REDES_EVM[rede].usdc,
        dados: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [CARTEIRA, unidadesDoToken(micro, rede)],
        }),
      });
    }
  });

  it("só ativa redes com carteira válida e RPC", () => {
    process.env.EVM_MERCHANT_WALLET = "nao-e-endereco";
    process.env.BASE_RPC_URL = "https://rpc";
    expect(redesEvmAtivas()).toEqual([]);
    process.env.EVM_MERCHANT_WALLET = CARTEIRA;
    delete process.env.ETHEREUM_RPC_URL;
    delete process.env.ARBITRUM_RPC_URL;
    delete process.env.BSC_RPC_URL;
    expect(redesEvmAtivas()).toEqual(["base"]);
  });

  it("tira o hash de um link do explorer ou do hash puro", () => {
    const h = "0x" + "ab".repeat(32);
    expect(hashDaTransacao(`https://basescan.org/tx/${h}`)).toBe(h);
    expect(hashDaTransacao(` ${h.toUpperCase().replace("0X", "0x")} `)).toBe(h);
    expect(hashDaTransacao("0x123")).toBeNull();
  });

  it("soma só o USDC enviado para a carteira da NIDO e acha o pagador", () => {
    const topico = (end: string) => "0x" + end.slice(2).padStart(64, "0");
    const valor = (n: bigint) => "0x" + n.toString(16).padStart(64, "0");
    const TRANSFER =
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    const PAGADOR = "0x2222222222222222222222222222222222222222";
    const OUTRO = "0x3333333333333333333333333333333333333333";
    const logs = [
      {
        address: USDC_BASE,
        data: valor(BigInt(39_000_000)),
        topics: [TRANSFER, topico(PAGADOR), topico(CARTEIRA)],
      },
      {
        address: USDC_BASE,
        data: valor(BigInt(5_000_000)),
        topics: [TRANSFER, topico(PAGADOR), topico(OUTRO)],
      },
      {
        address: "0xdead000000000000000000000000000000000000",
        data: valor(BigInt(99_000_000)),
        topics: [TRANSFER, topico(PAGADOR), topico(CARTEIRA)],
      },
    ];
    expect(recebidoNaTransacao(logs, "base", CARTEIRA)).toEqual({
      unidades: BigInt(39_000_000),
      pagador: PAGADOR,
    });
    expect(recebidoNaTransacao(logs.slice(1), "base", CARTEIRA).unidades).toBe(
      BigInt(0),
    );
  });
});

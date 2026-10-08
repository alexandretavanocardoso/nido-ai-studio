import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  erc20Abi,
  fallback,
  http,
  isAddress,
  keccak256,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { REDES_EVM, RPC_PUBLICO, type RedeEvm } from "@/lib/pagamentos/evm";
import type { RedeUsdc } from "@/lib/pagamentos/redes-usdc";

/**
 * Envio de USDC on-chain para pagar saques de comissão: sai da carteira de
 * saques da NIDO (uma carteira quente, separada da que recebe os pagamentos e
 * com pouco saldo) para a carteira do usuário.
 *
 * Env:
 *  - USDC_SAQUE_EVM_PRIVATE_KEY: chave privada (0x…) da carteira de saques nas
 *    redes EVM. Precisa de USDC e da moeda da taxa (ETH, BNB) em cada rede usada.
 *  - USDC_SAQUE_SOLANA_SECRET_KEY: chave secreta da carteira de saques na
 *    Solana, em JSON ([12,34,…], 64 números — o formato do `solana-keygen`).
 *    Precisa de USDC e de SOL para a taxa.
 *  - USDC_SAQUE_TETO: maior saque automático, em USDC (padrão 200).
 *  - USDC_SAQUE_TETO_DIA: soma máxima de saques em 24h, todos os usuários (padrão 1000).
 *
 * A transação é assinada ANTES de ser enviada e o hash dela é guardado antes
 * do envio: se algo cair no meio, dá para conferir na rede se ela saiu.
 */
const USDC_SOLANA = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const mintSolana = () => process.env.SOLANA_USDC_MINT?.trim() || USDC_SOLANA;
const rpcSolana = () =>
  process.env.SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";

/*
 * Token SPL sem a biblioteca @solana/spl-token (ela traz uma dependência com
 * falha conhecida, bigint-buffer): as duas instruções usadas são montadas aqui.
 */
const PROGRAMA_TOKEN = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const PROGRAMA_CONTA_ASSOCIADA = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

/** Endereço da conta de token (associada) de `dono` para o `mint`. */
export function contaDeToken(mint: PublicKey, dono: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [dono.toBuffer(), PROGRAMA_TOKEN.toBuffer(), mint.toBuffer()],
    PROGRAMA_CONTA_ASSOCIADA,
  )[0];
}

/** Cria a conta de token do `dono` se ainda não existir (quem paga é `pagador`). */
export function instrucaoCriarConta(
  pagador: PublicKey,
  conta: PublicKey,
  dono: PublicKey,
  mint: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAMA_CONTA_ASSOCIADA,
    keys: [
      { pubkey: pagador, isSigner: true, isWritable: true },
      { pubkey: conta, isSigner: false, isWritable: true },
      { pubkey: dono, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: PROGRAMA_TOKEN, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]), // CreateIdempotent
  });
}

/** Transferência conferida (TransferChecked): valor em unidades mínimas e casas do token. */
export function instrucaoTransferir(
  origem: PublicKey,
  mint: PublicKey,
  destino: PublicKey,
  dono: PublicKey,
  quantia: bigint,
  decimais: number,
): TransactionInstruction {
  const data = Buffer.alloc(10);
  data.writeUInt8(12, 0); // TransferChecked
  data.writeBigUInt64LE(quantia, 1);
  data.writeUInt8(decimais, 9);
  return new TransactionInstruction({
    programId: PROGRAMA_TOKEN,
    keys: [
      { pubkey: origem, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destino, isSigner: false, isWritable: true },
      { pubkey: dono, isSigner: true, isWritable: false },
    ],
    data,
  });
}

/** Maior saque automático em USDC; acima disso o usuário é mandado ao suporte. */
export function tetoDoSaqueUsdc(): number {
  const n = Number(process.env.USDC_SAQUE_TETO);
  return Number.isFinite(n) && n > 0 ? n : 200;
}

/** Soma máxima de saques em USDC em 24 horas, de todos os usuários (padrão 1000). */
export function tetoDiarioUsdc(): number {
  const n = Number(process.env.USDC_SAQUE_TETO_DIA);
  return Number.isFinite(n) && n > 0 ? n : 1000;
}

function contaEvm() {
  const chave = process.env.USDC_SAQUE_EVM_PRIVATE_KEY?.trim();
  if (!chave || !/^(0x)?[0-9a-fA-F]{64}$/.test(chave)) return null;
  return privateKeyToAccount(
    (chave.startsWith("0x") ? chave : `0x${chave}`) as Hex,
  );
}

function contaSolana(): Keypair | null {
  const bruto = process.env.USDC_SAQUE_SOLANA_SECRET_KEY?.trim();
  if (!bruto) return null;
  try {
    const bytes = JSON.parse(bruto) as number[];
    return Array.isArray(bytes) && bytes.length === 64
      ? Keypair.fromSecretKey(Uint8Array.from(bytes))
      : null;
  } catch {
    return null;
  }
}

/** Redes em que o saque em USDC está ligado (tem chave configurada). */
export function redesDeSaqueUsdc(): RedeUsdc[] {
  const redes: RedeUsdc[] = [];
  if (contaSolana()) redes.push("solana");
  if (contaEvm())
    redes.push(
      ...(Object.keys(REDES_EVM) as RedeEvm[]).filter(
        (r) => !!process.env[REDES_EVM[r].env]?.trim(),
      ),
    );
  return redes;
}

/** O endereço serve para receber nesta rede? */
export function carteiraValida(rede: RedeUsdc, endereco: string): boolean {
  if (rede !== "solana") return isAddress(endereco);
  try {
    return PublicKey.isOnCurve(new PublicKey(endereco).toBytes());
  } catch {
    return false;
  }
}

function clientesEvm(rede: RedeEvm) {
  const c = REDES_EVM[rede];
  const urls = [process.env[c.env]?.trim() ?? "", ...RPC_PUBLICO[rede]].filter(
    (u, i, a) => !!u && a.indexOf(u) === i,
  );
  const chain = defineChain({
    id: c.chainId,
    name: rede,
    nativeCurrency: { name: "Nativa", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: urls } },
  });
  const transport = fallback(urls.map((u) => http(u, { timeout: 15_000 })));
  return { chain, transport, config: c };
}

/** USDC (2 casas) → unidades mínimas do token. */
function unidades(valor: number, decimais: number): bigint {
  return BigInt(Math.round(valor * 100)) * BigInt(10) ** BigInt(decimais - 2);
}

export type EnvioUsdc =
  /** Recusado antes de assinar (sem saldo, sem taxa, simulação falhou): nada saiu. */
  | { ok: false; erro: string }
  /** Assinado: `hash` identifica a transação; `enviar` transmite e espera a confirmação. */
  | {
      ok: true;
      hash: string;
      enviar: () => Promise<"confirmado" | "revertido" | "incerto">;
    };

/**
 * Prepara o envio de `valor` USDC para `destino`: confere saldo, simula e
 * assina. Devolve o hash da transação já assinada e a função que a transmite.
 */
export async function prepararEnvioUsdc(
  rede: RedeUsdc,
  destino: string,
  valor: number,
): Promise<EnvioUsdc> {
  return rede === "solana"
    ? prepararSolana(destino, valor)
    : prepararEvm(rede, destino, valor);
}

async function prepararEvm(
  rede: RedeEvm,
  destino: string,
  valor: number,
): Promise<EnvioUsdc> {
  const conta = contaEvm();
  if (!conta) return { ok: false, erro: "Carteira de saque não configurada." };
  const { chain, transport, config } = clientesEvm(rede);
  const publico = createPublicClient({ chain, transport });
  const carteira = createWalletClient({ account: conta, chain, transport });
  const quantia = unidades(valor, config.decimais);
  const usdc = config.usdc as Hex;

  const saldo = await publico.readContract({
    address: usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [conta.address],
  });
  if (saldo < quantia)
    return { ok: false, erro: "Saldo de USDC insuficiente na carteira de saque." };

  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [destino as Hex, quantia],
  });
  let assinada: Hex;
  try {
    // Estima o gás (falha aqui se a transferência reverteria ou se falta a moeda da taxa).
    const pedido = await carteira.prepareTransactionRequest({
      to: usdc,
      data,
    });
    assinada = await carteira.signTransaction(pedido);
  } catch (e) {
    return {
      ok: false,
      erro: `Não foi possível preparar a transferência: ${(e as Error).message.split("\n")[0]}`,
    };
  }
  const hash = keccak256(assinada);
  return {
    ok: true,
    hash,
    enviar: async () => {
      try {
        await publico.sendRawTransaction({ serializedTransaction: assinada });
        const recibo = await publico.waitForTransactionReceipt({
          hash,
          timeout: 45_000,
        });
        return recibo.status === "success" ? "confirmado" : "revertido";
      } catch (e) {
        console.error("[indicacao] envio EVM", rede, hash, e);
        return "incerto";
      }
    },
  };
}

async function prepararSolana(
  destino: string,
  valor: number,
): Promise<EnvioUsdc> {
  const conta = contaSolana();
  if (!conta) return { ok: false, erro: "Carteira de saque não configurada." };
  const conexao = new Connection(rpcSolana(), "confirmed");
  const mint = new PublicKey(mintSolana());
  const dono = new PublicKey(destino);
  const origem = contaDeToken(mint, conta.publicKey);
  const alvo = contaDeToken(mint, dono);
  const quantia = unidades(valor, 6);

  try {
    const saldo = await conexao.getTokenAccountBalance(origem);
    if (BigInt(saldo.value.amount) < quantia)
      return {
        ok: false,
        erro: "Saldo de USDC insuficiente na carteira de saque.",
      };
  } catch {
    return { ok: false, erro: "A carteira de saque não tem conta de USDC." };
  }

  const { blockhash, lastValidBlockHeight } =
    await conexao.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer: conta.publicKey,
    blockhash,
    lastValidBlockHeight,
  }).add(
    // Cria a conta de USDC do destino se ela ainda não existir (a NIDO paga o aluguel).
    instrucaoCriarConta(conta.publicKey, alvo, dono, mint),
    instrucaoTransferir(origem, mint, alvo, conta.publicKey, quantia, 6),
  );
  tx.sign(conta);
  const simulacao = await conexao.simulateTransaction(tx);
  if (simulacao.value.err)
    return {
      ok: false,
      erro: `Não foi possível preparar a transferência: ${JSON.stringify(simulacao.value.err)}`,
    };

  const assinatura = encodeBase58(tx.signature!);
  return {
    ok: true,
    hash: assinatura,
    enviar: async () => {
      try {
        await conexao.sendRawTransaction(tx.serialize(), {
          skipPreflight: true,
        });
        const r = await conexao.confirmTransaction(
          { signature: assinatura, blockhash, lastValidBlockHeight },
          "confirmed",
        );
        return r.value.err ? "revertido" : "confirmado";
      } catch (e) {
        console.error("[indicacao] envio Solana", assinatura, e);
        return "incerto";
      }
    },
  };
}

const ALFABETO_58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function encodeBase58(bytes: Uint8Array): string {
  let n = BigInt("0x" + (Buffer.from(bytes).toString("hex") || "0"));
  let s = "";
  while (n > BigInt(0)) {
    s = ALFABETO_58[Number(n % BigInt(58))] + s;
    n /= BigInt(58);
  }
  for (const b of bytes) {
    if (b !== 0) break;
    s = "1" + s;
  }
  return s;
}

/**
 * Como está na rede uma transferência já assinada: confirmada, revertida ou
 * ainda sem registro (não chegou, ou ainda não entrou num bloco).
 */
export async function situacaoDoEnvio(
  rede: RedeUsdc,
  hash: string,
): Promise<"confirmado" | "revertido" | "sem_registro"> {
  if (rede === "solana") {
    const conexao = new Connection(rpcSolana(), "confirmed");
    const { value } = await conexao.getSignatureStatuses([hash], {
      searchTransactionHistory: true,
    });
    const s = value[0];
    if (!s) return "sem_registro";
    return s.err ? "revertido" : "confirmado";
  }
  const { chain, transport } = clientesEvm(rede);
  const publico = createPublicClient({ chain, transport });
  try {
    const recibo = await publico.getTransactionReceipt({ hash: hash as Hex });
    return recibo.status === "success" ? "confirmado" : "revertido";
  } catch (e) {
    // Só "recibo não encontrado" quer dizer sem registro; falha do RPC sobe como erro.
    if ((e as Error).name === "TransactionReceiptNotFoundError")
      return "sem_registro";
    throw e;
  }
}

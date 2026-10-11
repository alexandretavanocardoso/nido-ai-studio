import { createPublicKey, verify } from "node:crypto";
import { PublicKey } from "@solana/web3.js";

/**
 * Prova de posse da carteira Solana: o servidor monta uma mensagem com um
 * código de uso único, a carteira assina (não é transação e não custa nada) e
 * o servidor confere a assinatura. Sem banco aqui — quem guarda o desafio e a
 * carteira é lib/nft/carteira-server.ts.
 */

/** O desafio vale isto; depois é preciso pedir outro. */
export const VALIDADE_DESAFIO_MIN = 10;

/**
 * Endereço de carteira válido: 32 bytes e na curva. Endereço fora da curva é
 * de conta de programa (PDA) — ninguém tem a chave, e o NFT ficaria preso.
 */
export function enderecoDeCarteira(endereco: string): boolean {
  try {
    const chave = new PublicKey(endereco.trim());
    return (
      chave.toBase58() === endereco.trim() &&
      PublicKey.isOnCurve(chave.toBytes())
    );
  } catch {
    return false;
  }
}

/**
 * Texto exato que a carteira assina: o site, a carteira e o código de uso
 * único. A conta do app não vai no texto; quem prende o código a ela é o
 * servidor (carteira_desafios.user_id).
 */
export function montarMensagem(o: {
  site: string;
  endereco: string;
  nonce: string;
  emitidoEm: Date;
}): string {
  return [
    `${o.site} quer vincular esta carteira à sua conta no NIDO AI Studio.`,
    "",
    "Isto não é uma transação e não tem custo.",
    "This is not a transaction and costs nothing.",
    "",
    `Carteira: ${o.endereco}`,
    `Código: ${o.nonce}`,
    `Emitido em: ${o.emitidoEm.toISOString()}`,
  ].join("\n");
}

/** Cabeçalho DER de uma chave pública Ed25519 (os 32 bytes da chave vêm depois). */
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");

/** A assinatura (64 bytes) é desta carteira, sobre exatamente esta mensagem? */
export function assinaturaConfere(
  endereco: string,
  mensagem: string,
  assinatura: Uint8Array,
): boolean {
  if (assinatura.length !== 64 || !enderecoDeCarteira(endereco)) return false;
  try {
    const chave = createPublicKey({
      key: Buffer.concat([SPKI_ED25519, new PublicKey(endereco).toBytes()]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(mensagem, "utf8"), chave, assinatura);
  } catch {
    return false;
  }
}

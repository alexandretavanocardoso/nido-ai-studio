import { generateKeyPairSync, sign } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  assinaturaConfere,
  enderecoDeCarteira,
  montarMensagem,
} from "./carteira";

/** Uma carteira de teste: endereço Solana e a função que assina como ela. */
function carteira() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const bruto = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  return {
    endereco: new PublicKey(bruto).toBase58(),
    assinar: (mensagem: string) =>
      new Uint8Array(sign(null, Buffer.from(mensagem, "utf8"), privateKey)),
  };
}

const mensagemDe = (endereco: string, nonce = "codigo-de-uso-unico-123456") =>
  montarMensagem({
    site: "aistudio.nido.global",
    endereco,
    nonce,
    emitidoEm: new Date("2026-10-10T12:00:00Z"),
  });

describe("mensagem do desafio", () => {
  it("leva o site, a carteira, o código e a data, e diz que não é transação", () => {
    const m = mensagemDe("EnderecoDeTeste");
    expect(m).toContain("aistudio.nido.global");
    expect(m).toContain("Carteira: EnderecoDeTeste");
    expect(m).toContain("Código: codigo-de-uso-unico-123456");
    expect(m).toContain("2026-10-10T12:00:00.000Z");
    expect(m).toMatch(/não é uma transação/i);
  });
});

describe("assinaturaConfere", () => {
  it("aceita a assinatura da própria carteira sobre a mensagem exata", () => {
    const c = carteira();
    const m = mensagemDe(c.endereco);
    expect(assinaturaConfere(c.endereco, m, c.assinar(m))).toBe(true);
  });

  it("recusa assinatura de outra carteira (alguém tentando vincular a carteira alheia)", () => {
    const vitima = carteira();
    const atacante = carteira();
    const m = mensagemDe(vitima.endereco);
    expect(assinaturaConfere(vitima.endereco, m, atacante.assinar(m))).toBe(false);
  });

  it("recusa assinatura antiga reaproveitada em outro desafio", () => {
    const c = carteira();
    const antiga = c.assinar(mensagemDe(c.endereco, "codigo-antigo-0000000000"));
    expect(
      assinaturaConfere(c.endereco, mensagemDe(c.endereco, "codigo-novo-11111111111"), antiga),
    ).toBe(false);
  });

  it("recusa mensagem alterada, assinatura cortada e lixo", () => {
    const c = carteira();
    const m = mensagemDe(c.endereco);
    const assinatura = c.assinar(m);
    expect(assinaturaConfere(c.endereco, m + " ", assinatura)).toBe(false);
    expect(assinaturaConfere(c.endereco, m, assinatura.subarray(0, 63))).toBe(false);
    expect(assinaturaConfere(c.endereco, m, new Uint8Array(64))).toBe(false);
    expect(assinaturaConfere("não é endereço", m, assinatura)).toBe(false);
  });
});

describe("enderecoDeCarteira", () => {
  it("aceita endereço de carteira", () => {
    expect(enderecoDeCarteira(carteira().endereco)).toBe(true);
  });

  it("recusa endereço de conta de programa (o NFT ficaria preso)", () => {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("qualquer")],
      new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"),
    );
    expect(enderecoDeCarteira(pda.toBase58())).toBe(false);
  });

  it("recusa texto solto, endereço de outra rede e vazio", () => {
    expect(enderecoDeCarteira("")).toBe(false);
    expect(enderecoDeCarteira("carteira")).toBe(false);
    expect(enderecoDeCarteira("0x52908400098527886E0F7030069857D2E4169EE7")).toBe(false);
  });
});

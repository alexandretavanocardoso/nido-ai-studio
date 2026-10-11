// Coleção dos NFTs de influencer (Metaplex Core, na Solana). Ver lib/nft/.
//
//   node scripts/nft-colecao.mjs chaves
//       Sorteia a chave de mint e a chave de badges e mostra as linhas do .env.
//       Não fala com a rede.
//
//   node scripts/nft-colecao.mjs criar --raiz <endereço>
//       Cria a coleção e mostra a linha NFT_COLECAO. Quem paga é a chave de
//       mint (precisa de SOL). --raiz é a autoridade raiz da coleção: só ela
//       descongela os NFTs e revoga a chave de mint. Use um multisig ou uma
//       carteira fria, NUNCA uma chave que fica no servidor. Na devnet, sem
//       --raiz, a raiz é a própria chave de mint (só para teste).
//
//   node scripts/nft-colecao.mjs conferir
//       Lê a coleção da rede e confere raiz, congelamento, delegação e saldo.
//
// Lê do .env.local: NFT_REDE, NFT_MINT_SECRET_KEY, NFT_BADGE_SECRET_KEY,
// NFT_COLECAO, NFT_RPC_URL (ou SOLANA_RPC_URL) e NFT_BASE_URL (ou BETTER_AUTH_URL).
import { existsSync } from "node:fs";
import {
  createCollection,
  fetchCollection,
  mplCore,
} from "@metaplex-foundation/mpl-core";
import {
  createSignerFromKeypair,
  generateSigner,
  publicKey,
  signerIdentity,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { Keypair } from "@solana/web3.js";

for (const arquivo of [".env.local", ".env"])
  if (existsSync(arquivo)) process.loadEnvFile(arquivo);

const GENESE = {
  mainnet: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
};

const [comando, ...resto] = process.argv.slice(2);
const opcao = (nome) => {
  const i = resto.indexOf(`--${nome}`);
  return i >= 0 ? resto[i + 1] : undefined;
};
const sair = (msg) => {
  console.error(`\n${msg}\n`);
  process.exit(1);
};

function chave(nome) {
  try {
    const bytes = JSON.parse(process.env[nome] ?? "");
    if (Array.isArray(bytes) && bytes.length === 64)
      return Keypair.fromSecretKey(Uint8Array.from(bytes));
  } catch {
    /* cai no erro abaixo */
  }
  return sair(
    `${nome} não está no .env.local (rode "node scripts/nft-colecao.mjs chaves").`,
  );
}

if (comando === "chaves") {
  const mint = Keypair.generate();
  const badge = Keypair.generate();
  console.log(`
# Chave de mint: minta e paga as taxas. Abasteça com SOL este endereço:
#   ${mint.publicKey.toBase58()}
NFT_MINT_SECRET_KEY=${JSON.stringify([...mint.secretKey])}

# Chave de badges: só escreve os badges nos NFTs. Não precisa de saldo.
#   ${badge.publicKey.toBase58()}
NFT_BADGE_SECRET_KEY=${JSON.stringify([...badge.secretKey])}

Guarde as duas linhas no .env.local e na Vercel (como segredo). Quem tem estas
chaves minta NFTs na coleção e escreve badges: não cole em chat nem em issue.
`);
  process.exit(0);
}

if (comando !== "criar" && comando !== "conferir")
  sair("Uso: node scripts/nft-colecao.mjs chaves | criar --raiz <endereço> | conferir");

const rede = process.env.NFT_REDE?.trim().toLowerCase();
if (rede !== "devnet" && rede !== "mainnet")
  sair('Defina NFT_REDE=devnet ou NFT_REDE=mainnet no .env.local.');
const rpc =
  process.env.NFT_RPC_URL?.trim() ||
  (rede === "devnet"
    ? "https://api.devnet.solana.com"
    : process.env.SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com");

const umi = createUmi(rpc).use(mplCore());
const assinante = (kp) =>
  createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSecretKey(kp.secretKey));
const mint = assinante(chave("NFT_MINT_SECRET_KEY"));
const badge = assinante(chave("NFT_BADGE_SECRET_KEY"));
umi.use(signerIdentity(mint));

// O endereço do RPC costuma levar a chave do provedor: nas mensagens vai só o site.
const siteDoRpc = new URL(rpc).host;
let genese;
try {
  genese = await umi.rpc.getGenesisHash();
} catch (e) {
  const motivo = String(e?.message ?? e).split("\n")[0].slice(0, 200);
  sair(
    `O RPC (${siteDoRpc}) recusou a chamada: ${motivo}\n\n` +
      (/origin not allowed/i.test(motivo)
        ? "O provedor só aceita chamadas de sites autorizados (allowlist). Desligue essa restrição no painel dele, ou use outro RPC.\n"
        : "") +
      (process.env.NFT_RPC_URL?.trim() && rede === "devnet"
        ? "Em devnet, basta apagar NFT_RPC_URL do .env: sem ela o script usa o RPC público da devnet."
        : "Confira NFT_RPC_URL (ou SOLANA_RPC_URL) no .env."),
  );
}
if (genese !== GENESE[rede])
  sair(
    `O RPC (${siteDoRpc}) não está na ${rede}. Confira NFT_REDE e NFT_RPC_URL` +
      (rede === "devnet" ? " (em devnet, pode apagar NFT_RPC_URL)." : "."),
  );
const saldo = Number((await umi.rpc.getBalance(mint.publicKey)).basisPoints) / 1e9;
console.log(`Rede: ${rede} · chave de mint ${mint.publicKey} · saldo ${saldo} SOL`);

if (comando === "criar") {
  const base = (
    process.env.NFT_BASE_URL?.trim() || process.env.BETTER_AUTH_URL?.trim() || ""
  ).replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base))
    sair("Defina NFT_BASE_URL (ou BETTER_AUTH_URL) com o endereço público do app.");
  if (rede === "mainnet" && !base.startsWith("https://"))
    sair("Na mainnet o endereço do app fica gravado na coleção: tem de ser https.");
  const raizDada = opcao("raiz");
  if (rede === "mainnet" && !raizDada)
    sair("Na mainnet, informe --raiz <endereço> (multisig ou carteira fria).");
  let raiz;
  try {
    raiz = raizDada ? publicKey(raizDada) : mint.publicKey;
  } catch {
    sair("--raiz não é um endereço Solana válido.");
  }
  if (rede === "mainnet" && (raiz === mint.publicKey || raiz === badge.publicKey))
    sair("A raiz não pode ser uma das chaves que ficam no servidor.");
  if (saldo < 0.01) sair("A chave de mint precisa de pelo menos 0,01 SOL.");

  const colecao = generateSigner(umi);
  console.log(`Criando a coleção ${colecao.publicKey} (raiz ${raiz})…`);
  await createCollection(umi, {
    collection: colecao,
    payer: mint,
    updateAuthority: raiz,
    name: "NIDO Influencers",
    uri: `${base}/api/nft/meta/colecao`,
    plugins: [
      // Soulbound: todo NFT da coleção nasce congelado; só a raiz descongela.
      {
        type: "PermanentFreezeDelegate",
        frozen: true,
        authority: { type: "Address", address: raiz },
      },
      // A chave de mint pode criar NFTs na coleção; a raiz tira quando quiser.
      {
        type: "UpdateDelegate",
        additionalDelegates: [mint.publicKey],
        authority: { type: "UpdateAuthority" },
      },
    ],
  }).sendAndConfirm(umi, { confirm: { commitment: "finalized" } });
  console.log(`
Coleção criada. Ponha no .env.local e na Vercel:

NFT_REDE=${rede}
NFT_COLECAO=${colecao.publicKey}

Depois rode: node scripts/nft-colecao.mjs conferir
`);
  process.exit(0);
}

// conferir
const endereco = process.env.NFT_COLECAO?.trim();
if (!endereco) sair("NFT_COLECAO não está no .env.local.");
const c = await fetchCollection(umi, publicKey(endereco));
const problemas = [];
const congelado = c.permanentFreezeDelegate;
const delegados = c.updateDelegate?.additionalDelegates ?? [];
console.log(`
Coleção:        ${c.publicKey} — "${c.name}"
Metadados:      ${c.uri}
Raiz:           ${c.updateAuthority}
NFTs mintados:  ${c.numMinted} (existentes: ${c.currentSize})
Congelamento:   ${congelado ? `${congelado.frozen ? "ligado" : "DESLIGADO"} · autoridade ${congelado.authority.address ?? congelado.authority.type}` : "AUSENTE"}
Delegados:      ${delegados.join(", ") || "nenhum"}
Chave de badges: ${badge.publicKey}
`);
if (!congelado) problemas.push("A coleção não tem o congelamento (os NFTs seriam transferíveis).");
else if (!congelado.frozen) problemas.push("O congelamento está desligado: os NFTs podem ser transferidos.");
if (!delegados.includes(mint.publicKey))
  problemas.push("A chave de mint não é delegada na coleção: o mint vai falhar.");
if (c.updateAuthority === mint.publicKey || c.updateAuthority === badge.publicKey)
  problemas.push(
    rede === "mainnet"
      ? "A raiz é uma chave do servidor. Na mainnet isso não pode."
      : "A raiz é uma chave do servidor (aceitável só na devnet).",
  );
if (congelado && congelado.authority.type !== "Address")
  problemas.push("O congelamento não está preso ao endereço da raiz: um delegado poderia descongelar.");
else if (congelado && congelado.authority.address !== c.updateAuthority)
  problemas.push(
    `Quem descongela não é a raiz: a autoridade do congelamento é ${congelado.authority.address}. Acontece quando a raiz da coleção é trocada depois: a autoridade do congelamento fica com a antiga.`,
  );
if (mint.publicKey === badge.publicKey)
  problemas.push("A chave de mint e a de badges são a mesma. Cada uma tem de ser uma chave diferente.");
if (saldo < 0.02) problemas.push(`Saldo baixo na chave de mint: ${saldo} SOL.`);
if (problemas.length) {
  console.log("ATENÇÃO:\n" + problemas.map((p) => `  - ${p}`).join("\n") + "\n");
  process.exit(rede === "mainnet" ? 1 : 0);
}
console.log("Tudo certo.\n");

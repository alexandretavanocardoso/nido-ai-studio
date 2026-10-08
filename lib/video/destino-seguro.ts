import { lookup as resolverNome, type LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";

/**
 * Proteção contra SSRF nos downloads que o servidor faz a pedido do usuário
 * (vídeo por link): só http(s), só portas padrão e só endereços públicos — o
 * servidor não pode ser usado para ler serviços internos, o próprio localhost
 * ou o endereço de metadados da nuvem (169.254.169.254).
 *
 * São duas conferências: `exigirDestinoPublico` olha a URL antes (protocolo,
 * porta, IP escrito direto) e `abrirDownloadSeguro` confere o endereço na hora
 * de conectar — o IP conferido é o mesmo em que a conexão é aberta, então um
 * servidor de nomes que troque de resposta no meio não engana.
 */

/** O IP é de rede interna, de loopback, de link local ou reservado? */
export function ipPrivado(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link local / metadados
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 // multicast e reservados
    );
  }
  if (v === 6) {
    const h = ip.toLowerCase();
    // IPv4 embutido (::ffff:10.0.0.1): vale a regra do IPv4.
    const embutido = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (embutido) return ipPrivado(embutido[1]);
    return (
      h === "::" ||
      h === "::1" ||
      h.startsWith("::ffff:") || // IPv4 embutido em hexadecimal
      h.startsWith("64:ff9b:") || // NAT64
      /^f[cd]/.test(h) || // fc00::/7 (rede local)
      /^fe[89ab]/.test(h) || // fe80::/10 (link local)
      h.startsWith("ff") // multicast
    );
  }
  return true; // não é IP: não dá para saber, então não passa
}

/**
 * Confere se a URL pode ser buscada pelo servidor. Lança erro com o motivo se
 * não puder. Resolve o nome e exige que TODOS os endereços sejam públicos.
 */
export async function exigirDestinoPublico(bruta: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(bruta);
  } catch {
    throw new Error("Link inválido.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:")
    throw new Error("Só links http(s) são aceitos.");
  if (u.username || u.password)
    throw new Error("Links com usuário e senha não são aceitos.");
  if (u.port && u.port !== "80" && u.port !== "443")
    throw new Error("Só as portas padrão (80 e 443) são aceitas.");
  // O hostname de IPv6 vem entre colchetes.
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const ips = isIP(host)
    ? [host]
    : (await lookup(host, { all: true }).catch(() => [])).map((r) => r.address);
  if (!ips.length) throw new Error("Não foi possível achar o servidor do link.");
  if (ips.some(ipPrivado))
    throw new Error("Este link aponta para um endereço que não é público.");
  return u;
}

/**
 * Resolução de nome usada na conexão: devolve só endereços públicos. Se o nome
 * apontar para qualquer endereço interno, a conexão não é aberta.
 */
export const resolverSoPublico: LookupFunction = (nome, opcoes, pronto) => {
  resolverNome(nome, { ...opcoes, all: true }, (erro, achados) => {
    if (erro) return pronto(erro, "", 0);
    const lista = achados as LookupAddress[];
    if (!lista.length || lista.some((a) => ipPrivado(a.address)))
      return pronto(
        new Error("Este link aponta para um endereço que não é público."),
        "",
        0,
      );
    if (opcoes.all) pronto(null, lista);
    else pronto(null, lista[0].address, lista[0].family);
  });
};

/**
 * Abre um download (GET) sem seguir redirecionamentos, conectando só a
 * endereço público. Devolve a resposta em fluxo; quem chama decide o que fazer
 * com um 3xx (conferir o destino novo e chamar de novo).
 */
export async function abrirDownloadSeguro(
  bruta: string,
  headers: Record<string, string>,
): Promise<IncomingMessage> {
  const u = await exigirDestinoPublico(bruta);
  return new Promise((ok, falha) => {
    const pedido = (u.protocol === "https:" ? https : http).request(
      u,
      { method: "GET", headers, lookup: resolverSoPublico, timeout: 30_000 },
      ok,
    );
    pedido.on("timeout", () =>
      pedido.destroy(new Error("O servidor do link demorou demais.")),
    );
    pedido.on("error", falha);
    pedido.end();
  });
}

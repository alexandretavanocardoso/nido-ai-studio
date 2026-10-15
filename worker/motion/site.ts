import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Browser, Page } from "playwright-core";
import type { LeituraSite, PapelAsset } from "./tipos";

/**
 * Lê o site do motion num Chrome de verdade (o que o visitante vê, com o
 * JavaScript da página rodando): uma foto do topo no computador e outra no
 * celular, o logo recortado, os títulos, os botões e as cores. O modelo usa
 * as fotos dentro de mockups e as cores na paleta.
 */

export interface CapturaSite {
  papel: PapelAsset;
  imagem: Buffer;
  mime: "image/jpeg" | "image/png";
  largura: number;
  altura: number;
}

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

/** Endereços da rede interna (o worker não pode ser usado para chegar neles). */
function ipInterno(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return ipInterno(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/** Endereço público http(s), ou o motivo de não ser. */
export async function conferirUrl(texto: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(texto) ? texto : `https://${texto}`);
  } catch {
    throw new Error("Endereço do site inválido.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Use um endereço http ou https.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error("Esse endereço não é público.");
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
  if (!ips.length || ips.some(ipInterno)) throw new Error("Esse endereço não é público.");
  return url;
}

/**
 * Títulos, botões e cores da página. Vai como texto (não como função): o tsx
 * acrescenta helpers às funções que não existem dentro da página.
 */
const LER_PAGINA = `(() => {
  const texto = (el) => (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
  const unicos = (l, n, max) => [...new Set(l.filter(Boolean).map((s) => s.slice(0, max)))].slice(0, n);
  const meta = (sel) => (document.querySelector(sel)?.getAttribute("content") || "").trim();
  const hex = (cor) => {
    const m = cor.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?/);
    if (!m || (m[4] !== undefined && Number(m[4]) < 0.5)) return "";
    return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
  };
  const estilo = (sel, prop) => {
    const el = document.querySelector(sel);
    return el ? hex(getComputedStyle(el)[prop]) : "";
  };
  const botao = "button, a[class*='btn' i], a[class*='button' i], [role='button']";
  return {
    titulo: document.title.trim().slice(0, 150),
    descricao: (meta('meta[name="description"]') || meta('meta[property="og:description"]')).slice(0, 300),
    textos: unicos(Array.from(document.querySelectorAll("h1, h2, h3")).map(texto), 12, 120),
    botoes: unicos(Array.from(document.querySelectorAll(botao)).map(texto).filter((t) => t.length >= 2 && t.length <= 40), 10, 40),
    cores: unicos([
      estilo("body", "backgroundColor"),
      estilo("header, nav", "backgroundColor"),
      estilo("h1", "color"),
      estilo(botao, "backgroundColor"),
      estilo(botao, "color"),
      estilo("a", "color"),
    ], 6, 7),
  };
})()`;

/** Fecha avisos de cookies que cobririam a foto (melhor-esforço). */
async function aceitarCookies(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /aceitar|aceito|accept|agree|concordo|permitir todos|allow all/i })
    .first()
    .click({ timeout: 1500 })
    .catch(() => {});
}

async function abrir(page: Page, url: URL): Promise<void> {
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  await aceitarCookies(page);
  await page.waitForTimeout(800);
}

export async function lerSite(
  navegador: Browser,
  endereco: string,
): Promise<{ leitura: LeituraSite; capturas: CapturaSite[] }> {
  const url = await conferirUrl(endereco);
  const capturas: CapturaSite[] = [];

  const computador = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
  let leitura: LeituraSite;
  try {
    const page = await computador.newPage();
    await abrir(page, url);
    capturas.push({
      papel: "site-desktop",
      imagem: await page.screenshot({ type: "jpeg", quality: 85 }),
      mime: "image/jpeg",
      largura: 1440,
      altura: 900,
    });
    const lido = (await page.evaluate(LER_PAGINA)) as Omit<LeituraSite, "url">;
    leitura = { url: url.toString(), ...lido };

    // Logo: a imagem (ou o SVG) com "logo" no nome, de preferência no topo.
    const logo = await page.$(
      [
        "header img[src*='logo' i]",
        "header img[alt*='logo' i]",
        "header [class*='logo' i] img",
        "header svg[class*='logo' i]",
        "a[class*='logo' i] img",
        "a[class*='logo' i] svg",
        "[class*='logo' i] svg",
        "img[src*='logo' i]",
      ].join(", "),
    );
    const caixa = await logo?.boundingBox();
    if (logo && caixa && caixa.width >= 30 && caixa.width <= 700 && caixa.height >= 14 && caixa.height <= 300) {
      const imagem = await logo.screenshot({ type: "png", omitBackground: true }).catch(() => null);
      if (imagem)
        capturas.push({
          papel: "logo",
          imagem,
          mime: "image/png",
          largura: Math.round(caixa.width),
          altura: Math.round(caixa.height),
        });
    }
  } finally {
    await computador.close();
  }

  const celular = await navegador.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: IPHONE,
    locale: "pt-BR",
  });
  try {
    const page = await celular.newPage();
    await abrir(page, url);
    capturas.push({
      papel: "site-celular",
      imagem: await page.screenshot({ type: "jpeg", quality: 85 }),
      mime: "image/jpeg",
      largura: 780,
      altura: 1688,
    });
  } catch (e) {
    // A versão de celular é um extra: sem ela, segue com a do computador.
    console.warn("[motion] foto do site no celular falhou:", (e as Error).message);
  } finally {
    await celular.close();
  }
  return { leitura, capturas };
}

import { LinkError, tokenApify } from "@/lib/video/link";
import {
  detectarRedeDoLink,
  lerMetricasDoItem,
  lerPaginaLinkedIn,
  type LeituraDoLink,
} from "./link-metricas";
import type { Rede } from "./redes";

/**
 * Lê as métricas públicas de um post pelo link, com os "actors" do Apify
 * (LinkedIn: primeiro a página pública do post, sem Apify).
 * Só enxerga o que qualquer visitante vê: impressões privadas (LinkedIn,
 * alcance do Instagram) não entram.
 *
 * Actors configuráveis por env: APIFY_METRICAS_TIKTOK, _INSTAGRAM, _YOUTUBE,
 * _TWITTER e _LINKEDIN.
 */
const ATORES: Record<Rede, string> = {
  TIKTOK: "clockworks/tiktok-scraper",
  INSTAGRAM: "apify/instagram-scraper",
  YOUTUBE: "streamers/youtube-scraper",
  TWITTER: "apidojo/tweet-scraper",
  LINKEDIN: "supreme_coder/linkedin-post",
};

function entrada(rede: Rede, url: string): Record<string, unknown> {
  if (rede === "TIKTOK") return { postURLs: [url], resultsPerPage: 1, shouldDownloadVideos: false };
  if (rede === "INSTAGRAM") return { directUrls: [url], resultsType: "posts", resultsLimit: 1 };
  if (rede === "YOUTUBE") return { startUrls: [{ url }], maxResults: 1 };
  if (rede === "TWITTER") return { startUrls: [url], maxItems: 1 };
  return { urls: [url], limitPerSource: 1, deepScrape: true, numComments: 0, numLikes: 0 };
}

/**
 * LinkedIn: a página pública do post já traz reações, comentários e data, sem
 * Apify. Só segue redirecionamento dentro do próprio LinkedIn (o lnkd.in aponta
 * pro post). null = não deu (bloqueio, tela de login): cai no actor.
 */
async function lerLinkedInDireto(url: string): Promise<LeituraDoLink | null> {
  let atual = url;
  try {
    for (let salto = 0; salto < 5; salto++) {
      const host = new URL(atual).hostname;
      if (host !== "lnkd.in" && !/(^|\.)linkedin\.com$/.test(host)) return null;
      const res = await fetch(atual, {
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          "Accept-Language": "en",
        },
      });
      const para = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && para) {
        atual = new URL(para, atual).toString();
        continue;
      }
      return res.ok ? lerPaginaLinkedIn(await res.text()) : null;
    }
  } catch (e) {
    console.error("[link-metricas] linkedin", e);
  }
  return null;
}

export async function metricasDoLink(url: string): Promise<LeituraDoLink & { rede: Rede }> {
  const rede = detectarRedeDoLink(url);
  if (!rede)
    throw new LinkError(
      "Link não suportado. Use o link do post no Instagram, TikTok, YouTube, X ou LinkedIn.",
    );
  if (rede === "LINKEDIN") {
    const direto = await lerLinkedInDireto(url);
    if (direto) return { rede, ...direto };
  }
  const token = tokenApify();
  if (!token) throw new LinkError("Busca por link não configurada (APIFY_TOKEN).");
  const ator = (process.env[`APIFY_METRICAS_${rede}`]?.trim() || ATORES[rede]).replace("/", "~");
  const res = await fetch(
    `https://api.apify.com/v2/acts/${ator}/run-sync-get-dataset-items?timeout=100&clean=true`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(entrada(rede, url)),
    },
  );
  if (!res.ok) {
    console.error("[link-metricas] apify", rede, res.status, (await res.text().catch(() => "")).slice(0, 300));
    if (res.status === 402) throw new LinkError("Sem créditos no Apify.");
    if (res.status === 408) throw new LinkError("A leitura do post demorou demais. Tente de novo.");
    throw new LinkError(`Não consegui ler o post (Apify HTTP ${res.status}).`);
  }
  const itens = (await res.json()) as Array<Record<string, unknown>>;
  const item = itens.find((i) => !i.error && !i.errorDescription && !i.noResults);
  if (!item) throw new LinkError("Não achei o post nesse link (ele é público?).");
  return { rede, ...lerMetricasDoItem(item) };
}

/**
 * Identidade de um post a partir do link, para saber se dois links são o mesmo
 * post: o que o usuário enviou numa campanha do Nido e o que está registrado
 * aqui no Studio. Os endereços variam (www, m., parâmetros de rastreio,
 * youtu.be × youtube.com, twitter.com × x.com), então a comparação é pelo id
 * do post na rede; sem id reconhecido, pelo endereço sem o que não importa.
 */
export function chaveDoLink(bruto: string | null | undefined): string | null {
  const texto = (bruto ?? "").trim();
  if (!texto) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(texto) ? texto : `https://${texto}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile|vm|vt)\./, "");
  const partes = u.pathname.split("/").filter(Boolean);

  if (host === "youtu.be" && partes[0]) return `youtube:${partes[0]}`;
  if (host.endsWith("youtube.com")) {
    const v = u.searchParams.get("v");
    if (v) return `youtube:${v}`;
    if (["shorts", "embed", "live"].includes(partes[0]) && partes[1])
      return `youtube:${partes[1]}`;
  }
  if (host.endsWith("tiktok.com")) {
    const i = partes.findIndex((p) => p === "video" || p === "photo");
    if (i >= 0 && partes[i + 1]) return `tiktok:${partes[i + 1]}`;
  }
  if (host.endsWith("instagram.com")) {
    const i = partes.findIndex((p) => ["reel", "reels", "p", "tv"].includes(p));
    if (i >= 0 && partes[i + 1]) return `instagram:${partes[i + 1]}`;
  }
  if (host === "x.com" || host.endsWith("twitter.com")) {
    const i = partes.findIndex((p) => p === "status" || p === "statuses");
    if (i >= 0 && partes[i + 1]) return `x:${partes[i + 1]}`;
  }
  if (host.endsWith("linkedin.com")) {
    const id = u.pathname.match(/(\d{15,})/)?.[1];
    if (id) return `linkedin:${id}`;
  }
  // Rede não reconhecida (ou link curto): o endereço, sem parâmetros nem barra no fim.
  return `${host}/${partes.join("/")}`.toLowerCase();
}

/** Personagem de cada post do Studio, pela chave do link. */
export type PostsPorChave = Map<string, string>;

/**
 * De qual personagem é a campanha: a escolha manual do usuário manda; sem
 * ela, vale o personagem dos posts do Studio que foram enviados na campanha
 * (o que tiver mais links; em empate, o primeiro que aparecer).
 */
export function personagemDaCampanha(o: {
  links: string[];
  posts: PostsPorChave;
  manual?: string | null;
  /** Personagens que ainda existem na conta (escolha de um apagado não vale). */
  existentes?: Set<string>;
}): { characterId: string | null; vinculo: "manual" | "link" | null } {
  const existe = (id: string) => !o.existentes || o.existentes.has(id);
  if (o.manual && existe(o.manual))
    return { characterId: o.manual, vinculo: "manual" };
  const votos = new Map<string, number>();
  for (const link of o.links) {
    const chave = chaveDoLink(link);
    const id = chave ? o.posts.get(chave) : undefined;
    if (id && existe(id)) votos.set(id, (votos.get(id) ?? 0) + 1);
  }
  let melhor: string | null = null;
  for (const [id, n] of votos)
    if (!melhor || n > (votos.get(melhor) ?? 0)) melhor = id;
  return { characterId: melhor, vinculo: melhor ? "link" : null };
}

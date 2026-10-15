import { PLUGINS_GSAP, GSAP_VERSAO } from "./runtime";
import { FPS_MOTION, FORMATOS_MOTION, type AssetMotion, type InputMotion, type TipoMotion } from "./tipos";

/**
 * O pedido ao modelo que escreve o motion. Sem dependências: o worker monta
 * as partes (texto e imagens) e o módulo de IA traduz para cada provedor.
 */

/** Parte da mensagem do usuário: texto ou imagem (base64). */
export type ParteMotion =
  | { tipo: "texto"; texto: string }
  | { tipo: "imagem"; mime: "image/jpeg" | "image/png"; base64: string };

export function sistemaMotion(o: { largura: number; altura: number; duracao: number }): string {
  const vertical = o.altura > o.largura;
  return `You are a senior motion designer who also writes production-grade front-end code. You create short promotional motion-graphics videos as ONE self-contained HTML document. The document is shown in a browser and also rendered frame by frame (${FPS_MOTION} fps) into an MP4.

# Output
Return ONLY the complete HTML document, from <!doctype html> to </html>. No explanation before or after, no markdown fences.

# Stage
- The video is exactly ${o.largura}×${o.altura} px and ${o.duracao} seconds long. <html> and <body> are already set to that size with margin 0 and overflow hidden. Lay everything out in px for this stage — no vw/vh units, no media queries, no responsive layout.
- Give the body a background. Something meaningful is on screen in every frame, from 0s to ${o.duracao}s; the last ~1.5s holds the final frame (brand/product and call to action), fully visible and still enough to read.

# Runtime (already loaded before your code — do NOT add these scripts yourself)
- GSAP ${GSAP_VERSAO} as the global \`gsap\`, with these plugins registered: ${PLUGINS_GSAP.join(", ")}.
- The global \`motion\`, which is the clock of the video:
  - \`motion.build(() => { ... })\`: put ALL animation code inside ONE call. It runs once, after fonts and images have loaded. Build everything synchronously inside it (no awaits, no timers).
  - \`motion.timeline()\`: returns the master GSAP timeline (paused — the renderer seeks it). Put every tween on it (or on timelines nested in it) at absolute positions, e.g. \`tl.from(".title", { yPercent: 100, duration: 0.8, ease: "expo.out" }, 0.4)\`. Its total length should match ${o.duracao}s.
  - \`motion.onFrame((t) => { ... })\`: for anything procedural (canvas drawing, particles, counters driven by math). Called with the time in seconds for every frame, in any order; draw the exact state for that time from \`t\` alone.
  - \`motion.width\`, \`motion.height\`, \`motion.duration\`.
- Time only moves through the master timeline and onFrame. Never use requestAnimationFrame, setTimeout, setInterval, Date, performance.now, CSS transitions, video/audio elements, fetch or tweens outside the master timeline: the renderer jumps to arbitrary times and those would break. CSS @keyframes are allowed only for infinite loops that start at page load (the renderer seeks them too). Math.random is seeded and repeatable. With SplitText, split once inside build (no autoSplit / onSplit).

# Images
- Use only the images listed by the client, as \`asset://<id>\` URLs: <img src="asset://a1"> or CSS url(asset://a1). Never invent other image URLs or use stock photos.
- The real product, person or website is the hero: show the images themselves, never redraw them with CSS or SVG. Transparent PNG cut-outs can float over your own backgrounds (drop shadows, reflections, light rays, depth). Photos with a background need a frame: rounded cards, masks, circles, device mockups (draw the phone/laptop frame yourself), split screens. Website screenshots look best inside a device mockup with a slow scroll or zoom.
- Fonts: load Google Fonts with <link> tags. Icons and illustrations: inline SVG written by you.

# Craft
- Think like an editor: a hook in the first 1.5s, a development with 3–6 distinct beats (each scene changes layout, scale or camera), and a payoff with the call to action.
- Real motion design: eases with character (expo, power4, back, custom), overlapping action, staggered text reveals (SplitText by words or chars, mask reveals), parallax layers, scale and camera moves, kinetic typography, transitions between beats (wipes, masks, zooms, morphs). Vary how things enter; keep a steady rhythm.
- Typography: big and legible on a phone, strong hierarchy, at most ~8 words on screen at once.${vertical ? " Keep key text out of the top 10% and the bottom 18% (social apps cover them) and 6% from the sides." : " Keep key text 6% away from every edge."}
- Copy: on-screen text in the language of the client's brief. Short, concrete, specific to this product/site/person — no lorem ipsum, no invented brands, prices or claims the client didn't give.
- Colour: take the palette from the images (product colours, the site's brand colours) and keep text contrast high.
- Avoid generic AI looks: no purple-to-blue gradient backgrounds, no glassmorphism cards everywhere, no "01 / 02 / 03" labels, no emoji, no fake dashboards, no lens flares unless asked.
- Performance: keep the DOM light (under ~400 elements); animate transforms and opacity; avoid animating blur filters on large areas.`;
}

const DESCRICAO_PAPEL: Record<AssetMotion["papel"], string> = {
  produto: "product photo",
  "produto-recorte": "product cut-out (transparent PNG)",
  influencer: "photo of the influencer",
  "influencer-recorte": "influencer cut-out (transparent PNG)",
  "site-desktop": "website screenshot, desktop, top of the page",
  "site-celular": "website screenshot, mobile, top of the page",
  logo: "logo taken from the website (transparent PNG)",
};

const TIPO: Record<TipoMotion, string> = {
  site: "Promote a website",
  produto: "Promote a product",
  influencer: "Present an AI influencer",
  misto: "The AI influencer presenting a product and/or website",
};

/**
 * A mensagem do usuário: o pedido, o que se sabe do produto/site/pessoa e as
 * imagens, cada uma antecedida do seu `asset://`. `imagens` vem na ordem de
 * `input.assets` (o worker já reduziu cada uma).
 */
export function pedidoMotion(
  input: InputMotion,
  tipo: TipoMotion,
  imagens: Array<{ asset: AssetMotion; mime: "image/jpeg" | "image/png"; base64: string }>,
  htmlBase?: string,
): ParteMotion[] {
  const { largura, altura } = FORMATOS_MOTION[input.formato];
  const linhas: string[] = [];
  if (input.ajuste && htmlBase) {
    linhas.push(
      "Here is the current motion HTML (asset:// URLs and the runtime work as described):",
      htmlBase,
      "",
      `Change requested by the client: ${input.ajuste.pedido}`,
      "Apply the change and return the complete updated HTML document. Keep everything the client did not ask to change.",
      "",
      "Context of the original request:",
    );
  }
  linhas.push(
    `Goal: ${TIPO[tipo]}.`,
    `Format: ${largura}×${altura} (${input.formato}), ${input.duracao} seconds.`,
    `Client's brief: ${input.brief || "(none — decide the story from the material below)"}`,
  );
  if (input.produto)
    linhas.push(
      `Product: ${input.produto.nome}${input.produto.descricao ? ` — ${input.produto.descricao}` : ""}`,
    );
  if (input.influencer)
    linhas.push(
      `Influencer: ${input.influencer.nome}${input.influencer.descricao ? ` — ${input.influencer.descricao}` : ""}`,
    );
  const l = input.site?.leitura;
  if (l) {
    linhas.push(
      `Website: ${l.url}`,
      l.titulo ? `- Title: ${l.titulo}` : "",
      l.descricao ? `- Description: ${l.descricao}` : "",
      l.textos.length ? `- Headings: ${l.textos.join(" | ")}` : "",
      l.botoes.length ? `- Buttons / calls to action: ${l.botoes.join(" | ")}` : "",
      l.cores.length ? `- Colours used on the site: ${l.cores.join(", ")}` : "",
    );
  } else if (input.site) {
    linhas.push(`Website: ${input.site.url} (could not be read; use the brief).`);
  }
  linhas.push(
    "",
    imagens.length
      ? "Images you can use (each one follows its id):"
      : "No images were given: build the video with typography, shapes and SVG.",
  );

  const partes: ParteMotion[] = [{ tipo: "texto", texto: linhas.filter((x) => x !== "").join("\n") }];
  for (const img of imagens) {
    const a = img.asset;
    partes.push({
      tipo: "texto",
      texto: `asset://${a.id} — ${DESCRICAO_PAPEL[a.papel]}${a.largura && a.altura ? `, ${a.largura}×${a.altura}px` : ""}`,
    });
    partes.push({ tipo: "imagem", mime: img.mime, base64: img.base64 });
  }
  return partes;
}

/** Pedido de correção quando o HTML gerado quebra ao carregar. */
export function pedidoCorrecao(html: string, erro: string): ParteMotion[] {
  return [
    {
      tipo: "texto",
      texto: [
        "This motion HTML throws an error when it loads in the browser:",
        erro,
        "",
        html,
        "",
        "Fix the error and return the complete corrected HTML document. Keep the design and the animation as they are.",
      ].join("\n"),
    },
  ];
}

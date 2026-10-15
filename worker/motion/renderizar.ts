import { spawn } from "node:child_process";
import type { Browser, Page } from "playwright-core";

/**
 * Grava o motion em MP4: abre o HTML (já montado no modo "render") num Chrome
 * do tamanho do vídeo, pula o relógio para cada quadro, tira a foto e manda
 * para o ffmpeg. Como cada quadro é desenhado no instante exato, o vídeo sai
 * igual à prévia, sem engasgos, mesmo que o Chrome seja lento.
 */

/**
 * O HTML foi escrito por um modelo (que pode ter lido um site malicioso): na
 * página dele, só a CDN do GSAP, o Google Fonts e as imagens do S3. O resto é
 * bloqueado — nada de buscar endereços internos e mostrar no vídeo.
 */
const PERMITIDOS = /^(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|[a-z0-9.-]+\.amazonaws\.com)$/i;

async function limitarRede(page: Page): Promise<void> {
  await page.route("**/*", (r) => {
    const url = new URL(r.request().url());
    return url.protocol === "https:" && PERMITIDOS.test(url.hostname) ? r.fallback() : r.abort();
  });
}

/** Espera o relógio ficar pronto (fontes, imagens, animação montada) ou falhar. */
async function carregar(page: Page, html: string, limiteMs: number): Promise<string | null> {
  await limitarRede(page);
  await page.setContent(html, { waitUntil: "load", timeout: limiteMs });
  await page.waitForFunction("window.__motionPronto === true || !!window.__motionErro", undefined, {
    timeout: limiteMs,
  });
  return (await page.evaluate("window.__motionErro || null")) as string | null;
}

/**
 * Teste rápido do HTML gerado: carrega e passa por alguns instantes. Devolve
 * o erro (para o modelo corrigir) ou null.
 */
export async function testarHtml(
  navegador: Browser,
  html: string,
  o: { largura: number; altura: number; duracao: number },
): Promise<string | null> {
  const page = await navegador.newPage({ viewport: { width: o.largura, height: o.altura } });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(e.message));
  try {
    const erro = await carregar(page, html, 45_000);
    if (erro) return erro;
    for (const t of [0, o.duracao * 0.33, o.duracao * 0.66, o.duracao - 0.05])
      await page.evaluate(`window.motion.seek(${t})`);
    return ((await page.evaluate("window.__motionErro || null")) as string | null) ?? erros[0] ?? null;
  } catch (e) {
    return erros[0] ?? `A página não terminou de carregar: ${(e as Error).message.split("\n")[0]}`;
  } finally {
    await page.close();
  }
}

/**
 * Música de fundo no MP4 gravado (o motion não tem som próprio): repete se
 * for curta, entra e sai em fade. O vídeo é copiado sem reprocessar.
 */
export async function colocarMusica(o: {
  ffmpeg: string;
  video: string;
  musica: string;
  saida: string;
  duracao: number;
}): Promise<void> {
  const d = Math.max(1, o.duracao);
  const fade = Math.min(1.5, d / 4);
  const filtro =
    `[1:a]aresample=48000,atrim=0:${d.toFixed(3)},asetpts=PTS-STARTPTS,` +
    `afade=t=in:st=0:d=0.4,afade=t=out:st=${(d - fade).toFixed(3)}:d=${fade.toFixed(3)},volume=0.9[a]`;
  await new Promise<void>((ok, falha) => {
    const ff = spawn(
      o.ffmpeg,
      ["-y", "-loglevel", "error", "-i", o.video, "-stream_loop", "-1", "-i", o.musica, "-filter_complex", filtro,
        "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", d.toFixed(3),
        "-movflags", "+faststart", o.saida],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    ff.stderr.on("data", (x) => (stderr = (stderr + String(x)).slice(-2000)));
    ff.on("error", falha);
    ff.on("close", (code) => (code === 0 ? ok() : falha(new Error(`ffmpeg (música) falhou (${code}): ${stderr.trim()}`))));
  });
}

/** Fotos do motion nos instantes pedidos (para a revisão visual). */
export async function fotografar(
  navegador: Browser,
  html: string,
  o: { largura: number; altura: number; tempos: number[] },
): Promise<Array<{ t: number; imagem: Buffer }>> {
  const page = await navegador.newPage({ viewport: { width: o.largura, height: o.altura } });
  try {
    const erro = await carregar(page, html, 45_000);
    if (erro) throw new Error(erro);
    const fotos: Array<{ t: number; imagem: Buffer }> = [];
    for (const t of o.tempos) {
      await page.evaluate(`(window.motion.seek(${t}), new Promise((ok) => requestAnimationFrame(() => ok(null))))`);
      fotos.push({ t, imagem: await page.screenshot({ type: "jpeg", quality: 80 }) });
    }
    return fotos;
  } finally {
    await page.close();
  }
}

export async function gravar(o: {
  navegador: Browser;
  ffmpeg: string;
  html: string;
  largura: number;
  altura: number;
  duracao: number;
  fps: number;
  saida: string;
  /** Chamado de tempos em tempos com os quadros gravados. */
  aoGravar: (quadro: number, total: number) => Promise<void> | void;
}): Promise<void> {
  const page = await o.navegador.newPage({ viewport: { width: o.largura, height: o.altura } });
  try {
    const erro = await carregar(page, o.html, 90_000);
    if (erro) throw new Error(`A animação falhou ao carregar: ${erro}`);

    const total = Math.round(o.duracao * o.fps);
    const ff = spawn(
      o.ffmpeg,
      [
        "-y",
        "-loglevel", "error",
        "-f", "image2pipe",
        "-framerate", String(o.fps),
        "-c:v", "mjpeg",
        "-i", "-",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        // Lados pares (o H.264 em yuv420p exige).
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-r", String(o.fps),
        "-movflags", "+faststart",
        o.saida,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let stderr = "";
    ff.stderr.on("data", (d) => (stderr = (stderr + String(d)).slice(-2000)));
    // Se o ffmpeg cair, a escrita falha aqui e o motivo aparece no fim (código de saída).
    ff.stdin.on("error", () => {});
    const terminou = new Promise<void>((ok, falha) => {
      ff.on("error", falha);
      ff.on("close", (code) => (code === 0 ? ok() : falha(new Error(`ffmpeg falhou (${code}): ${stderr.trim()}`))));
    });
    terminou.catch(() => {}); // o erro aparece no await do fim

    let aviso = Date.now();
    for (let i = 0; i < total; i++) {
      // Pula para o instante do quadro e espera o Chrome desenhar antes da foto.
      await page.evaluate(
        `(window.motion.seek(${i / o.fps}), new Promise((ok) => requestAnimationFrame(() => ok(null))))`,
      );
      const foto = await page.screenshot({ type: "jpeg", quality: 92 });
      if (!ff.stdin.write(foto)) await new Promise((ok) => ff.stdin.once("drain", ok));
      if (Date.now() - aviso > 3000) {
        aviso = Date.now();
        await o.aoGravar(i + 1, total);
      }
    }
    const erroNoMeio = (await page.evaluate("window.__motionErro || null")) as string | null;
    ff.stdin.end();
    await terminou;
    if (erroNoMeio) console.warn("[motion] erro durante a gravação (vídeo gravado mesmo assim):", erroNoMeio);
    await o.aoGravar(total, total);
  } finally {
    await page.close();
  }
}

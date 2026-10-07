import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

/**
 * ffmpeg no servidor (binário do pacote ffmpeg-static; FFMPEG_PATH sobrescreve).
 * Usado pra editar legendas "queimadas" no vídeo: remover (delogo) ou trocar
 * (delogo + texto novo com a fonte do app).
 */
function ffmpegPath(): string {
  const p =
    process.env.FFMPEG_PATH || (ffmpegStatic as unknown as string | null);
  if (!p) throw new Error("ffmpeg não encontrado neste ambiente.");
  return p;
}

const FONT = path.join(process.cwd(), "assets", "fonts", "Poppins-Bold.ttf");

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), ["-hide_banner", ...args]);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0
        ? resolve(stderr)
        : reject(new Error(`ffmpeg falhou (${code}): ${stderr.slice(-500)}`)),
    );
  });
}

export interface VideoInfo {
  largura: number;
  altura: number;
  duracao: number;
  /** Quadros por segundo (30 se não der pra ler). */
  fps: number;
}

/** Lê duração e dimensões do vídeo (sem ffprobe: ffmpeg decodifica 0 frames). */
export async function probe(arquivo: string): Promise<VideoInfo> {
  const err = await run([
    "-i",
    arquivo,
    "-map",
    "0:v:0",
    "-frames:v",
    "0",
    "-f",
    "null",
    "-",
  ]);
  const d = err.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  const v = err.match(/Video: .*?(\d{2,5})x(\d{2,5})/);
  if (!d || !v) throw new Error("Não consegui ler o vídeo.");
  const rot = /rotation of -?90|rotate\s*:\s*-?90/.test(err);
  const [w, h] = [Number(v[1]), Number(v[2])];
  const fps = Number(err.match(/(\d+(?:\.\d+)?) fps/)?.[1] ?? 30);
  return {
    duracao: Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]),
    largura: rot ? h : w,
    altura: rot ? w : h,
    fps: fps > 0 && fps <= 120 ? fps : 30,
  };
}

/** Retângulo em frações do quadro (0–1), como o usuário marca na tela. */
export interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Converte a caixa pra pixels, dentro do quadro (o delogo exige 1px de margem). */
export function caixaEmPixels(c: Caixa, largura: number, altura: number) {
  const x = Math.max(1, Math.round(c.x * largura));
  const y = Math.max(1, Math.round(c.y * altura));
  const w = Math.max(4, Math.min(Math.round(c.w * largura), largura - x - 1));
  const h = Math.max(4, Math.min(Math.round(c.h * altura), altura - y - 1));
  return { x, y, w, h };
}

/** Quebra o texto em linhas que caibam em `maxChars`. */
export function quebrarLinhas(texto: string, maxChars: number): string {
  const linhas: string[] = [];
  for (const paragrafo of texto.trim().split(/\r?\n/)) {
    let atual = "";
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      if (atual && (atual + " " + palavra).length > maxChars) {
        linhas.push(atual);
        atual = palavra;
      } else {
        atual = atual ? `${atual} ${palavra}` : palavra;
      }
    }
    if (atual) linhas.push(atual);
  }
  return linhas.join("\n");
}

/** Escapa um caminho pra usar como valor de opção num filtro do ffmpeg. */
function caminhoFiltro(p: string): string {
  return `'${p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'")}'`;
}

interface EditarLegenda {
  entrada: string;
  saida: string;
  /** Pasta temporária pra arquivos auxiliares (texto da legenda). */
  tmpDir: string;
  info: VideoInfo;
  caixa: Caixa;
  modo: "remover" | "trocar";
  texto?: string;
}

/**
 * Remove a legenda da área marcada (delogo reconstrói a partir dos pixels
 * vizinhos) e, no modo "trocar", escreve o texto novo centralizado no
 * mesmo lugar, em branco com contorno preto (estilo legenda de Reels/TikTok).
 */
export async function editarLegenda(o: EditarLegenda): Promise<void> {
  const { largura, altura } = o.info;
  const px = caixaEmPixels(o.caixa, largura, altura);
  const filtros = [`delogo=x=${px.x}:y=${px.y}:w=${px.w}:h=${px.h}`];

  if (o.modo === "trocar" && o.texto?.trim()) {
    filtros.push(...(await filtrosTexto(o.texto, o.info, px, o.tmpDir)));
  }

  await run([
    "-y",
    "-i",
    o.entrada,
    "-vf",
    filtros.join(","),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    o.saida,
  ]);
}

/**
 * Filtros drawtext da legenda nova: centralizada na área marcada, branca com
 * contorno preto, quebrando linha sozinha. Um drawtext por linha, cada uma
 * centralizada (text_align só existe no ffmpeg ≥ 6.1).
 */
async function filtrosTexto(
  texto: string,
  info: VideoInfo,
  px: { x: number; y: number; w: number; h: number },
  tmpDir: string,
): Promise<string[]> {
  const fontsize = Math.round(info.largura * 0.062);
  const maxChars = Math.max(
    8,
    Math.floor((info.largura * 0.88) / (fontsize * 0.58)),
  );
  const linhas = quebrarLinhas(texto, maxChars).split("\n");
  const alturaLinha = Math.round(fontsize * 1.25);
  const topo = px.y + px.h / 2 - (linhas.length * alturaLinha) / 2;
  const filtros: string[] = [];
  for (const [i, linha] of linhas.entries()) {
    const textfile = path.join(tmpDir, `legenda-${i}.txt`);
    await writeFile(textfile, linha, "utf8");
    filtros.push(
      [
        `drawtext=fontfile=${caminhoFiltro(FONT)}`,
        `textfile=${caminhoFiltro(textfile)}`,
        `fontsize=${fontsize}`,
        "fontcolor=white",
        `borderw=${Math.max(2, Math.round(fontsize / 11))}`,
        "bordercolor=black",
        "x=(w-text_w)/2",
        `y=${Math.round(topo + i * alturaLinha)}`,
      ].join(":"),
    );
  }
  return filtros;
}

/* ------------------------------------------------------------------ */
/* Remoção de legenda com IA (Bria Video Eraser, trechos de até 5s)     */
/* ------------------------------------------------------------------ */

/** Duração de cada trecho enviado à IA (o Bria aceita até 5s). */
export const TRECHO_IA_SEGUNDOS = 4.8;

/** Início e duração de cada trecho para cobrir o vídeo inteiro. */
export function trechos(
  duracao: number,
  tamanho = TRECHO_IA_SEGUNDOS,
): Array<{ inicio: number; duracao: number }> {
  const lista: Array<{ inicio: number; duracao: number }> = [];
  for (let inicio = 0; inicio < duracao - 0.05; inicio += tamanho) {
    lista.push({
      inicio: Number(inicio.toFixed(3)),
      duracao: Number(Math.min(tamanho, duracao - inicio).toFixed(3)),
    });
  }
  return lista;
}

/** Corta um trecho (recodificando, pra cortar no quadro exato). Sem áudio: a IA não precisa. */
export async function recortarTrecho(
  entrada: string,
  inicio: number,
  duracao: number,
  saida: string,
): Promise<void> {
  await run([
    "-y",
    "-ss",
    inicio.toFixed(3),
    "-i",
    entrada,
    "-t",
    duracao.toFixed(3),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "16",
    "-pix_fmt",
    "yuv420p",
    saida,
  ]);
}

/** Vídeo-máscara: preto com o retângulo da legenda em branco (área a apagar). */
export async function criarMascara(
  saida: string,
  info: VideoInfo,
  caixa: Caixa,
  duracao: number,
): Promise<void> {
  const px = caixaEmPixels(caixa, info.largura, info.altura);
  await run([
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=black:s=${info.largura}x${info.altura}:r=${info.fps}:d=${duracao.toFixed(3)}`,
    "-vf",
    `drawbox=x=${px.x}:y=${px.y}:w=${px.w}:h=${px.h}:color=white:t=fill`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    saida,
  ]);
}

/**
 * Junta os trechos limpos pela IA e aplica SÓ a área da legenda sobre o vídeo
 * original (o resto da imagem e o áudio continuam os originais, sem perda).
 * No modo "trocar", escreve a legenda nova por cima.
 */
export async function comporRemocaoIA(o: {
  original: string;
  trechosIA: string[];
  saida: string;
  tmpDir: string;
  info: VideoInfo;
  caixa: Caixa;
  texto?: string;
}): Promise<void> {
  const { largura: W, altura: H, fps } = o.info;
  const px = caixaEmPixels(o.caixa, W, H);
  const n = o.trechosIA.length;
  const entradas = o.trechosIA.map(
    (_, i) => `[${i + 1}:v]scale=${W}:${H},setsar=1,fps=${fps}[t${i}]`,
  );
  const concat = `${o.trechosIA.map((_, i) => `[t${i}]`).join("")}concat=n=${n}:v=1:a=0[ia]`;
  const recorte = `[ia]crop=${px.w}:${px.h}:${px.x}:${px.y}[area]`;
  const sobrepor = `[0:v][area]overlay=${px.x}:${px.y}:eof_action=pass[base]`;
  const texto = o.texto?.trim()
    ? await filtrosTexto(o.texto, o.info, px, o.tmpDir)
    : [];
  const final = texto.length
    ? `[base]${texto.join(",")}[out]`
    : `[base]null[out]`;

  await run([
    "-y",
    "-i",
    o.original,
    ...o.trechosIA.flatMap((t) => ["-i", t]),
    "-filter_complex",
    [...entradas, concat, recorte, sobrepor, final].join(";"),
    "-map",
    "[out]",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    o.saida,
  ]);
}

/**
 * Coloca uma fala no vídeo. "substituir" troca o áudio original pela fala;
 * "misturar" mantém o original mais baixo (30%) por baixo da fala.
 * O vídeo não é recodificado; a fala é cortada na duração do vídeo.
 */
export async function aplicarAudio(o: {
  video: string;
  audio: string;
  saida: string;
  modo: "substituir" | "misturar";
  duracao: number;
  videoTemAudio: boolean;
}): Promise<void> {
  const misturar = o.modo === "misturar" && o.videoTemAudio;
  await run([
    "-y",
    "-i",
    o.video,
    "-i",
    o.audio,
    ...(misturar
      ? [
          "-filter_complex",
          "[0:a]volume=0.3[orig];[orig][1:a]amix=inputs=2:duration=first:dropout_transition=0[a]",
          "-map",
          "0:v",
          "-map",
          "[a]",
        ]
      : ["-map", "0:v", "-map", "1:a"]),
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-t",
    o.duracao.toFixed(3),
    "-movflags",
    "+faststart",
    o.saida,
  ]);
}

/** O vídeo tem trilha de áudio? */
export async function temAudio(arquivo: string): Promise<boolean> {
  const saida = await run([
    "-i",
    arquivo,
    "-map",
    "0",
    "-t",
    "0",
    "-f",
    "null",
    "-",
  ]).catch((e: Error) => e.message);
  return /Audio:/.test(saida);
}

/* ------------------------------------------------------------------ */
/* Troca de pessoa (Kling O1 / Seedance 2.5), em trechos               */
/* ------------------------------------------------------------------ */

/** Lado menor ≥ 720 e maior ≤ 2160 (exigência do Kling O1; serve pro Seedance), dimensões pares. */
export function dimensoesTroca(
  largura: number,
  altura: number,
): { largura: number; altura: number } {
  const menor = Math.min(largura, altura);
  const maior = Math.max(largura, altura);
  const fator = menor < 720 ? 720 / menor : maior > 2160 ? 2160 / maior : 1;
  const par = (n: number) => Math.round((n * fator) / 2) * 2;
  return { largura: par(largura), altura: par(altura) };
}

/** Trechos iguais de no máximo `maximo` segundos (Kling O1: 3–10s; Seedance: até 30s). */
export function trechosTroca(
  duracao: number,
  maximo = 10,
): Array<{ inicio: number; duracao: number }> {
  const n = Math.max(1, Math.ceil(duracao / maximo - 1e-6));
  const tamanho = duracao / n;
  return Array.from({ length: n }, (_, i) => ({
    inicio: Number((i * tamanho).toFixed(3)),
    duracao: Number((i === n - 1 ? duracao - i * tamanho : tamanho).toFixed(3)),
  }));
}

/** Corta um trecho já no formato que os motores aceitam (resolução e 24–60 fps), sem áudio. */
export async function prepararTrechoTroca(
  entrada: string,
  inicio: number,
  duracao: number,
  saida: string,
  info: VideoInfo,
): Promise<void> {
  const { largura, altura } = dimensoesTroca(info.largura, info.altura);
  const fps = info.fps < 24 ? 24 : info.fps > 60 ? 30 : info.fps;
  await run([
    "-y",
    "-ss",
    inicio.toFixed(3),
    "-i",
    entrada,
    "-t",
    duracao.toFixed(3),
    "-an",
    "-vf",
    `scale=${largura}:${altura},setsar=1,fps=${fps}`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "17",
    "-pix_fmt",
    "yuv420p",
    saida,
  ]);
}

/** Extrai a trilha de áudio (AAC) — a música/fala original volta no vídeo final. */
export async function extrairAudio(
  entrada: string,
  saida: string,
): Promise<void> {
  await run(["-y", "-i", entrada, "-vn", "-c:a", "aac", "-b:a", "192k", saida]);
}

/**
 * Junta os trechos gerados (na ordem) e coloca o áudio original por baixo.
 * A IA às vezes devolve o trecho mais curto/longo que o original (ex.: 4,7s
 * para 5s, com o movimento comprimido): cada trecho é esticado de volta para
 * a duração do trecho original, pra o movimento bater com a música.
 */
export async function juntarTrechos(o: {
  trechos: string[];
  /** Duração de cada trecho no vídeo original (mesma ordem). */
  duracoes: number[];
  audio?: string | null;
  saida: string;
}): Promise<void> {
  const infos = await Promise.all(o.trechos.map((t) => probe(t)));
  const { largura: W, altura: H, fps } = infos[0];
  const n = o.trechos.length;
  const entradas = infos.map((info, i) => {
    const fator = info.duracao > 0 ? o.duracoes[i] / info.duracao : 1;
    return `[${i}:v]setpts=${fator.toFixed(5)}*(PTS-STARTPTS),scale=${W}:${H},setsar=1,fps=${fps}[t${i}]`;
  });
  const concat = `${o.trechos.map((_, i) => `[t${i}]`).join("")}concat=n=${n}:v=1:a=0[v]`;
  const total = o.duracoes.reduce((a, b) => a + b, 0);
  await run([
    "-y",
    ...o.trechos.flatMap((t) => ["-i", t]),
    ...(o.audio ? ["-i", o.audio] : []),
    "-filter_complex",
    [...entradas, concat].join(";"),
    "-map",
    "[v]",
    ...(o.audio ? ["-map", `${n}:a`, "-c:a", "aac", "-b:a", "192k"] : []),
    "-t",
    total.toFixed(3),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "19",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    o.saida,
  ]);
}

/** Extrai um quadro do vídeo em JPEG (para marcar quem trocar). */
export async function extrairQuadro(
  entrada: string,
  segundos: number,
  saida: string,
): Promise<void> {
  await run([
    "-y",
    "-ss",
    segundos.toFixed(2),
    "-i",
    entrada,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    saida,
  ]);
}

import { spawn } from "node:child_process";
import { stat, writeFile } from "node:fs/promises";
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

/** `limiteMs` mata o ffmpeg se ele passar disso (ex.: lendo de uma URL que travou). */
function run(args: string[], limiteMs?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), ["-hide_banner", ...args], {
      timeout: limiteMs,
    });
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

/** Último quadro do vídeo, como imagem (é o ponto de partida da cena seguinte). */
export async function extrairUltimoQuadro(
  entrada: string,
  saida: string,
): Promise<void> {
  // Lê só o finalzinho e vai sobrescrevendo a imagem: sobra o último quadro.
  await run([
    "-y",
    "-sseof",
    "-0.5",
    "-i",
    entrada,
    "-update",
    "1",
    "-q:v",
    "2",
    saida,
  ]);
}

/**
 * Une cenas geradas em sequência num vídeo só, cortado em `segundos`. Cada
 * cena depois da primeira começa no último quadro da anterior, então o
 * primeiro quadro dela é descartado (senão o quadro aparece duas vezes).
 * O áudio só entra se todas as cenas tiverem.
 */
export async function emendarCenas(
  cenas: string[],
  segundos: number,
  saida: string,
): Promise<void> {
  const comAudio = (await Promise.all(cenas.map(temAudio))).every(Boolean);
  const filtros: string[] = [];
  let entradas = "";
  cenas.forEach((_, i) => {
    filtros.push(
      i === 0
        ? `[0:v]setpts=PTS-STARTPTS[v0]`
        : `[${i}:v]trim=start_frame=1,setpts=PTS-STARTPTS[v${i}]`,
    );
    entradas += `[v${i}]` + (comAudio ? `[${i}:a]` : "");
  });
  filtros.push(
    `${entradas}concat=n=${cenas.length}:v=1:a=${comAudio ? 1 : 0}[v]${comAudio ? "[a]" : ""}`,
  );
  await run([
    "-y",
    ...cenas.flatMap((c) => ["-i", c]),
    "-filter_complex",
    filtros.join(";"),
    "-map",
    "[v]",
    ...(comAudio ? ["-map", "[a]", "-c:a", "aac", "-b:a", "192k"] : []),
    "-t",
    segundos.toFixed(3),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "17",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    saida,
  ]);
}

/**
 * Fica só com os primeiros `segundos` do vídeo, mantendo o áudio. Recodifica
 * para cortar no quadro exato (a duração é o que se cobra na troca).
 */
export async function cortarInicio(
  entrada: string,
  segundos: number,
  saida: string,
): Promise<void> {
  await run([
    "-y",
    "-i",
    entrada,
    "-t",
    segundos.toFixed(3),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "16",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
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
/* Troca de pessoa (Kling O3 / Seedance 2.5), em trechos               */
/* ------------------------------------------------------------------ */

/** Lado menor ≥ 720 e maior ≤ 2160 (cabe no Kling O3, que aceita 720–3840; serve pro Seedance), dimensões pares. */
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

/** Trechos iguais de no máximo `maximo` segundos (Kling O3: 3–15s; Seedance: até 30s). */
export function trechosTroca(
  duracao: number,
  maximo = 10,
  /**
   * Viradas de cena (`detectarViradas`): o vídeo é dividido nelas, e só depois
   * em partes iguais de até `maximo`. Depois de um corte ou de um movimento
   * brusco o motor perde a pessoa e devolve o resto do trecho como no
   * original — começando um trecho novo ali, ele refaz a troca.
   */
  viradas: Virada[] = [],
  /** Menor trecho que o motor aceita: nenhuma divisão fica mais perto que isso de outra. */
  minimo = 3,
  /**
   * Instantes em que uma pessoa a trocar ENTRA em cena (`entradasDosAlvos`).
   * Têm prioridade sobre as viradas: o motor só troca bem quem já está na tela
   * quando o trecho começa — quem entra no meio costuma ficar como no original.
   */
  entradas: number[] = [],
): Array<{ inicio: number; duracao: number }> {
  const pontos = [0, duracao];
  for (const t of entradas)
    if (pontos.every((p) => Math.abs(p - t) >= minimo)) pontos.push(t);
  // Depois as viradas, das mais fortes para as mais fracas; cada ponto só entra
  // se sobrar `minimo` dos dois lados.
  // Corte de câmera: divide em cima dele. Movimento brusco (um golpe, um giro
  // de câmera): um trecho novo começa um pouco ANTES, para o gesto e o que vem
  // depois dele (a queda) ficarem juntos no começo de um trecho. Testado no
  // Kling com um tapa, sempre com a ação descrita no pedido (`acoesDosTrechos`
  // em ./ancora.ts): dividindo em cima do gesto, ele some; sem dividir, num
  // trecho longo o gesto sai mas a pessoa atingida volta a ser a original
  // depois dele; começando 0,75 s antes, saem o gesto e a queda com a troca.
  for (const v of [...viradas].sort((a, b) => b.forca - a.forca)) {
    const t = v.forca >= CORTE_DE_CAMERA ? v.t : v.t - ANTES_DO_GESTO;
    if (pontos.every((p) => Math.abs(p - t) >= minimo)) pontos.push(t);
  }
  pontos.sort((a, b) => a - b);
  const trechos: Array<{ inicio: number; duracao: number }> = [];
  for (let k = 0; k < pontos.length - 1; k++) {
    const de = pontos[k];
    const tamanhoTotal = pontos[k + 1] - de;
    const n = Math.max(1, Math.ceil(tamanhoTotal / maximo - 1e-6));
    const tamanho = tamanhoTotal / n;
    for (let i = 0; i < n; i++)
      trechos.push({
        inicio: Number((de + i * tamanho).toFixed(3)),
        duracao: Number(
          (i === n - 1 ? tamanhoTotal - i * tamanho : tamanho).toFixed(3),
        ),
      });
  }
  return trechos;
}

/** Instante (s) em que a imagem muda de repente e o quanto muda (0–1). */
export interface Virada {
  t: number;
  forca: number;
}

/**
 * A partir daqui a mudança entre dois quadros conta como "virada": pega cortes
 * de câmera (0,3 ou mais) e também giros rápidos de câmera na mão e movimentos
 * bruscos (perto de 0,1), que é onde a troca de pessoa costuma se perder.
 */
const LIMIAR_VIRADA = 0.08;
/** A partir desta força a virada é um corte de câmera, não um movimento brusco. */
export const CORTE_DE_CAMERA = 0.3;
/** Um movimento brusco começa um trecho novo este tanto (s) antes do seu pico. */
const ANTES_DO_GESTO = 0.75;

/** Só os cortes de câmera (instantes, em ordem). */
export const cortesDeCamera = (viradas: Virada[]): number[] =>
  viradas
    .filter((v) => v.forca >= CORTE_DE_CAMERA)
    .map((v) => v.t)
    .sort((a, b) => a - b);

/** Lê as viradas da saída do ffmpeg (`metadata=print` depois de `select`). */
export function lerViradas(saida: string): Virada[] {
  const viradas: Virada[] = [];
  let t: number | null = null;
  for (const m of saida.matchAll(
    /pts_time:([\d.]+)|lavfi\.scene_score=([\d.]+)/g,
  )) {
    if (m[1] !== undefined) t = Number(m[1]);
    else if (t !== null) {
      viradas.push({ t, forca: Number(m[2]) });
      t = null;
    }
  }
  return viradas.filter((v) => Number.isFinite(v.t) && Number.isFinite(v.forca));
}

/** Cortes e movimentos bruscos do vídeo. Se a leitura falhar, devolve vazio (divide em partes iguais). */
export async function detectarViradas(arquivo: string): Promise<Virada[]> {
  try {
    return lerViradas(
      await run(
        [
          "-i",
          arquivo,
          "-vf",
          `scale=320:-2,select='gt(scene,${LIMIAR_VIRADA})',metadata=print`,
          "-an",
          "-f",
          "null",
          "-",
        ],
        60_000,
      ),
    );
  } catch (e) {
    console.warn(
      "[ffmpeg] leitura das viradas de cena falhou:",
      (e as Error).message,
    );
    return [];
  }
}

/** Corta um trecho já no formato que os motores aceitam (resolução e 24–60 fps), sem áudio. */
export async function prepararTrechoTroca(
  entrada: string,
  inicio: number,
  duracao: number,
  saida: string,
  info: VideoInfo,
  /**
   * Câmera lenta: o trecho sai `lentidao` vezes mais longo (tomadas mais curtas
   * que o mínimo do motor). Na montagem, `juntarTrechos` devolve a velocidade.
   */
  lentidao = 1,
): Promise<void> {
  const { largura, altura } = dimensoesTroca(info.largura, info.altura);
  const fps = info.fps < 24 ? 24 : info.fps > 60 ? 30 : info.fps;
  await run([
    "-y",
    "-ss",
    inicio.toFixed(3),
    // Antes do -i: limita o que é LIDO. Depois dele cortaria a saída já esticada.
    "-t",
    duracao.toFixed(3),
    "-i",
    entrada,
    "-an",
    "-vf",
    `${lentidao > 1 ? `setpts=${lentidao.toFixed(4)}*PTS,` : ""}scale=${largura}:${altura},setsar=1,fps=${fps}`,
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
  limiteMs?: number,
): Promise<void> {
  await run(
    [
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
    ],
    limiteMs,
  );
}

/**
 * Une as cenas de um vídeo falado (cada uma com a sua fala) num vídeo só.
 * Todas são levadas ao tamanho e ao ritmo da primeira, então cenas de tamanhos
 * diferentes não quebram a emenda.
 */
export async function juntarFalas(
  cenas: string[],
  saida: string,
  /**
   * MP3 da fala de cada cena (128 kbps). Com eles, o som de cada cena passa a
   * ser a fala original (a voz exata do personagem) e a cena é cortada no fim
   * da fala.
   */
  audios?: string[],
): Promise<void> {
  const { largura, altura } = await probe(cenas[0]);
  const w = largura - (largura % 2);
  const h = altura - (altura % 2);
  const duracoes = audios
    ? await Promise.all(
        audios.map(async (a) => ((await stat(a)).size * 8) / 128_000),
      )
    : null;
  const n = cenas.length;
  const filtros = cenas.flatMap((_, i) => {
    const corte = duracoes ? `trim=0:${duracoes[i].toFixed(3)},` : "";
    return [
      `[${i}:v]${corte}scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=30,setpts=PTS-STARTPTS[v${i}]`,
      duracoes
        ? `[${n + i}:a]aresample=44100,aformat=channel_layouts=stereo,apad,atrim=0:${duracoes[i].toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`
        : `[${i}:a]aresample=44100,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS[a${i}]`,
    ];
  });
  filtros.push(
    `${cenas.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${n}:v=1:a=1[v][a]`,
  );
  await run([
    "-y",
    ...[...cenas, ...(audios ?? [])].flatMap((c) => ["-i", c]),
    "-filter_complex",
    filtros.join(";"),
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "17",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    saida,
  ]);
}

/** Quadros numerados (PNG, ex.: q-%05d.png) → MP4 sem som, no ritmo dado. */
export async function quadrosParaVideo(
  padrao: string,
  fps: number,
  saida: string,
): Promise<void> {
  await run([
    "-y",
    "-framerate",
    String(fps),
    "-i",
    padrao,
    "-vf",
    "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "16",
    "-movflags",
    "+faststart",
    saida,
  ]);
}

/**
 * Começo de um vídeo → WebP animado quadrado (figurinha). `qualidade` vai de
 * 0 a 100; menos quadros por segundo e menos qualidade deixam o arquivo menor.
 */
export async function videoParaWebpAnimado(
  video: string,
  segundos: number,
  lado: number,
  fps: number,
  qualidade: number,
  saida: string,
): Promise<void> {
  await run([
    "-y",
    "-i",
    video,
    "-t",
    segundos.toFixed(3),
    "-vf",
    `fps=${fps},scale=${lado}:${lado}:force_original_aspect_ratio=increase,crop=${lado}:${lado}`,
    "-an",
    "-c:v",
    "libwebp_anim",
    "-lossless",
    "0",
    "-q:v",
    String(qualidade),
    "-compression_level",
    "5",
    "-loop",
    "0",
    saida,
  ]);
}

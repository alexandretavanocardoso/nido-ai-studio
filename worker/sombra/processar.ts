/**
 * Sombra de vídeo longo: troca a pessoa de uma live gravada inteira (horas) pelo
 * influencer, em partes. Cada parte (~5 min, cortada na divisa de um pedaço do
 * HLS — ou recortada com precisão, no arquivo enviado) vai para o Lucy 2.5 em
 * lote; o vídeo que volta recebe o áudio da parte (o original, ou a fala trocada
 * na ElevenLabs) e sobe para o S3. No fim, as partes viram um MP4 só, emendado
 * sem reprocessar (fragmentado, subido em partes para o S3).
 *
 * O estado fica no banco (input.trabalho do video_jobs): se o processo cair,
 * outro retoma do que já estava pronto. Quem cobra, devolve créditos e põe o
 * vídeo na Sombra é o app (lib/video/finalizar.ts), ao ver o trabalho pronto.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { openAsBlob } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import { agruparSegmentos, fonteDoVod, segmentosDoHls, type SegmentoHls } from "./vod";

/* ------------------------------------------------------------------ */
/* O que vem do app                                                     */
/* ------------------------------------------------------------------ */

export type FonteSombra =
  /** Live gravada da Twitch ou do Kick (o link colado). */
  | { tipo: "vod"; url: string }
  /** Arquivo enviado (key no S3). */
  | { tipo: "arquivo"; key: string }
  /** Vídeo num endereço público (link buscado pelo app, MP4 direto). */
  | { tipo: "url"; url: string };

export interface ParteFeita {
  key: string;
  dur: number;
}

export interface Trabalho {
  estado: "processando" | "concluido" | "erro";
  /** Quando o processo deu sinal de vida pela última vez (ms). */
  vivoEm?: number;
  total?: number;
  /** Partes prontas, pelo número da parte. */
  partes?: Record<string, ParteFeita>;
  key?: string;
  size?: number;
  erro?: string;
}

export interface JobSombra {
  id: string;
  userId: string;
  /** Segundos do vídeo inteiro (medidos pelo app). */
  duracao: number;
  /** Trecho escolhido (segundos); sem ele, o vídeo inteiro. É o que foi cobrado. */
  trecho?: { inicio: number; fim: number } | null;
  fonte: FonteSombra;
  /** Pedido do Lucy, pronto (lib/live/decart.ts → pedidoDaSombra). */
  pedido: string;
  imageKey: string;
  voiceId: string | null;
  trabalho: Trabalho | null;
}

/* ------------------------------------------------------------------ */
/* O que o processo usa (de verdade, ou de mentira nos testes)          */
/* ------------------------------------------------------------------ */

export interface Servicos {
  ffmpeg: string;
  /** Guarda o estado do trabalho (só as chaves passadas mudam). */
  salvar: (mudancas: Partial<Trabalho> & { parte?: [number, ParteFeita] }) => Promise<void>;
  /** Endereço para ler um arquivo do S3 (pré-assinado). */
  urlDoS3: (key: string) => Promise<string>;
  baixarDoS3: (key: string) => Promise<Buffer>;
  enviarArquivo: (key: string, arquivo: string) => Promise<void>;
  /** Sobe o que sair do fluxo (de qualquer tamanho). Devolve os bytes. */
  enviarFluxo: (key: string, fluxo: Readable) => Promise<number>;
  /** Copia dentro do S3 e devolve o tamanho. */
  copiarNoS3: (de: string, para: string) => Promise<number>;
  apagarDoS3: (keys: string[]) => Promise<void>;
  /** Lucy 2.5 em lote: manda, acompanha e baixa. */
  lucy: {
    enviar: (video: Blob, imagem: Blob, pedido: string) => Promise<string>;
    estado: (jobId: string) => Promise<"pending" | "processing" | "completed" | "failed" | string>;
    resultado: (jobId: string) => Promise<Blob>;
  };
  /** Troca a voz de um pedaço de fala (PCM 16 kHz) → PCM 24 kHz. */
  trocarVoz: (pcm: Buffer, voiceId: string) => Promise<Buffer>;
  log: (...a: unknown[]) => void;
}

export interface Opcoes {
  /** Duração alvo de cada parte (segundos). */
  segundosPorParte: number;
  /** Partes processadas ao mesmo tempo. */
  paralelas: number;
  /** Só nos testes: para depois de tantas partes. */
  maxPartes?: number;
}

export const OPCOES_PADRAO: Opcoes = { segundosPorParte: 300, paralelas: 3 };

/** Trocas de voz ao mesmo tempo (o plano da ElevenLabs limita as simultâneas). */
const VOZES_SIMULTANEAS = 3;
/** Pedaço de fala por troca de voz: 1 min de PCM 16 kHz mono. */
const PEDACO_VOZ = 16_000 * 2 * 60;
const TAXA_VOZ = 24_000;
/** Uma parte no Lucy não passa disso. */
const LIMITE_LUCY_MS = 90 * 60_000;
const TENTATIVAS = 3;
export const SEM_CREDITOS_DECART = "A conta da Decart está sem créditos. Recarregue em platform.decart.ai e gere de novo.";

/* ------------------------------------------------------------------ */
/* ffmpeg                                                               */
/* ------------------------------------------------------------------ */

function rodar(ffmpeg: string, args: string[]): Promise<string> {
  return new Promise((ok, falha) => {
    const p = spawn(ffmpeg, ["-hide_banner", "-nostdin", ...args]);
    let err = "";
    p.stderr.on("data", (d) => (err = (err + d.toString()).slice(-8000)));
    p.on("error", falha);
    p.on("close", (c) => (c === 0 ? ok(err) : falha(new Error(`ffmpeg falhou (${c}): ${err.slice(-600)}`))));
  });
}

/** Duração e trilhas de um arquivo (lendo a saída do ffmpeg). */
async function medir(ffmpeg: string, arquivo: string): Promise<{ dur: number; audio: boolean }> {
  const saida = await new Promise<string>((ok) => {
    const p = spawn(ffmpeg, ["-hide_banner", "-i", arquivo]);
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", () => ok(err));
    p.on("error", () => ok(err));
  });
  const m = saida.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const dur = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
  return { dur, audio: /Stream #.*Audio:/.test(saida) };
}

/** Playlist ou lista local que aponta para endereços na rede. */
const ENTRADA_REDE = ["-protocol_whitelist", "file,http,https,tcp,tls,crypto"];
/** Endereço direto (só aqui valem as opções de reconexão do http). */
const ENTRADA_URL = ["-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "10"];

/** Parte planejada: de onde ler e quanto. */
export interface Parte {
  i: number;
  inicio: number;
  dur: number;
  /** Pedaços do HLS (parte já cortada na divisa) ou trecho de um arquivo. */
  segs?: SegmentoHls[];
}

/** Lê o pedaço do vídeo de origem desta parte e grava em `saida` (MP4). */
async function lerParte(
  s: Servicos,
  job: JobSombra,
  origem: { hls?: true; url?: string },
  p: Parte,
  dir: string,
  saida: string,
): Promise<void> {
  if (p.segs) {
    // HLS: uma playlist só com os pedaços desta parte; copia sem reprocessar.
    const lista = path.join(dir, "parte.m3u8");
    const alvo = Math.ceil(Math.max(...p.segs.map((x) => x.dur)));
    await writeFile(
      lista,
      [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        `#EXT-X-TARGETDURATION:${alvo}`,
        "#EXT-X-MEDIA-SEQUENCE:0",
        ...p.segs.flatMap((x) => [`#EXTINF:${x.dur.toFixed(3)},`, x.url]),
        "#EXT-X-ENDLIST",
        "",
      ].join("\n"),
    );
    await rodar(s.ffmpeg, [
      "-y", ...ENTRADA_REDE, "-allowed_extensions", "ALL", "-i", lista,
      "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-bsf:a", "aac_adtstoasc",
      "-movflags", "+faststart", saida,
    ]);
    return;
  }
  // Arquivo: corte preciso (reprocessa em 720p; o Lucy refaz o vídeo mesmo).
  const url = job.fonte.tipo === "arquivo" ? await s.urlDoS3(job.fonte.key) : origem.url!;
  await rodar(s.ffmpeg, [
    "-y", "-ss", p.inicio.toFixed(3), ...ENTRADA_URL, "-i", url, "-t", p.dur.toFixed(3),
    "-map", "0:v:0", "-map", "0:a:0?",
    "-vf", "scale=-2:'min(720,ih)'", "-r", "30",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", saida,
  ]);
}

/* ------------------------------------------------------------------ */
/* Troca de voz da parte                                                */
/* ------------------------------------------------------------------ */

function semaforo(n: number) {
  let livres = n;
  const fila: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (livres <= 0) await new Promise<void>((ok) => fila.push(ok));
    livres--;
    try {
      return await fn();
    } finally {
      livres++;
      fila.shift()?.();
    }
  };
}
const naVez = semaforo(VOZES_SIMULTANEAS);

async function comTentativas<T>(nome: string, s: Servicos, fn: () => Promise<T>): Promise<T> {
  let ultimo: unknown;
  for (let t = 1; t <= TENTATIVAS; t++) {
    try {
      return await fn();
    } catch (e) {
      ultimo = e;
      s.log(`[sombra] ${nome}: tentativa ${t} falhou:`, (e as Error).message);
      // Sem saldo na Decart: tentar de novo não adianta.
      if (/\b402\b|insufficient credits/i.test((e as Error).message)) throw new Error(SEM_CREDITOS_DECART);
      if (t < TENTATIVAS) await new Promise((ok) => setTimeout(ok, 5000 * t));
    }
  }
  throw ultimo;
}

function wav(pcm: Buffer, taxa: number): Buffer {
  const c = Buffer.alloc(44);
  c.write("RIFF", 0);
  c.writeUInt32LE(36 + pcm.length, 4);
  c.write("WAVE", 8);
  c.write("fmt ", 12);
  c.writeUInt32LE(16, 16);
  c.writeUInt16LE(1, 20);
  c.writeUInt16LE(1, 22);
  c.writeUInt32LE(taxa, 24);
  c.writeUInt32LE(taxa * 2, 28);
  c.writeUInt16LE(2, 32);
  c.writeUInt16LE(16, 34);
  c.write("data", 36);
  c.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([c, pcm]);
}

/** A fala da parte na voz escolhida (WAV 24 kHz), pedaço a pedaço. */
async function vozDaParte(s: Servicos, voiceId: string, entrada: string, dir: string): Promise<string> {
  const pcm = path.join(dir, "fala.pcm");
  await rodar(s.ffmpeg, ["-y", "-i", entrada, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", pcm]);
  const dados = await readFile(pcm);
  const pedacos: Buffer[] = [];
  for (let i = 0; i < dados.length; i += PEDACO_VOZ) pedacos.push(dados.subarray(i, i + PEDACO_VOZ));
  const trocados = await Promise.all(
    pedacos.map((p) => naVez(() => comTentativas("troca de voz", s, () => s.trocarVoz(p, voiceId)))),
  );
  const saida = path.join(dir, "voz.wav");
  await writeFile(saida, wav(Buffer.concat(trocados), TAXA_VOZ));
  return saida;
}

/* ------------------------------------------------------------------ */
/* Uma parte: origem → Lucy → áudio → S3                                */
/* ------------------------------------------------------------------ */

async function processarParte(
  s: Servicos,
  job: JobSombra,
  origem: { hls?: true; url?: string },
  imagem: Blob,
  p: Parte,
  base: string,
): Promise<ParteFeita> {
  const dir = path.join(base, `p${p.i}`);
  await mkdir(dir, { recursive: true });
  try {
    const entrada = path.join(dir, "entrada.mp4");
    await comTentativas(`ler a parte ${p.i}`, s, () => lerParte(s, job, origem, p, dir, entrada));
    const medida = await medir(s.ffmpeg, entrada);
    const dur = medida.dur || p.dur;

    // Lucy (com novas tentativas se falhar ou demorar demais).
    const lucy = path.join(dir, "lucy.mp4");
    await comTentativas(`Lucy na parte ${p.i}`, s, async () => {
      const id = await s.lucy.enviar(await openAsBlob(entrada, { type: "video/mp4" }), imagem, job.pedido);
      const t0 = Date.now();
      for (;;) {
        await new Promise((ok) => setTimeout(ok, 10_000));
        const e = await s.lucy.estado(id).catch(() => "processing");
        if (e === "completed") break;
        if (e === "failed") throw new Error("O Lucy não conseguiu processar uma parte do vídeo.");
        if (Date.now() - t0 > LIMITE_LUCY_MS) throw new Error("O Lucy demorou demais numa parte do vídeo.");
      }
      const r = await s.lucy.resultado(id);
      await writeFile(lucy, Buffer.from(await r.arrayBuffer()));
    });

    // Áudio: a fala trocada, o original, ou silêncio (as partes precisam ter o mesmo formato).
    const audio = job.voiceId
      ? await vozDaParte(s, job.voiceId, entrada, dir)
      : medida.audio
        ? entrada
        : null;
    const composta = path.join(dir, "composta.mp4");
    await rodar(s.ffmpeg, [
      "-y", "-i", lucy,
      ...(audio ? ["-i", audio] : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]),
      "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "160k",
      "-t", dur.toFixed(3), "-movflags", "+faststart", composta,
    ]);
    const key = `users/${job.userId}/videos/sombra-${job.id}-p${p.i}.mp4`;
    await comTentativas(`enviar a parte ${p.i}`, s, () => s.enviarArquivo(key, composta));
    return { key, dur };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ */
/* O trabalho inteiro                                                   */
/* ------------------------------------------------------------------ */

/** Planeja as partes: na divisa dos pedaços do HLS, ou em cortes iguais no arquivo. */
async function planejar(
  job: JobSombra,
  s: Servicos,
  o: Opcoes,
): Promise<{ partes: Parte[]; origem: { hls?: true; url?: string } }> {
  const inicio = job.trecho?.inicio ?? 0;
  const fim = job.trecho?.fim ?? job.duracao;
  if (job.fonte.tipo === "vod") {
    const f = await fonteDoVod(job.fonte.url);
    if ("hls" in f) {
      const segs = noTrecho(await segmentosDoHls(f.hls), inicio, fim);
      const grupos = agruparSegmentos(segs, o.segundosPorParte);
      return { partes: grupos.map((g, i) => ({ i, inicio: inicio + g.inicio, dur: g.dur, segs: g.segs })), origem: { hls: true } };
    }
    return { partes: cortes(inicio, fim, o.segundosPorParte), origem: { url: f.mp4 } };
  }
  const url = job.fonte.tipo === "url" ? job.fonte.url : undefined;
  if (job.fonte.tipo === "arquivo") await s.urlDoS3(job.fonte.key); // confere que existe
  return { partes: cortes(inicio, fim, o.segundosPorParte), origem: { url } };
}

/** Os pedaços do HLS que caem no trecho (na divisa dos pedaços: ~10 s de folga). */
export function noTrecho(segs: SegmentoHls[], inicio: number, fim: number): SegmentoHls[] {
  const dentro: SegmentoHls[] = [];
  let t = 0;
  for (const s of segs) {
    const meio = t + s.dur / 2;
    if (meio >= inicio && meio < fim) dentro.push(s);
    t += s.dur;
  }
  return dentro.length ? dentro : segs.slice(0, 1);
}

/** Cortes iguais de ~`alvo` segundos entre `inicio` e `fim`. */
export function cortes(inicio: number, fim: number, alvo: number): Parte[] {
  const total = Math.max(0, fim - inicio);
  const n = Math.max(1, Math.round(total / alvo));
  const passo = total / n;
  return Array.from({ length: n }, (_, i) => ({
    i,
    inicio: inicio + i * passo,
    dur: i === n - 1 ? total - i * passo : passo,
  }));
}

/** Emenda as partes prontas (do S3) num MP4 só e sobe. Devolve a key e o tamanho. */
async function juntar(s: Servicos, job: JobSombra, partes: ParteFeita[], base: string): Promise<{ key: string; size: number }> {
  const key = `users/${job.userId}/videos/${randomBytes(9).toString("base64url")}.mp4`;
  if (partes.length === 1) return { key, size: await s.copiarNoS3(partes[0].key, key) };
  const lista = path.join(base, "partes.txt");
  const urls = await Promise.all(partes.map((p) => s.urlDoS3(p.key)));
  await writeFile(lista, ["ffconcat version 1.0", ...urls.map((u) => `file '${u.replace(/'/g, "%27")}'`), ""].join("\n"));
  const p = spawn(s.ffmpeg, [
    "-hide_banner", "-nostdin", "-f", "concat", "-safe", "0", ...ENTRADA_REDE, "-i", lista,
    "-map", "0:v:0", "-map", "0:a:0", "-c", "copy",
    "-movflags", "+frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", "pipe:1",
  ]);
  let err = "";
  p.stderr.on("data", (d) => (err = (err + d.toString()).slice(-4000)));
  const fim = new Promise<number>((ok) => p.on("close", (c) => ok(c ?? 1)));
  const size = await s.enviarFluxo(key, p.stdout);
  const codigo = await fim;
  if (codigo !== 0) throw new Error(`ffmpeg falhou ao emendar (${codigo}): ${err.slice(-600)}`);
  return { key, size };
}

/**
 * Processa o trabalho (ou retoma: as partes já prontas ficam). Termina com o
 * trabalho "concluido" (key e tamanho) ou lança o erro (quem chama marca).
 */
export async function processar(job: JobSombra, s: Servicos, o: Opcoes = OPCOES_PADRAO): Promise<void> {
  const base = await mkdtemp(path.join(os.tmpdir(), `sombra-${job.id}-`));
  try {
    const { partes: todas, origem } = await planejar(job, s, o);
    const partes = o.maxPartes ? todas.slice(0, o.maxPartes) : todas;
    const feitas: Record<string, ParteFeita> = { ...(job.trabalho?.partes ?? {}) };
    await s.salvar({ estado: "processando", total: partes.length });
    s.log(`[sombra] ${job.id}: ${partes.length} partes, ${Object.keys(feitas).length} já prontas`);
    const imagem = new Blob([new Uint8Array(await s.baixarDoS3(job.imageKey))], { type: "image/jpeg" });

    const pendentes = partes.filter((p) => !feitas[p.i]);
    let erro: unknown = null;
    const trabalhar = async () => {
      for (;;) {
        const p = pendentes.shift();
        if (!p || erro) return;
        try {
          const feita = await processarParte(s, job, origem, imagem, p, base);
          feitas[p.i] = feita;
          await s.salvar({ parte: [p.i, feita] });
          s.log(`[sombra] ${job.id}: parte ${p.i + 1}/${partes.length} pronta`);
        } catch (e) {
          erro = e;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, o.paralelas) }, trabalhar));
    if (erro) throw erro;

    const prontas = partes.map((p) => feitas[p.i]);
    const final = await juntar(s, job, prontas, base);
    await s.apagarDoS3(prontas.map((p) => p.key));
    await s.salvar({ estado: "concluido", key: final.key, size: final.size });
    s.log(`[sombra] ${job.id}: pronto → ${final.key}`);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}

/** Tamanho de um arquivo local (para os testes). */
export const tamanho = async (arquivo: string) => (await stat(arquivo)).size;

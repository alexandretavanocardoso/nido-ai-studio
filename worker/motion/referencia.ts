/**
 * Vídeo de referência (motion "a partir de um vídeo", estilo Katana): o worker
 * assiste uma vez — trocas de cena e batidas (ffmpeg), o roteiro cena a cena
 * escrito pelo Gemini olhando o vídeo com o som — e tira os quadros que o
 * modelo que escreve o motion vê. O áudio pode virar a música do MP4.
 */
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { custoMotion, fpsDaAnalise, MODELO_ANALISE_VIDEO, QUADROS_DA_REFERENCIA } from "./modelos";
import { pedidoAnaliseReferencia } from "./prompt";
import { batidasDoEnvelope, cortesDoShowinfo, envelopeDeAmostras, temposDosQuadros } from "./referencia-tempos";
import type { ArmazenamentoMotion } from "./s3";
import type { InputMotion } from "./tipos";

export interface QuadroReferencia {
  t: number;
  base64: string;
}

/** Roda o ffmpeg e devolve a saída (binária) e o log. */
function ffmpegRodar(ffmpeg: string, args: string[], limiteMs = 240_000): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((ok, falha) => {
    const p = spawn(ffmpeg, ["-hide_banner", ...args], { timeout: limiteMs });
    const partes: Buffer[] = [];
    let stderr = "";
    p.stdout.on("data", (d: Buffer) => partes.push(d));
    p.stderr.on("data", (d) => (stderr = (stderr + String(d)).slice(-400_000)));
    p.on("error", falha);
    p.on("close", (code) =>
      code === 0 ? ok({ stdout: Buffer.concat(partes), stderr }) : falha(new Error(`ffmpeg falhou (${code}): ${stderr.slice(-400)}`)),
    );
  });
}

/** Trocas de cena (o ffmpeg compara cada quadro com o anterior, numa cópia pequena). */
async function cortesDoVideo(ffmpeg: string, arquivo: string, duracao: number): Promise<number[]> {
  const { stderr } = await ffmpegRodar(ffmpeg, [
    "-i", arquivo, "-an", "-vf", "scale=320:-2,select='gt(scene,0.3)',showinfo", "-f", "null", "-",
  ]);
  return cortesDoShowinfo(stderr, duracao);
}

/** Volume do áudio, 50 vezes por segundo. Null sem áudio. */
async function envelopeDoVideo(ffmpeg: string, arquivo: string): Promise<number[] | null> {
  try {
    const { stdout } = await ffmpegRodar(ffmpeg, ["-i", arquivo, "-map", "0:a:0", "-ac", "1", "-ar", "8000", "-f", "s16le", "-"]);
    if (stdout.length < 16_000) return null;
    const amostras = new Int16Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.length / 2));
    return envelopeDeAmostras(amostras, 8000, 50);
  } catch {
    return null;
  }
}

/** Um quadro do vídeo (JPEG, lado maior até 640 px). */
async function quadroEm(ffmpeg: string, arquivo: string, t: number): Promise<Buffer> {
  const { stdout } = await ffmpegRodar(ffmpeg, [
    "-ss", t.toFixed(2), "-i", arquivo, "-frames:v", "1",
    "-vf", "scale=640:640:force_original_aspect_ratio=decrease", "-f", "image2pipe", "-c:v", "mjpeg", "-q:v", "4", "-",
  ]);
  return stdout;
}

/** Cópia leve para o Gemini (lado menor em `lado` px, 15 fps, áudio mono). */
async function copiaParaAnalise(ffmpeg: string, arquivo: string, saida: string, lado: number, crf: number) {
  await ffmpegRodar(ffmpeg, [
    "-y", "-i", arquivo, "-t", "61",
    "-vf", `scale='if(gt(iw,ih),-2,${lado})':'if(gt(iw,ih),${lado},-2)',fps=15`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf), "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "64k", "-ac", "1", "-movflags", "+faststart", saida,
  ]);
}

/**
 * O Gemini assiste ao vídeo (imagem e som, alguns quadros por segundo) e
 * escreve o roteiro cena a cena. Com o modelo principal fora do ar, tenta o
 * Flash.
 */
async function assistir(o: {
  video: Buffer;
  duracao: number;
  cortes: number[];
  batidas: number[];
  temAudio: boolean;
}): Promise<{ texto: string; entrada: number; saida: number }> {
  const chave = process.env.GEMINI_API_KEY?.trim();
  if (!chave) throw new Error("Falta GEMINI_API_KEY no worker.");
  const ai = new GoogleGenAI({ apiKey: chave });
  const modelos = [process.env.MOTION_MODELO_VIDEO?.trim() || MODELO_ANALISE_VIDEO, "gemini-flash-latest"];
  let ultimo: unknown;
  for (const modelo of modelos) {
    try {
      const r = await ai.models.generateContent({
        model: modelo,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: "video/mp4", data: o.video.toString("base64") }, videoMetadata: { fps: fpsDaAnalise(o.duracao) } },
              { text: pedidoAnaliseReferencia(o) },
            ],
          },
        ],
        config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, maxOutputTokens: 12_000 },
      });
      const texto = r.text?.trim() ?? "";
      if (texto.length < 80) throw new Error("O Gemini não descreveu o vídeo.");
      const u = r.usageMetadata;
      return {
        texto,
        entrada: u?.promptTokenCount ?? 0,
        saida: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
      };
    } catch (e) {
      ultimo = e;
      // Chave inválida ou sem cota: o outro modelo também falharia.
      if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 429)) break;
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error(String(ultimo));
}

/**
 * Prepara o vídeo de referência do pedido: na primeira vez, assiste (cortes,
 * batidas, roteiro) e, se pedido, guarda o áudio como música do MP4 — tudo
 * fica em `input` (o worker salva). Sempre devolve os quadros para o modelo.
 * Uso: tokens e custo da análise (para somar no custo do motion).
 */
export async function prepararReferencia(o: {
  ffmpeg: string;
  s3: ArmazenamentoMotion;
  userId: string;
  input: InputMotion;
  log: (...a: unknown[]) => void;
}): Promise<{ quadros: QuadroReferencia[]; uso?: { entrada: number; saida: number; custo: number } }> {
  const ref = o.input.referencia!;
  const dir = await mkdtemp(path.join(os.tmpdir(), "motion-ref-"));
  try {
    const arquivo = path.join(dir, `referencia${path.extname(ref.key) || ".mp4"}`);
    await writeFile(arquivo, await o.s3.baixar(ref.key));
    let uso: { entrada: number; saida: number; custo: number } | undefined;

    if (!ref.analise && !ref.erro) {
      ref.cortes = await cortesDoVideo(o.ffmpeg, arquivo, ref.duracao).catch((e) => {
        o.log("cortes da referência:", (e as Error).message);
        return [];
      });
      const envelope = await envelopeDoVideo(o.ffmpeg, arquivo);
      ref.batidas = envelope ? batidasDoEnvelope(envelope, 50) : [];
      // Vídeo mudo: não há áudio para virar música (e o motion não promete trilha).
      if (!envelope) ref.usarAudio = false;
      try {
        const copia = path.join(dir, "analise.mp4");
        await copiaParaAnalise(o.ffmpeg, arquivo, copia, 480, 30);
        // O pedido vai inteiro (inline): passando de ~15 MB, uma cópia menor.
        if ((await stat(copia)).size > 15_000_000) await copiaParaAnalise(o.ffmpeg, arquivo, copia, 360, 36);
        const r = await assistir({
          video: await readFile(copia),
          duracao: ref.duracao,
          cortes: ref.cortes,
          batidas: ref.batidas,
          temAudio: !!envelope,
        });
        ref.analise = r.texto;
        const tipo = /KIND:\s*(motion graphics|live footage|mixed)/i.exec(r.texto)?.[1]?.toLowerCase();
        ref.estilo = tipo === "live footage" ? "filmado" : tipo === "mixed" ? "misto" : tipo ? "grafico" : undefined;
        uso = { entrada: r.entrada, saida: r.saida, custo: custoMotion(MODELO_ANALISE_VIDEO, r.entrada, r.saida) };
      } catch (e) {
        o.log("análise da referência falhou (segue com os quadros):", (e as Error).message);
        ref.erro = (e as Error).message.slice(0, 200);
      }
      // O áudio do vídeo vira a música do MP4 (o motion segue o ritmo dele).
      if (ref.usarAudio && envelope && !o.input.musica) {
        try {
          const audio = path.join(dir, "audio.m4a");
          await ffmpegRodar(o.ffmpeg, ["-y", "-i", arquivo, "-vn", "-c:a", "aac", "-b:a", "160k", "-t", String(ref.duracao + 1), audio]);
          const key = `users/${o.userId}/audios/${randomBytes(9).toString("base64url")}.m4a`;
          await o.s3.enviarArquivo(key, audio, "audio/mp4");
          o.input.musica = {
            key,
            nome: ref.titulo ? `Áudio: ${ref.titulo}`.slice(0, 200) : "Áudio do vídeo de referência",
            origem: ref.origem,
          };
        } catch (e) {
          o.log("áudio da referência não extraído:", (e as Error).message);
        }
      }
    }

    const quadros: QuadroReferencia[] = [];
    for (const t of temposDosQuadros(ref.duracao, ref.cortes ?? [], QUADROS_DA_REFERENCIA)) {
      try {
        const jpeg = await quadroEm(o.ffmpeg, arquivo, Math.min(t, Math.max(0, ref.duracao - 0.1)));
        if (jpeg.length) quadros.push({ t, base64: jpeg.toString("base64") });
      } catch (e) {
        o.log("quadro da referência:", t, (e as Error).message);
      }
    }
    return { quadros, uso };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

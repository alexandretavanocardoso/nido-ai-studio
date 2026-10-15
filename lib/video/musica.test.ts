import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, describe, expect, it } from "vitest";
import { misturarMusica, probe, temAudio } from "./ffmpeg";

const dir = mkdtempSync(path.join(os.tmpdir(), "musica-"));
// No Windows o ffmpeg pode ainda segurar um arquivo: a limpeza tenta de novo e não derruba o teste.
afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {}
});

/** Gera um arquivo de teste com as fontes do próprio ffmpeg (lavfi). */
function gerar(saida: string, args: string[]) {
  const r = spawnSync(ffmpegStatic as unknown as string, ["-y", "-loglevel", "error", ...args, saida]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  return saida;
}

describe("música de fundo", () => {
  const musica = gerar(path.join(dir, "musica.m4a"), ["-f", "lavfi", "-i", "sine=frequency=800:duration=1", "-c:a", "aac"]);

  it("vídeo sem som: a música entra, repete até o fim e o vídeo mantém a duração", async () => {
    const video = gerar(path.join(dir, "mudo.mp4"), [
      "-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p",
    ]);
    const saida = path.join(dir, "mudo-musica.mp4");
    await misturarMusica({ video, musica, saida });
    expect(await temAudio(saida)).toBe(true);
    expect((await probe(saida)).duracao).toBeCloseTo(3, 0);
  }, 60_000);

  it("vídeo com fala: mistura por baixo, sem cortar a fala", async () => {
    const video = gerar(path.join(dir, "falado.mp4"), [
      "-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=4",
      "-f", "lavfi", "-i", "sine=frequency=300:duration=4",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
    ]);
    const saida = path.join(dir, "falado-musica.mp4");
    await misturarMusica({ video, musica, saida });
    expect(await temAudio(saida)).toBe(true);
    expect((await probe(saida)).duracao).toBeCloseTo(4, 0);
  }, 60_000);
});

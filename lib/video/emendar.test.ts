import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, describe, expect, it } from "vitest";
import { emendarCenas, probe, temAudio } from "./ffmpeg";

const dir = mkdtempSync(path.join(os.tmpdir(), "emendar-"));
// No Windows o ffmpeg pode ainda segurar um arquivo: a limpeza tenta de novo e não derruba o teste.
afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {}
});

/** Uma cena de teste com som, feita com as fontes do próprio ffmpeg (lavfi). */
function cena(nome: string, segundos: number) {
  const saida = path.join(dir, nome);
  const r = spawnSync(ffmpegStatic as unknown as string, [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", `testsrc=size=320x240:rate=24:duration=${segundos}`,
    "-f", "lavfi", "-i", `sine=frequency=440:duration=${segundos}`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
    saida,
  ]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  return saida;
}

describe("unir cenas", () => {
  const cenas = [cena("a.mp4", 2), cena("b.mp4", 2)];

  it("cenas com som: o som entra e o vídeo é cortado no tempo pedido", async () => {
    const saida = path.join(dir, "com-som.mp4");
    await emendarCenas(cenas, 3, saida);
    expect(await temAudio(saida)).toBe(true);
    expect((await probe(saida)).duracao).toBeCloseTo(3, 0);
  }, 60_000);

  it("semAudio: tira o som que o serviço gerou sem ter sido pedido (Veo na API do Gemini)", async () => {
    const saida = path.join(dir, "sem-som.mp4");
    await emendarCenas(cenas, 3, saida, true);
    expect(await temAudio(saida)).toBe(false);
    expect((await probe(saida)).duracao).toBeCloseTo(3, 0);
  }, 60_000);
});

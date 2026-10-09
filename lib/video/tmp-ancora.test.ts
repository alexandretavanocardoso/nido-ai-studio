import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { it } from "vitest";
import { passadaConfere, trocarNoQuadro } from "./ancora";

it("ancora", async () => {
  const dir = process.env.DIR!;
  const log: string[] = [];
  const warn = console.warn;
  console.warn = (...a: unknown[]) => { log.push(a.join(" ")); };
  const input = JSON.parse(readFileSync(`${dir}/input-WMHSVavv1jxt.json`, "utf8"));
  const descricoes: string[] = input.pessoas.map((p: { descricao: string }) => p.descricao);
  const quadro = readFileSync(`${dir}/quadro_t1.jpg`);
  const personagens = [0, 1, 2].map((i) => readFileSync(`${dir}/pers-${i}.jpg`));
  // Caso ruim conhecido: o quadro do vídeo que bugou (esquerda misturada, direita intacta).
  const ruim = readFileSync(`${dir}/resultado_t1.jpg`);
  for (const n of [0, 1, 2])
    log.push(`conferencia no quadro bugado, alvo ${n + 1}: ${await passadaConfere({ antes: quadro, depois: ruim, personagem: personagens[n], descricao: descricoes[n] })}`);
  const t0 = Date.now();
  const r = await trocarNoQuadro({
    quadro,
    alvos: [0, 1, 2],
    descricoes,
    personagens,
    info: { largura: 720, altura: 1280, duracao: 12.21 } as never,
    estilo: input.estilo,
    posicoes: input.pessoas.map((p: { x: number }) => (p.x < 0.36 ? "on the left side of the frame" : p.x > 0.64 ? "on the right side of the frame" : "in the centre of the frame")),
  });
  log.push(`feitos ${JSON.stringify(r.feitos)} em ${Math.round((Date.now() - t0) / 1000)}s`);
  console.warn = warn;
  if (r.imagem) writeFileSync(`${dir}/ancora_nova.jpg`, await sharp(r.imagem).resize(700, 1000, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer());
  writeFileSync(`${dir}/log.txt`, log.join("\n"));
}, 400000);

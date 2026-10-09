/**
 * Mídia da landing page: comprime os vídeos de public/video_lp, gera a capa de
 * cada um em public/lp/capas e envia os vídeos para o S3 (site/lp/…).
 *
 *   node --env-file=.env scripts/lp-midia.mjs            comprime e envia
 *   node --env-file=.env scripts/lp-midia.mjs --sem-envio  só comprime (confere tamanhos)
 *
 * Os originais não são alterados. Rode de novo sempre que trocar um vídeo:
 * a rota /midia-lp/<nome>.mp4 (app/midia-lp) lê do bucket pelo mesmo nome.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import ffmpeg from "ffmpeg-static";
import sharp from "sharp";

const ORIGEM = "public/video_lp";
const CAPAS = "public/lp/capas";
const PREFIXO = "site/lp/";
/** Cartões da parede de reels: 9:16, sem áudio, no máximo 15s. */
const PAREDE = [
  "vid-a",
  "vid-b",
  "vid-c",
  "vid-ze",
  "vr-1",
  "vr-2",
  "vr-3",
  "vr-5",
  "vr-moroni",
];
/** Vídeo que ocupa a tela inteira na seção da tese. */
const TELA_CHEIA = ["arnaldo"];

const semEnvio = process.argv.includes("--sem-envio");
const tmp = mkdtempSync(join(tmpdir(), "lp-midia-"));
mkdirSync(CAPAS, { recursive: true });

function rodar(args) {
  const r = spawnSync(ffmpeg, ["-y", "-loglevel", "error", ...args], {
    stdio: "inherit",
  });
  if (r.status !== 0) throw new Error(`ffmpeg falhou: ${args.join(" ")}`);
}

const BASE = [
  "-an",
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
];

function comprimir(nome, filtro, crf, extra = []) {
  const saida = join(tmp, `${nome}.mp4`);
  rodar([
    "-i",
    join(ORIGEM, `${nome}.mp4`),
    ...extra,
    "-vf",
    filtro,
    ...BASE,
    "-crf",
    String(crf),
    saida,
  ]);
  return saida;
}

async function capa(nome, arquivo, largura) {
  const quadro = join(tmp, `${nome}.png`);
  rodar(["-ss", "0.5", "-i", arquivo, "-frames:v", "1", quadro]);
  await sharp(quadro)
    .resize({ width: largura })
    .webp({ quality: 72 })
    .toFile(join(CAPAS, `${nome}.webp`));
}

const prontos = [];
for (const nome of PAREDE) {
  const arquivo = comprimir(
    nome,
    "scale=480:854:force_original_aspect_ratio=increase,crop=480:854,fps=30",
    28,
    ["-t", "15"],
  );
  await capa(nome, arquivo, 480);
  prontos.push([nome, arquivo]);
}
for (const nome of TELA_CHEIA) {
  const arquivo = comprimir(nome, "scale=1080:-2,fps=30", 27);
  await capa(nome, arquivo, 720);
  prontos.push([nome, arquivo]);
}

const mb = (n) => (n / 1024 / 1024).toFixed(2) + " MB";
for (const [nome, arquivo] of prontos)
  console.log(
    `${nome}.mp4  ${mb(statSync(join(ORIGEM, `${nome}.mp4`)).size)} → ${mb(statSync(arquivo).size)}`,
  );

if (semEnvio) {
  console.log(`\nSem envio. Arquivos em ${tmp}`);
  process.exit(0);
}

const Bucket = process.env.S3_BUCKET?.trim();
if (!Bucket || !process.env.AWS_REGION)
  throw new Error("Faltam S3_BUCKET / AWS_REGION (rode com --env-file=.env).");
const s3 = new S3Client({ region: process.env.AWS_REGION });
for (const [nome, arquivo] of prontos) {
  await s3.send(
    new PutObjectCommand({
      Bucket,
      Key: `${PREFIXO}${nome}.mp4`,
      Body: readFileSync(arquivo),
      ContentType: "video/mp4",
      CacheControl: "public, max-age=31536000",
    }),
  );
  console.log(`enviado  ${PREFIXO}${nome}.mp4`);
}

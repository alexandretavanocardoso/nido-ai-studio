/**
 * Vídeos da landing page. Ficam no S3 (site/lp/<nome>.mp4), enviados por
 * scripts/lp-midia.mjs, e são lidos pela rota /midia-lp/<nome>.mp4.
 */
export const VIDEOS_LP = [
  "arnaldo",
  "vid-a",
  "vid-b",
  "vid-c",
  "vid-ze",
  "vr-1",
  "vr-2",
  "vr-3",
  "vr-5",
  "vr-moroni",
] as const;

export type VideoLp = (typeof VIDEOS_LP)[number];

export const PREFIXO_LP = "site/lp/";

export const videoLp = (nome: VideoLp) => `/midia-lp/${nome}.mp4`;
export const capaLp = (nome: VideoLp) => `/lp/capas/${nome}.webp`;

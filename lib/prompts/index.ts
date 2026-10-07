import type { Character } from "@/lib/types";
import { promptImagem } from "./imagem";
import { promptRoteiro } from "./roteiro";
import { promptVideo } from "./video";

export interface MasterPrompt {
  imagem: string;
  roteiro: string;
  video: string;
}

export function assembleMasterPrompt(c: Character): MasterPrompt {
  return {
    imagem: promptImagem(c),
    roteiro: promptRoteiro(c),
    video: promptVideo(c),
  };
}

export function fullMasterPrompt(c: Character): string {
  const p = assembleMasterPrompt(c);
  return [
    "=== PROMPT MESTRE — IMAGEM ===",
    p.imagem,
    "",
    "=== PROMPT MESTRE — ROTEIRO / TEXTO ===",
    p.roteiro,
    "",
    "=== PROMPT MESTRE — VÍDEO ===",
    p.video,
  ].join("\n");
}

export { promptImagem, promptRoteiro, promptVideo };

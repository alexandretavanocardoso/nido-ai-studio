/**
 * Conjunto de treino da persona: variações do personagem a partir de uma
 * imagem de referência (card ou retrato). O treino precisa de imagens
 * variadas e consistentes — ângulos, expressões, enquadramentos e luzes
 * diferentes, sempre com a mesma identidade.
 */

const BASE =
  "Using the reference image as the definitive identity, generate a new photo of this exact same character. Keep the same face, hair, skin, body, clothing and accessories. Only change what is described below. Single person, no text, no watermark, photographic.";

export const VARIACOES: string[] = [
  "Close-up portrait, front-facing, neutral expression, soft studio light, plain background.",
  "Close-up portrait, three-quarter view to the left, slight smile, window light.",
  "Close-up portrait, three-quarter view to the right, serious expression, warm light.",
  "Profile view (side), looking left, neutral expression, studio light.",
  "Head and shoulders, laughing, outdoor daylight, blurred street background.",
  "Head and shoulders, surprised expression, indoor cafe, shallow depth of field.",
  "Medium shot from the waist up, arms crossed, confident look, city background.",
  "Medium shot, sitting on a chair, relaxed pose, living room, natural light.",
  "Full body, standing, front view, plain studio background.",
  "Full body, walking toward the camera, street at golden hour.",
  "Full body, three-quarter view, leaning on a wall, urban setting.",
  "Close-up, looking up, dramatic side light, dark background.",
  "Head and shoulders, looking over the shoulder, back three-quarter view, evening light.",
  "Medium shot, holding a smartphone taking a selfie, bedroom, soft light.",
  "Medium shot, talking to the camera like a vlog, gesturing with one hand, home office.",
  "Close-up, playful expression, eyebrows raised, bright pastel background.",
  "Medium shot outdoors, park with trees, overcast soft light.",
  "Full body, sitting on stairs, candid moment, afternoon light.",
  "Close-up, calm expression, eyes closed, golden hour backlight.",
  "Medium shot, at a market stall, natural candid photo, daylight.",
  "Head and shoulders, night city lights, bokeh, neon reflections.",
  "Medium shot, at the beach, wind in the hair, bright sun.",
  "Close-up, black and white portrait, high contrast.",
  "Medium shot, cooking in a kitchen, warm indoor light.",
  "Full body, dancing, motion, colorful party lights.",
  "Close-up, thoughtful expression, hand on chin, library background.",
  "Medium shot, in a car passenger seat, daylight through the window.",
  "Head and shoulders, wearing sunglasses pushed up on the head, summer day.",
  "Medium shot, at a gym, energetic expression, bright light.",
  "Close-up, slight frown, rainy window background, cool light.",
];

/** Prompt de uma variação (com a descrição visual da ficha como reforço). */
export function promptVariacao(i: number, descricao: string): string {
  const v = VARIACOES[i % VARIACOES.length];
  return `${BASE}\n\nCHARACTER: ${descricao}\n\nVARIATION: ${v}`;
}

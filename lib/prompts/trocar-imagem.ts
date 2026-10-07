/**
 * Pedido de "troca de pessoa" numa foto: a IA recebe a foto original
 * (IMAGE 1) e a imagem de cada influencer (IMAGE 2, 3…) e troca só as
 * pessoas indicadas — cenário, luz, câmera e o resto da foto ficam iguais.
 */
export type RoupaTroca = "foto" | "personagem";

export interface AlvoImagem {
  /** Descrição da pessoa a trocar (vazio = a pessoa principal). */
  descricao?: string;
  /** Índice da imagem do influencer na lista enviada (2 = IMAGE 2…). */
  imagem: number;
}

export function promptTrocaImagem(o: {
  alvos: AlvoImagem[];
  roupa: RoupaTroca;
}): string {
  const alvos = o.alvos.length ? o.alvos : [{ imagem: 2 }];
  const linhas = alvos.map(
    (a) =>
      `- ${a.descricao?.trim() || "the main person in IMAGE 1"} → becomes the character shown in IMAGE ${a.imagem}.`,
  );
  const deRoupa = o.roupa === "personagem";
  const varias = alvos.length > 1;
  return [
    "Edit IMAGE 1 (the original photo). Replace " +
      (varias ? "the people listed below" : "the person listed below") +
      " with the character(s) from the other image(s). Everything else in IMAGE 1 must stay exactly the same.",
    "",
    "REPLACE",
    ...linhas,
    ...(varias
      ? [
          "Each listed person is a different person; replace each one only with their own character.",
        ]
      : []),
    "",
    "FOR EACH REPLACED PERSON",
    `- From the character image take the identity: face and facial structure, hair, facial hair, skin tone, body type${
      deRoupa ? ", and the character's outfit and accessories" : ""
    }. Keep the character recognizable as the same character.`,
    `- From IMAGE 1 keep: the exact position and scale in the frame, pose, body orientation, head angle, gesture, facial expression${
      deRoupa ? "" : ", clothing and accessories"
    }, and any object the person holds or touches.`,
    ...(deRoupa
      ? []
      : [
          "- Do NOT take the outfit (jacket, shirt, trousers, shoes) from the character image: the body keeps the clothing from IMAGE 1. Head accessories that define the character (hat, glasses) may stay.",
        ]),
    "- Match the lighting, shadows, colour grading, focus and grain of IMAGE 1 so the character looks naturally photographed in that scene.",
    "",
    "STYLE",
    "Keep exactly the visual style of IMAGE 1. If IMAGE 1 is a real photo, the result must be a real photo: render the character photorealistically, as a real person photographed in that scene — never as a cartoon, 3D render or illustration, even if the character image is stylized.",
    "",
    "KEEP UNCHANGED",
    "Background, setting, every other person, objects, text already present in the scene, colours, camera angle, framing, crop, aspect ratio and depth of field.",
    "",
    "REFERENCE IMAGES",
    "The character images are identity references only: do not copy their background, layout, pose or framing. If a character image is a reference sheet with several views, use it only to understand the character.",
    "",
    "Output a single photo with the same composition as IMAGE 1. No added text, labels, borders or watermarks.",
  ].join("\n");
}

/** Tamanho de saída do Seedream (aceita ~3,7–16 MP): ~4 MP na proporção da foto. */
export function tamanhoSeedream(
  largura: number,
  altura: number,
): { width: number; height: number } {
  const escala = Math.sqrt((2048 * 2048) / (largura * altura));
  let w = largura * escala;
  let h = altura * escala;
  const maior = Math.max(w, h);
  if (maior > 4096) {
    w = (w * 4096) / maior;
    h = (h * 4096) / maior;
  }
  const m16 = (n: number) => Math.max(16, Math.round(n / 16) * 16);
  return { width: m16(w), height: m16(h) };
}

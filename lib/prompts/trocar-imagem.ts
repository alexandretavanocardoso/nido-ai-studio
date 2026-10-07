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
      `- ${a.descricao?.trim() || "the main person in IMAGE 1"} → their whole body (head, torso, both arms and both hands) becomes the character shown in IMAGE ${a.imagem}.`,
  );
  const deRoupa = o.roupa === "personagem";
  const varias = alvos.length > 1;
  return [
    "Edit IMAGE 1 (the original photo). Replace " +
      (varias ? "the people listed below" : "the person listed below") +
      " with the character(s) from the other image(s): the whole person — head, torso, arms and hands, including hands in the foreground — becomes the character, with the character's skin tone everywhere. The scene around them stays exactly the same.",
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
    "- Hands and arms: IMAGE 1 only gives their position, pose and grip. Their skin is the character's — exactly the same skin colour and complexion as the character's face. Never copy the original person's hands.",
    `- From IMAGE 1 keep: the exact position and scale in the frame, pose, body orientation, head angle and tilt, gaze direction, gesture, facial expression${
      deRoupa ? "" : ", clothing and accessories"
    }. Objects the person holds or touches stay the same, now held by the character's hands.`,
    "- The head keeps the angle of IMAGE 1: if the person looks down or away, the character looks down or away the same way. Do not turn the face towards the camera.",
    "- Hats and other head accessories of the character are real 3D objects worn on the head: they follow its tilt and perspective and take the scene's light. If one does not fit in the frame, let the frame edge crop it — never flatten it, shrink the person or change the framing to fit it.",
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
    "Output a single photo with the same composition as IMAGE 1, in which every visible part of each replaced person (face, body, arms, hands) is consistently the character. No added text, labels, borders or watermarks.",
  ].join("\n");
}

/**
 * Segunda passada sobre o resultado de uma troca: às vezes as mãos ficam com
 * a pele da pessoa original. Aqui a IA recebe só o resultado e iguala a pele
 * das mãos à do rosto — sem a imagem do personagem, não há o que colar.
 */
export function promptCorrigirPele(): string {
  return [
    "Edit this photo. A person in it has hands or forearms whose skin colour does not match their own face, neck and chest, as if the hands belonged to someone else.",
    "Repaint the skin of those hands and forearms so it has exactly the same skin colour and complexion as that person's face and chest, under the same lighting.",
    "Keep the shape, pose and grip of the hands, and anything they hold or wear (watch, rings). Change nothing else: same face, clothing, background, framing, crop and style.",
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

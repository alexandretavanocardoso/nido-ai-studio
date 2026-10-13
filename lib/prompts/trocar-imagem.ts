/**
 * Pedido de "troca de pessoa" numa foto: a IA recebe a foto original
 * (IMAGE 1) e a imagem de cada influencer (IMAGE 2, 3…) e troca só as
 * pessoas indicadas — cenário, luz, câmera e o resto da foto ficam iguais.
 */
export type RoupaTroca = "foto" | "personagem";

/** O que é trocado: uma pessoa (padrão), um animal ou um objeto. */
export type TipoAlvo = "pessoa" | "animal" | "objeto";

/** Animal ou objeto: as regras de rosto, cabelo, roupa e mãos não valem. */
export function ehCoisa(tipo: TipoAlvo | undefined): boolean {
  return tipo === "animal" || tipo === "objeto";
}

/** Nome do tipo nos pedidos à IA (em inglês). */
export function nomeDoTipo(tipo: TipoAlvo | undefined): string {
  return tipo === "animal" ? "animal" : tipo === "objeto" ? "object" : "person";
}

export interface AlvoImagem {
  /** Descrição da pessoa a trocar (vazio = a pessoa principal). */
  descricao?: string;
  /** Índice da imagem do influencer na lista enviada (2 = IMAGE 2…). */
  imagem: number;
  /** Ausente: pessoa. */
  tipo?: TipoAlvo;
}

export function promptTrocaImagem(o: {
  alvos: AlvoImagem[];
  roupa: RoupaTroca;
  /**
   * Só a cabeça vira o personagem (com o chapéu dele); o corpo e a roupa
   * ficam os da foto. É o quadro-guia da troca em vídeo com a roupa
   * original — sem isto, o tronco e o tipo de corpo do personagem vinham junto.
   */
  soCabeca?: boolean;
  /**
   * Estilo em que a imagem inteira deve ser redesenhada (ex.: anime). É o
   * quadro-guia de um vídeo estilizado. Ausente: mantém o estilo da foto.
   */
  estilo?: string | null;
}): string {
  const alvos = o.alvos.length ? o.alvos : [{ imagem: 2 }];
  // Animal ou objeto marcado: as regras de pessoa (cabeça, pele, roupa) só
  // valem para as pessoas da lista; as coisas têm as regras delas.
  const temCoisa = alvos.some((a) => ehCoisa(a.tipo));
  const temPessoa = alvos.some((a) => !ehCoisa(a.tipo));
  const soCabeca = !!o.soCabeca && temPessoa;
  const linhas = alvos.map((a) =>
    ehCoisa(a.tipo)
      ? `- ${a.descricao?.trim() || `the main ${nomeDoTipo(a.tipo)} in IMAGE 1`} → becomes the ${nomeDoTipo(a.tipo)} shown in IMAGE ${a.imagem}.`
      : soCabeca
        ? `- ${a.descricao?.trim() || "the main person in IMAGE 1"} → ONLY their head becomes the head of the character shown in IMAGE ${a.imagem}; their body and clothes stay as in IMAGE 1.`
        : `- ${a.descricao?.trim() || "the main person in IMAGE 1"} → their whole body (head, torso, both arms and both hands) becomes the character shown in IMAGE ${a.imagem}.`,
  );
  const deRoupa = o.roupa === "personagem";
  const varias = alvos.length > 1;
  return [
    temCoisa
      ? "Edit IMAGE 1 (the original photo). Replace what is listed below with what the other image(s) show. The scene around stays exactly the same."
      : "Edit IMAGE 1 (the original photo). Replace " +
        (varias ? "the people listed below" : "the person listed below") +
        (soCabeca
          ? " with the character(s) from the other image(s), HEAD ONLY: the head becomes the character's head, and the visible skin of the body takes the character's skin tone. The body itself — build, muscles, proportions — and every garment stay exactly as in IMAGE 1. The scene around them stays exactly the same."
          : " with the character(s) from the other image(s): the whole person — head, torso, arms and hands, including hands in the foreground — becomes the character, with the character's skin tone everywhere. The scene around them stays exactly the same."),
    "",
    "REPLACE",
    ...linhas,
    ...(varias
      ? [
          temCoisa
            ? "Each line is a different target; replace each one only with its own image."
            : "Each listed person is a different person; replace each one only with their own character.",
        ]
      : []),
    ...(temPessoa
      ? [
          "",
          "FOR EACH REPLACED PERSON",
          soCabeca
            ? "- From the character image take ONLY the head: face and facial structure, hair, facial hair, hat or headwear, glasses, earrings, and the skin tone. Nothing below the neck comes from the character image: not the body type, chest, muscles or outfit."
            : `- From the character image take the identity: face and facial structure, hair, facial hair, skin tone, body type${
                deRoupa ? ", and the character's outfit and accessories" : ""
              }. Keep the character recognizable as the same character.`,
          "- Nothing of the original person's head remains: no trace of their hair, wig, hat, glasses or facial hair, not even under the character's hat. The head is only the character's.",
          "- Hands and arms: IMAGE 1 only gives their position, pose and grip. Their skin is the character's — exactly the same skin colour and complexion as the character's face. Never copy the original person's hands.",
          `- From IMAGE 1 keep: the exact position and scale in the frame, pose, body orientation, head angle and tilt, gaze direction, gesture, facial expression${
            deRoupa ? "" : ", clothing and accessories"
          }. Objects the person holds or touches stay the same, now held by the character's hands.`,
          "- Redraw the character inside the scene, in the original person's place: same seated or standing posture, same size, and the same parts hidden behind the table, objects or other people. Never paste the character image as it is — its pose, framing and studio lighting do not belong in this scene.",
          "- The head keeps the angle of IMAGE 1: if the person looks down or away, the character looks down or away the same way. Do not turn the face towards the camera.",
          "- Hats and other head accessories of the character are real 3D objects worn on the head: they follow its tilt and perspective and take the scene's light. If one does not fit in the frame, let the frame edge crop it — never flatten it, shrink the person or change the framing to fit it.",
          ...(deRoupa
            ? []
            : [
                soCabeca
                  ? "- Do NOT take the outfit (jacket, shirt, trousers, shoes) from the character image: every garment of IMAGE 1 stays, with the same shape, length and coverage — a shirt stays a shirt covering the same skin. The character's hat or headwear, glasses and earrings come with the head; the original person's own hat or cap is removed."
                  : "- Do NOT take the outfit (jacket, shirt, trousers, shoes) from the character image: the body keeps the clothing from IMAGE 1. Head accessories that define the character (hat, glasses) may stay.",
              ]),
          "- Match the lighting, shadows, colour grading, focus and grain of IMAGE 1 so the character looks naturally photographed in that scene.",
        ]
      : []),
    ...(temCoisa
      ? [
          "",
          "FOR EACH REPLACED ANIMAL OR OBJECT",
          "- From its reference image take what it is: shape, proportions, colours, materials, markings, logos and details. Keep it recognizable as that exact one.",
          "- From IMAGE 1 keep: the exact position and scale in the frame, orientation and perspective; for an animal also the pose and gaze. It rests on the same surface, with the same parts hidden behind people or other objects. Hands that hold or touch it keep their position and grip.",
          "- Nothing of the original remains: no leftover parts, colours, text or logos.",
          "- Redraw it inside the scene. Never paste the reference image as it is — its angle, framing and lighting do not belong in this scene.",
          "- Match the lighting, shadows, reflections, colour grading, focus and grain of IMAGE 1 so it looks naturally photographed in that scene.",
        ]
      : []),
    "",
    "STYLE",
    o.estilo
      ? `Redraw the WHOLE image — the replaced characters, every other person, the background and the objects — as ${o.estilo}. One consistent style across the entire image: not a photo, and not a mix of photo and drawing. Same composition, poses and framing as IMAGE 1.`
      : temPessoa
        ? "Keep exactly the visual style of IMAGE 1. If IMAGE 1 is a real photo, the result must be a real photo: render the character photorealistically, as a real person photographed in that scene — never as a cartoon, 3D render or illustration, even if the character image is stylized or a 3D render. Skin has real texture (pores, small imperfections, natural shine) and takes the colours of the scene's lights; no smooth, waxy or plastic CGI skin."
        : "Keep exactly the visual style of IMAGE 1. If IMAGE 1 is a real photo, the result must be a real photo: the replacement looks really photographed in that scene, with real materials and textures — never a cartoon, 3D render or illustration, even if its reference image is one.",
    "",
    "KEEP UNCHANGED",
    "Background, setting, every other person, objects, text already present in the scene, colours, camera angle, framing, crop, aspect ratio and depth of field. Add no person or object that is not in IMAGE 1, and remove none.",
    "",
    "REFERENCE IMAGES",
    temCoisa
      ? "The other images are references only: do not copy their background, layout, pose or framing. If one is a reference sheet with several views, use it only to understand what it shows."
      : "The character images are identity references only: do not copy their background, layout, pose or framing. If a character image is a reference sheet with several views, use it only to understand the character.",
    "",
    !temPessoa
      ? "Output a single photo with the same composition as IMAGE 1. No added text, labels, borders or watermarks."
      : soCabeca
        ? "Output a single photo with the same composition as IMAGE 1, in which each replaced person has the character's head on their own body and clothes. No added text, labels, borders or watermarks."
        : "Output a single photo with the same composition as IMAGE 1, in which every visible part of each replaced person (face, body, arms, hands) is consistently the character. No added text, labels, borders or watermarks.",
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

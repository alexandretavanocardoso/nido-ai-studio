/**
 * Templates do prompt "Gerar imagem com IA".
 *
 * FLUXO DE CONSISTÊNCIA
 * 1. O card de referência (5 views + closes) é a "fonte de verdade".
 *    Gerado a partir da ficha do personagem ({{descricao}}).
 * 2. O retrato de perfil é derivado DO card: o usuário anexa/cola o
 *    card gerado e o prompt instrui o modelo a replicar o personagem
 *    exatamente. Isso garante 100% de fidelidade entre formatos.
 *
 * Placeholders:
 *   {{nome}}       nome do personagem (ou "the character")
 *   {{descricao}}  descrição vinda da ficha + ideia-livre do usuário
 *   {{negativos}}  negativos extras da ficha (visual.negativos)
 *
 * Editar livremente; qualquer campo novo em data/perguntas.ts que seja
 * visual pode entrar em extractDescricaoVisual (lib/prompts/gerar-imagem.ts).
 */

/* ================================================================== */
/* Shared blocks — identical wording in retrato & referência           */
/* ================================================================== */

const SHARED_CHARACTER = `CHARACTER
{{descricao}}`;

const SHARED_TRAIT = `SIGNATURE EXAGGERATED TRAIT (NON-NEGOTIABLE)
This is NOT a safe, generic, or stock-photo look. The character MUST carry at least one striking, unforgettable visual trait that pushes well beyond everyday realism. Examples: an impossible hair sculpture (towering, geometric, or structural), surreal body proportions (elongated neck, oversized hands, extreme height ratio), a theatrical accessory (giant moustache, oversized hat, ear-protectors, bejeweled collar), an elaborate anachronistic or editorial costume (velvet, brocade, high-fashion runway piece), or an extreme pattern/colour combination.
- If the CHARACTER description above already names such a trait, amplify it to the extreme and make it the focal point.
- If no bizarre trait is named, INVENT one that fits the character's vibe and commit fully. Never default to a normal-looking person.
Intentionally bizarre styling is the point; what keeps it believable is the rendering, not the restraint.`;

const SHARED_FIDELITY = `VISUAL FIDELITY
Every clothing item, accessory, hairstyle, body feature, and colour choice MUST be derived strictly from the CHARACTER description above. Do not invent, swap, or reinterpret garments, accessories, or styling beyond what is described. The only element you may freely invent is the SIGNATURE EXAGGERATED TRAIT when none is specified — everything else must match the description exactly. The character's appearance must be identical whether rendered as a single portrait or a multi-view reference sheet.`;

const SHARED_STYLE = `STYLE
Photoreal with AAA high-fashion editorial polish.
Detailed skin texture with natural micro-pores and visible imperfections.
Realistic fabric with proper weight, drape, and material-specific detail (velvet, wool, brocade, latex, feather, denim).
Hyperreal rendering throughout — the character design can be absurd, the rendering is 100% photographic.`;

const SHARED_AVOID = `AVOID
No safe generic realism, no stock-model look, no beauty-shot sameness, no smiling, no acting pose. No text or logos (unless explicitly on the clothing), no watermark, no extra limbs, no extra fingers, no cartoon or anime styling, no painterly rendering, no blur, no low-res artifacts, no mannequin-blank faces.`;

const SHARED_STUDIO = `STUDIO
Flat neutral backdrop (soft light grey to off-white, with a gentle vignette — editorial studio portrait feel).
Soft diffused key light with subtle fill, even catalog-style illumination.
No harsh shadows, minimal soft contact shadow on floor. 50-85mm equivalent lens, minimal depth of field.`;

const SHARED_POSE_BASE = `POSE
Neutral stance, arms relaxed at the sides, straight posture.
Neutral or slightly serious expression. No smiling, no acting, no dynamic action poses.`;

/* shared Midjourney fragments */
const MJ_TRAIT = `signature exaggerated trait (impossible hair sculpture or theatrical accessory or elaborate anachronistic costume or surreal proportions — if not specified, invent one and commit fully)`;
const MJ_FIDELITY = `every clothing item accessory and colour must match the character description exactly — do not invent or swap garments beyond the signature trait`;
const MJ_STYLE = `intentionally bizarre styling but 100% photographic rendering, think Loewe campaign by Juergen Teller or Comme des Garcons runway or Diane Arbus editorial`;
const MJ_RENDER = `hyperrealistic photoreal, detailed skin texture with pores and imperfections, realistic fabric with material detail (velvet wool brocade latex feather denim)`;
const MJ_AVOID = `safe realism, generic model, stock photo, beauty shot, smiling, acting pose, text, logos, watermark, extra limbs, extra fingers, cartoon, anime, painterly, blur, low-res, mannequin face`;

/* shared Flux fragments */
const FLUX_TRAIT = `Signature exaggerated trait (required): the character must carry at least one striking, intentionally bizarre visual element — impossible hair sculpture, theatrical accessory, elaborate anachronistic costume, surreal body proportion, or extreme pattern/colour. If the description already names one, amplify it to the extreme. If not, invent one and commit fully. Never default to a generic/stock look.`;
const FLUX_FIDELITY_SHEET = `Visual fidelity: every clothing item, accessory, hairstyle, body feature, and colour must match the character description exactly. Do not invent or swap garments beyond the signature trait. Appearance must be identical to a single front portrait of the same character.`;
const FLUX_STYLE = `Style: photoreal with AAA high-fashion editorial polish, detailed skin micro-pores and visible imperfections, realistic fabric with material-specific detail (velvet, wool, brocade, latex, feather, denim). Design can be absurd; rendering is 100% photographic.`;
const FLUX_AVOID = `safe generic realism, stock-model look, beauty-shot sameness, smiling, acting pose, text, logos (unless on clothing), watermark, extra limbs, extra fingers, cartoon, anime, concept-art styling, painterly, blurry, low-res, artifacts, deformed anatomy, mannequin blank face`;

/* ================================================================== */
/* RETRATO DE PERFIL — portrait derived from the reference card       */
/* The user attaches/pastes the card image as visual reference.       */
/* ================================================================== */

export const RETRATO_NEUTRO = `I'm attaching my character's reference card (a 5-view character sheet showing front, ¾, side, ¾ back and back views, plus head closeups). Using that reference card as the DEFINITIVE visual guide, generate a single full-body front-facing portrait of this EXACT same character: {{nome}}.

CRITICAL — VISUAL MATCH
The portrait MUST be a pixel-perfect match to the character in the reference card:
- Same face: identical bone structure, skin tone, expression, facial hair
- Same hair: identical style, colour, volume, direction
- Same clothing: identical garments, colours, patterns, layers, accessories
- Same shoes, props, and every visible detail
Do NOT alter, reinterpret, simplify, or "improve" any visual element. If the card shows a purple velvet suit with an oversized bow tie and a flower in the pocket, the portrait shows exactly that — same shade of purple, same bow tie, same flower.

FRAMING
Single full-body front-facing portrait. Straight-on camera angle at eye level.
50-85mm equivalent lens, shallow depth of field.

${SHARED_STUDIO}

${SHARED_POSE_BASE}
Looking directly at camera.

${SHARED_STYLE}

${SHARED_AVOID}
{{negativos}}
`;

export const RETRATO_MIDJOURNEY = `front-facing full body portrait of the character shown in the attached reference card, {{descricao}}, must match the reference card exactly — same face same hair same clothing same accessories same colors same props, do not alter reinterpret or simplify any visual detail, ${MJ_STYLE}, single portrait, straight-on camera at eye level, neutral grey or soft white studio backdrop with gentle vignette, soft diffused catalog lighting, ${MJ_RENDER}, neutral stance arms at sides, no smiling, looking at camera, 50-85mm lens --cref [cole a URL da imagem do card aqui] --ar 2:3 --style raw --v 6.1 --no ${MJ_AVOID}, different clothing than reference, altered accessories{{negativos}}
`;

export const RETRATO_FLUX = `Positive:
Using the attached character reference card as the definitive visual guide, generate a single front-facing full body portrait of this EXACT same character. The portrait must match the reference card exactly: same face, same hair, same clothing, same accessories, same colors, same props. Do not alter, reinterpret, or simplify any visual element.

Framing: single portrait, straight-on camera at eye level. Neutral grey or soft white studio backdrop with gentle vignette. Soft diffused key light + fill, catalog-style illumination. 50-85mm lens, shallow DOF.

Pose: neutral stance, arms relaxed at sides, straight posture, neutral or slightly serious expression. No smiling, no acting. Looking directly at camera.

${FLUX_STYLE}

Negative:
${FLUX_AVOID}, different clothing than reference, altered accessories, reinterpreted styling{{negativos}}
`;

/* ================================================================== */
/* CARD DE REFERÊNCIA — 5 views + closeups                            */
/* ================================================================== */

export const IMAGEM_NEUTRO = `Character reference sheet of {{nome}}, hyperrealistic character portrait in the style of high-fashion editorial meets surreal character design. Think Loewe campaign by Juergen Teller, Comme des Garçons runway, Diane Arbus editorial — intentionally striking, never generic.

LAYOUT
Top row — 5 full-body views in a horizontal strip, left to right:
1) front view
2) three-quarter front
3) side profile
4) three-quarter back
5) back view
All at the same scale, same eye-level camera height, same lighting.

Thin black dividing line between rows.

Bottom row — 3 to 4 head-and-shoulders closeups at varied angles:
front, three-quarter, profile, and one subtle expression closeup.

${SHARED_STUDIO}

${SHARED_POSE_BASE}
Consistent character identity across every panel — same body, same face, same clothes, same props.

${SHARED_CHARACTER}

${SHARED_TRAIT}

${SHARED_FIDELITY}

${SHARED_STYLE}

${SHARED_AVOID}
No inconsistent character between panels.
{{negativos}}
`;

export const IMAGEM_MIDJOURNEY = `character reference sheet of {{nome}}, {{descricao}}, surreal character portrait meets high-fashion editorial, ${MJ_TRAIT}, ${MJ_FIDELITY}, ${MJ_STYLE}, turnaround model sheet, top row five full body views (front, three-quarter front, side profile, three-quarter back, back view) at same scale and eye-level, thin black divider, bottom row three to four head-and-shoulders closeups at varied angles, neutral grey or soft white studio backdrop with gentle vignette, soft diffused catalog lighting, ${MJ_RENDER}, neutral stance arms at sides, no smiling, consistent character identity across every panel, 50-85mm lens --ar 1:1 --style raw --v 6.1 --no ${MJ_AVOID}, inconsistent character between panels{{negativos}}
`;

export const IMAGEM_FLUX = `Positive:
character reference sheet of {{nome}}, in the vein of high-fashion editorial x surreal character portrait (Loewe by Juergen Teller, Comme des Garcons runway, Diane Arbus). Top row: 5 full-body views (front, 3/4 front, side profile, 3/4 back, back) aligned at same eye-level and scale. Bottom row: 3-4 head-and-shoulders closeups in varied angles. Thin horizontal black divider between rows. Neutral grey or soft white studio backdrop with gentle vignette. Soft diffused key light + fill, catalog-style illumination, minimal contact shadow. 50-85mm lens, minimal DOF.

Pose: neutral stance, arms relaxed at sides, straight posture, neutral or slightly serious expression. No smiling, no acting. Consistent character identity in every panel: same body, same face, same clothes.

Character: {{descricao}}

${FLUX_TRAIT}

${FLUX_FIDELITY_SHEET}

${FLUX_STYLE}

Negative:
${FLUX_AVOID}, inconsistent character between panels{{negativos}}
`;

/* ================================================================== */
/* ESTILO 3D (visual.estilo === "3d")                                 */
/* Trocas aplicadas sobre os templates acima, por formato: os blocos  */
/* de render fotográfico viram render 3D estilo animação.             */
/* ================================================================== */

const STYLE_3D = `STYLE
Stylized 3D character render with feature-animation polish — think high-end animated film or premium collectible figure.
Clean sculpted forms and appealing stylized proportions, subsurface scattering on skin, physically based materials with readable fabric detail (velvet, wool, brocade, latex, feather, denim).
Soft global illumination, crisp silhouette. The character design can be absurd; the render is polished, consistent 3D.`;

const AVOID_3D = `AVOID
No photographic realism, no live-action look, no flat 2D illustration, no anime cel-shading, no painterly rendering. No safe generic design, no smiling, no acting pose. No text or logos (unless explicitly on the clothing), no watermark, no extra limbs, no extra fingers, no blur, no low-res artifacts, no mannequin-blank faces.`;

const MJ_STYLE_3D = `intentionally bizarre styling rendered as a stylized 3D character, feature-animation quality, premium collectible figure look`;
const MJ_RENDER_3D = `stylized 3D render, clean sculpted forms, subsurface scattering skin, physically based materials with readable fabric detail (velvet wool brocade latex feather denim), soft global illumination`;
const MJ_AVOID_3D = `photographic realism, live-action, flat 2D illustration, anime cel-shading, safe generic design, stock look, smiling, acting pose, text, logos, watermark, extra limbs, extra fingers, painterly, blur, low-res, mannequin face`;

const FLUX_STYLE_3D = `Style: stylized 3D character render with feature-animation polish, clean sculpted forms, subsurface scattering on skin, physically based materials with material-specific fabric detail (velvet, wool, brocade, latex, feather, denim), soft global illumination. Design can be absurd; rendering is polished, consistent 3D.`;
const FLUX_AVOID_3D = `photographic realism, live-action look, flat 2D illustration, anime cel-shading, safe generic design, stock look, smiling, acting pose, text, logos (unless on clothing), watermark, extra limbs, extra fingers, painterly, blurry, low-res, artifacts, deformed anatomy, mannequin blank face`;

export const TROCAS_3D: Record<"neutro" | "midjourney" | "flux", Array<[string, string]>> = {
  neutro: [
    [SHARED_STYLE, STYLE_3D],
    [SHARED_AVOID, AVOID_3D],
    ["hyperrealistic character portrait", "stylized 3D character render"],
  ],
  midjourney: [
    [MJ_STYLE, MJ_STYLE_3D],
    [MJ_RENDER, MJ_RENDER_3D],
    [MJ_AVOID, MJ_AVOID_3D],
    [" --style raw", ""], // raw puxa pro fotográfico
  ],
  flux: [
    [FLUX_STYLE, FLUX_STYLE_3D],
    [FLUX_AVOID, FLUX_AVOID_3D],
  ],
};

/**
 * A arte do NFT: o Retrato do personagem redesenhado no estilo da coleção
 * (retrato quadrado, traço de quadrinho, fundo amarelo). É ela que vira a
 * imagem pública do NFT. Compartilhado entre a tela e o servidor.
 */

/** Opções de arte geradas de cada vez: a pessoa escolhe uma para o NFT. */
export const ARTES_POR_VEZ = 5;

/** Créditos de uma geração (as cinco opções; 6 por imagem, como a figurinha). */
export const CREDITOS_ARTE_NFT = 30;

/** Lado da arte guardada, em pixels. */
export const LADO_ARTE = 1024;

/**
 * Instrução do gerador de imagens. Não cita nome de marca nem de coleção: o
 * gerador escreve na imagem o nome que lê aqui (saiu uma etiqueta "MAD LADS"
 * na roupa quando o texto dizia "inspired by Mad Lads").
 * A imagem enviada junto é o Retrato do
 * personagem, usado só como referência de identidade.
 */
export const PROMPT_ARTE_NFT = `Use the uploaded image only as an identity reference for the character. Do not copy the original pose, framing, or background of the source photo.
Create a square 1:1 collectible portrait in a consistent NFT/PFP format, preserving the subject's recognizable identity while translating them into a bold ink-and-cel-shaded editorial illustration with a clean cyberpunk twist.

Composition
- Square 1:1 format
- Bust / half-body portrait
- Character shown in 3/4 view (slightly turned to the side)
- Head subtly turned toward the viewer
- Hands must never appear
- Character should occupy most of the frame
- Clean, centered, highly consistent composition

Identity preservation
Preserve the most recognizable elements from the uploaded image:
- facial structure and overall likeness
- hairstyle, hat, or headwear
- important accessories
- facial makeup, mask, or painted details if present
- distinctive clothing elements, adapted into the illustration language

Visual style
- 2D illustrated portrait
- Collectible PFP illustration look: gritty comic-book inking over flat cel-shaded color
- Blend of anime, western comics, and editorial illustration
- Strong expressive black ink outlines
- Cel shading
- Graphic shadow blocks and subtle hatching
- Slight vintage texture, paper grain, light wear and scratches
- Premium collectible / NFT-quality finish

Aesthetic direction
- Clean cyberpunk visual identity
- Urban / futuristic styling
- Subtle techwear influence
- Controlled neon accents, especially magenta/pink
- Stylish, iconic, visually striking character design
- Keep the result polished and readable, not overly busy

Background
- Minimal, clean, textured background
- Main color: strong yellow
- Inspired by a vintage poster texture
- Subtle grain, scratches, and worn surface details
- No complex scenery
- No extra props unless essential
- Background should support the character, not compete with it
- Full bleed: the yellow background reaches all four edges of the image
- No border, frame, margin, paper edge, or rounded corners around the image

Final result
The final image should look like a consistent NFT collection portrait: clean composition, recognizable identity, bold linework, strong shape design, yellow textured background, and a polished comic-ink + clean cyberpunk finish.

No text
- The image must contain no text at all: no words, letters, numbers, logos, brand names, labels, tags, patches, badges, signatures or watermarks
- Clothing, accessories and background must be free of any writing; if the reference image shows text or a logo, leave that area plain`;

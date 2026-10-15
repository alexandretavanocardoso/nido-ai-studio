import { MODELOS_IMAGEM, type ModeloImagem } from "@/lib/ai/modelos-imagem";
import { creditosImagem } from "@/lib/planos";

/**
 * "Criar produto" (aba da tela /app/produto): a pessoa dá nome, descrição,
 * uma foto básica do produto (ou descreve como ele é) e a logo da empresa; um
 * modelo de imagem cria o produto em 3D nas cores da logo. O produto criado
 * fica salvo (tabela `produtos`) e serve de foto do produto no vídeo, com um
 * personagem ou uma foto avulsa. Compartilhado entre cliente e servidor.
 */

export const NOME_PRODUTO_MAX = 80;
export const DESCRICAO_PRODUTO_MAX = 400;
export const PROMPT_PRODUTO_MAX = 800;
/** Produtos criados mostrados na aba (os mais novos). */
export const PRODUTOS_NA_TELA = 24;

/** Modelos que criam o produto: os de imagem, menos a persona treinada (é de pessoa). */
export type ModeloProduto = Exclude<ModeloImagem, "persona">;
export const MODELOS_PRODUTO = (Object.keys(MODELOS_IMAGEM) as ModeloImagem[]).filter(
  (m): m is ModeloProduto => m !== "persona",
);

/** Escolha da tela: o modelo e, nos que têm, a qualidade (Nano Banana Pro, GPT Image alta). */
export interface OpcaoProduto {
  id: string;
  modelo: ModeloProduto;
  qualidade: "padrao" | "pro";
  label: string;
  nota: string;
}

/** Para que serve cada um aqui (as notas do catálogo de imagem falam de personagem). */
const NOTAS: Record<string, string> = {
  "nano-banana": "Rápido, mantém a forma da foto",
  "nano-banana:pro": "Mais fiel à logo, 2K",
  seedream: "Mais detalhe, 2K",
  flux2: "Acabamento de estúdio",
  "gpt-image": "Escreve bem a logo",
  "gpt-image:pro": "Logo mais nítida, mais caro",
};

export const OPCOES_PRODUTO: OpcaoProduto[] = MODELOS_PRODUTO.flatMap((m) => {
  const info = MODELOS_IMAGEM[m];
  const opcao = (qualidade: "padrao" | "pro"): OpcaoProduto => {
    const id = qualidade === "pro" ? `${m}:pro` : m;
    const label = qualidade === "padrao" ? info.label : m === "nano-banana" ? "Nano Banana Pro" : `${info.label} alta`;
    return { id, modelo: m, qualidade, label, nota: NOTAS[id] ?? info.rotulo };
  };
  return info.temQualidade ? [opcao("padrao"), opcao("pro")] : [opcao("padrao")];
});

export const opcaoProduto = (id: string): OpcaoProduto | undefined => OPCOES_PRODUTO.find((o) => o.id === id);

export const creditosProdutoCriado = (o: Pick<OpcaoProduto, "modelo" | "qualidade">): number =>
  creditosImagem(o.modelo, o.qualidade);

/** Produto criado, como a tela recebe. */
export interface ProdutoCriado {
  id: string;
  nome: string;
  descricao: string;
  imageKey: string;
  modelo: string;
  criadoEm: string;
}

/**
 * Cores do produto: "logo" pinta o produto com as cores da logo; "produto"
 * mantém as cores dele (ex.: a caneca branca continua branca) e só aplica a logo.
 */
export type CoresProduto = "logo" | "produto";

/**
 * Prompt do produto em 3D. As imagens vão nesta ordem: a foto básica (se
 * houver) e a logo por último.
 */
export function promptProdutoCriado(o: {
  nome: string;
  descricao: string;
  /** Como o produto é, quando não há foto básica. */
  prompt?: string;
  temFoto: boolean;
  cores?: CoresProduto;
}): string {
  const daLogo = (o.cores ?? "logo") === "logo";
  const linhas = [
    `PRODUCT 3D RENDER — create one premium 3D render of the product "${o.nome.trim()}".`,
  ];
  if (o.descricao.trim()) linhas.push(`What it is: ${o.descricao.trim()}`);
  if (o.temFoto)
    linhas.push(
      "",
      `BASE PRODUCT — the FIRST attached image is a basic photo of the product. Keep its exact shape, proportions, parts, materials and construction; it must be clearly the same product. ${
        daLogo
          ? "Do not redesign it: only restyle its colours and branding as described below."
          : "Do not redesign or recolour it: only add the logo as described below."
      } Replace any brand marks or labels it has with the company logo.`,
    );
  if (o.prompt?.trim())
    linhas.push("", `PRODUCT DESIGN — ${o.prompt.trim()}`);
  linhas.push(
    "",
    `COMPANY LOGO — the ${o.temFoto ? "LAST" : "attached"} image is the company logo. It is not a product: use it only ${daLogo ? "for the colours and the brand mark" : "as the brand mark"}.`,
    "",
    daLogo
      ? "BRAND COLOURS — build the product's colours only from the logo image: the logo's main colour, its other colours, and the solid background colour the logo sits on (a yellow logo on black means yellow and black). Use the main logo colour for the body, the second brand colour for the large secondary parts (sole, panels, trims, cap) and thin accent colours only on small details. Keep every hue exactly as in the logo (a cyan stays cyan, it does not become blue) and do not introduce any colour that is not in the logo. Realistic materials."
      : `KEEP THE PRODUCT'S OWN COLOURS — do not recolour the product to match the logo. ${
          o.temFoto
            ? "Keep every colour and material exactly as in the basic photo."
            : "Use the colours given in the product description; where none is given, use the product's most usual plain colour (e.g. a white ceramic mug stays white)."
        } The logo is the only thing added.`,
    "",
    daLogo
      ? "LOGO ON THE PRODUCT — apply the logo exactly as in the attached image: same shape, letters and colours, correctly spelled, undistorted, following the surface curvature. Place it where a brand mark naturally goes (front label, side panel, tongue, cap), at a believable size. Once on the visible side."
      : "LOGO ON THE PRODUCT — print the logo on the product exactly as in the attached image: same shape, letters and colours, correctly spelled, undistorted, following the surface curvature, like a real print, engraving or label. Place it where a brand mark naturally goes (front of a mug, chest of a shirt, front label, side panel), at a believable size, once on the visible side. The solid background behind the logo in the file is not printed, unless the logo would not be legible directly on the product: then use it as a small badge behind the logo.",
    "",
    `STYLE — high-end 3D product render (Cinema 4D / Octane / Blender Cycles look), physically based materials, soft studio lighting with gentle reflections and a soft contact shadow. The whole product centred and fully visible with margin around it, three-quarter view, on a seamless background in a light neutral tone that complements the ${daLogo ? "brand colours" : "product"}. Sharp focus. No props, no people, no hands, no packaging unless the product is the packaging.`,
    "",
    "NO OTHER TEXT — apart from the logo, the image has no written text: no captions, titles, watermarks, labels, colour codes or annotations.",
  );
  return linhas.join("\n");
}

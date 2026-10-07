import type { FalClient } from "@fal-ai/client";
import type { ModeloImagem } from "./modelos-imagem";

type ModeloFal = Exclude<ModeloImagem, "nano-banana">;

/** Endpoints do fal: com referências (edit) e só texto (t2i). */
const ENDPOINTS: Record<ModeloFal, { edit: string; t2i: string }> = {
  seedream: {
    edit: "fal-ai/bytedance/seedream/v4.5/edit",
    t2i: "fal-ai/bytedance/seedream/v4.5/text-to-image",
  },
  flux2: { edit: "fal-ai/flux-2-pro/edit", t2i: "fal-ai/flux-2-pro" },
  "gpt-image": { edit: "openai/gpt-image-2/edit", t2i: "openai/gpt-image-2" },
  // Persona treinada (Pro): FLUX.2 [dev] com o LoRA do personagem (com referências = edit).
  persona: { edit: "fal-ai/flux-2/lora/edit", t2i: "fal-ai/flux-2/lora" },
};

/** Persona treinada (Rápido): FLUX.1 [dev] com o LoRA — só texto (o rosto vem do treino). */
const PERSONA_RAPIDA = "fal-ai/flux-lora";
/** ~1 MP (o FLUX.1 cobra por megapixel e foi treinado nessa faixa). */
const TAMANHO_RAPIDA = {
  referencia: { width: 1344, height: 768 },
  retrato: { width: 832, height: 1248 },
};

type Tipo = "referencia" | "retrato";

/**
 * Tamanho de saída por modelo: card 16:9, retrato 2:3.
 *  - Seedream aceita só 2K–4K → usa 4K (é a proposta do modelo).
 *  - Flux.2 cobra por megapixel → ~2 MP.
 *  - GPT Image exige múltiplos de 16.
 */
export function tamanho(
  modelo: ModeloFal,
  tipo: Tipo,
): { width: number; height: number } {
  const t = {
    seedream: { referencia: [3840, 2160], retrato: [2304, 3456] },
    flux2: { referencia: [1920, 1088], retrato: [1088, 1632] },
    persona: { referencia: [1920, 1088], retrato: [1088, 1632] },
    "gpt-image": { referencia: [1536, 864], retrato: [1024, 1536] },
  }[modelo][tipo];
  return { width: t[0], height: t[1] };
}

export function inputFal(o: {
  modelo: ModeloFal;
  tipo: Tipo;
  prompt: string;
  imageUrls: string[];
  qualidade: "padrao" | "pro";
  /** Persona treinada: URL do LoRA, a palavra-gatilho e o modelo do treino. */
  persona?: { loraUrl: string; gatilho: string; base: "flux1" | "flux2" };
}): { endpoint: string; input: Record<string, unknown> } {
  if (o.modelo === "persona" && o.persona?.base === "flux1") {
    return {
      endpoint: PERSONA_RAPIDA,
      input: {
        prompt: `${o.persona.gatilho}, ${o.prompt}`,
        image_size: TAMANHO_RAPIDA[o.tipo],
        loras: [{ path: o.persona.loraUrl, scale: 1 }],
        output_format: "jpeg",
      },
    };
  }
  const comRefs = o.imageUrls.length > 0;
  const input: Record<string, unknown> = {
    // A palavra-gatilho no início do prompt "chama" o personagem treinado.
    prompt: o.persona ? `${o.persona.gatilho}, ${o.prompt}` : o.prompt,
    image_size: tamanho(o.modelo, o.tipo),
    ...(comRefs ? { image_urls: o.imageUrls } : {}),
  };
  if (o.modelo === "flux2") input.output_format = "jpeg";
  if (o.modelo === "persona") {
    if (!o.persona) throw new Error("Persona treinada não encontrada.");
    input.output_format = "jpeg";
    input.loras = [{ path: o.persona.loraUrl, scale: 1 }];
  }
  if (o.modelo === "gpt-image") {
    input.output_format = "jpeg";
    // "alta" pode passar de US$ 0,15 por imagem; o Padrão fica na média.
    input.quality = o.qualidade === "pro" ? "high" : "medium";
  }
  return {
    endpoint: comRefs ? ENDPOINTS[o.modelo].edit : ENDPOINTS[o.modelo].t2i,
    input,
  };
}

/** Gera no fal (espera terminar) e devolve a imagem baixada. */
export async function gerarImagemFal(
  fal: FalClient,
  o: Parameters<typeof inputFal>[0],
): Promise<Buffer> {
  const { endpoint, input } = inputFal(o);
  const res = await fal.subscribe(endpoint, { input });
  const url = (res.data as { images?: Array<{ url?: string }> })?.images?.[0]
    ?.url;
  if (!url) throw new Error("O fal não devolveu imagem.");
  const img = await fetch(url);
  if (!img.ok)
    throw new Error(`Falha ao baixar a imagem gerada (HTTP ${img.status}).`);
  return Buffer.from(await img.arrayBuffer());
}

/** Bloco extra do prompt pro GPT Image escrever um texto na imagem. */
export function blocoTexto(texto: string): string {
  return [
    "",
    "TEXT IN IMAGE",
    `Render this exact text, spelled correctly and clearly legible, integrated naturally into the scene: "${texto.trim()}"`,
    "This text is the only exception to the AVOID rules about text.",
  ].join("\n");
}

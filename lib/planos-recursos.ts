import { idiomaAtual } from "@/lib/i18n/tx";
import { PLANOS, type PlanoPago } from "@/lib/planos";

/** O que cada plano pago inclui, em frases, no idioma ativo. Usado na tela de planos e na landing page. */
export function recursosDoPlano(id: PlanoPago): string[] {
  const p = PLANOS[id];
  const en = idiomaAtual() === "en";
  const { imagens, videos } = p.simultaneas;
  const modelosVideo =
    p.criarVideo.length === 1
      ? "Gen-4 Turbo"
      : en
        ? "Gen-4 Turbo, Gen-4.5 and Veo"
        : "Gen-4 Turbo, Gen-4.5 e Veo";
  if (en)
    return [
      `${p.personagens} characters`,
      p.qualidadePro
        ? "All image models, including Pro"
        : "Nano Banana, Seedream, Flux.2 and GPT Image",
      p.troca
        ? `Swap the person in a video (keeps scene and audio) up to ${p.troca.segundosMax}s`
        : "",
      p.trocaPremium
        ? "Premium swap (Seedance 2.5): up to 30s at once, more faithful scene"
        : "",
      p.criarVideo.length
        ? `Create video: ${modelosVideo}${p.veoComAudio ? " (with audio)" : ""}`
        : "",
      "Edit video captions",
      "Post and schedule on Instagram, TikTok, YouTube, X and LinkedIn",
      p.rollover ? "Unused credits roll over to the next month" : "",
      `${p.armazenamentoGB} GB of storage`,
      `Up to ${imagens} ${imagens === 1 ? "image" : "images"} and ${videos} ${videos === 1 ? "video" : "videos"} generating at once`,
    ].filter(Boolean);
  return [
    `${p.personagens} personagens`,
    p.qualidadePro
      ? "Todos os modelos de imagem, inclusive Pro"
      : "Nano Banana, Seedream, Flux.2 e GPT Image",
    p.troca
      ? `Trocar pessoa em vídeo (mantém cenário e áudio) até ${p.troca.segundosMax}s`
      : "",
    p.trocaPremium
      ? "Troca Premium (Seedance 2.5): até 30s de uma vez, cenário mais fiel"
      : "",
    p.criarVideo.length
      ? `Criar vídeo: ${modelosVideo}${p.veoComAudio ? " (com áudio)" : ""}`
      : "",
    "Editar legenda de vídeo",
    "Publicar e agendar no Instagram, TikTok, YouTube, X e LinkedIn",
    p.rollover ? "Créditos que sobram passam pro mês seguinte" : "",
    `${p.armazenamentoGB} GB de armazenamento`,
    `Até ${imagens} ${imagens === 1 ? "imagem" : "imagens"} e ${videos} ${videos === 1 ? "vídeo" : "vídeos"} gerando ao mesmo tempo`,
  ].filter(Boolean);
}

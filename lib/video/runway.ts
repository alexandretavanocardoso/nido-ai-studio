import RunwayML from "@runwayml/sdk";
import type { EstadoVideo } from "./jobs";
import type { ModeloCriar } from "./precos";

/**
 * Runway (API de desenvolvedor, cobrada à parte da assinatura do app).
 *  - image-to-video (Gen-4 Turbo, Gen-4.5, Veo 3.1 Fast): cria um vídeo novo
 *    a partir da imagem do personagem e de um texto.
 * Server-side apenas. Chave em RUNWAYML_API_SECRET.
 */
let client: RunwayML | null = null;

export function getRunway(): RunwayML | null {
  const apiKey = process.env.RUNWAYML_API_SECRET?.trim();
  if (!apiKey) return null;
  if (!client) client = new RunwayML({ apiKey });
  return client;
}

export async function enviarCriacao(
  rw: RunwayML,
  input: {
    modelo: ModeloCriar;
    imageUrl: string;
    promptText: string;
    vertical: boolean;
    duracao: number;
    audio: boolean;
  }
): Promise<string> {
  const promptText = input.promptText.slice(0, 1000);
  const promptImage = input.imageUrl;
  let task: { id: string };
  if (input.modelo === "veo3.1_fast") {
    task = await rw.imageToVideo.create({
      model: "veo3.1_fast",
      promptImage,
      promptText,
      ratio: input.vertical ? "720:1280" : "1280:720",
      duration: input.duracao as 4 | 6 | 8,
      audio: input.audio,
    });
  } else if (input.modelo === "gen4.5") {
    task = await rw.imageToVideo.create({
      model: "gen4.5",
      promptImage,
      promptText,
      ratio: input.vertical ? "720:1280" : "1280:720",
      duration: input.duracao,
    });
  } else {
    task = await rw.imageToVideo.create({
      model: "gen4_turbo",
      promptImage,
      promptText,
      ratio: input.vertical ? "720:1280" : "1280:720",
      duration: input.duracao,
    });
  }
  return task.id;
}

export async function consultarRunway(rw: RunwayML, taskId: string): Promise<EstadoVideo> {
  const t = await rw.tasks.retrieve(taskId);
  switch (t.status) {
    case "PENDING":
    case "THROTTLED":
      return { estado: "na_fila" };
    case "RUNNING":
      return { estado: "processando", progresso: t.progress };
    case "SUCCEEDED":
      return t.output[0]
        ? { estado: "concluido", videoUrl: t.output[0] }
        : { estado: "erro", mensagem: "O Runway não devolveu vídeo." };
    case "FAILED":
      return { estado: "erro", mensagem: traduzirFalha(t.failure, t.failureCode) };
    default:
      return { estado: "erro", mensagem: "Geração cancelada no Runway." };
  }
}

function traduzirFalha(failure: string, code?: string): string {
  if (code?.startsWith("SAFETY")) return "O Runway bloqueou a geração pela moderação de conteúdo.";
  if (code?.startsWith("INPUT_PREPROCESSING")) return `O Runway não aceitou a entrada: ${failure}`;
  return `O Runway falhou: ${failure}`;
}

export function mensagemDeErroRunway(e: unknown): string {
  if (e instanceof RunwayML.APIError) {
    if (e.status === 401) return "Chave do Runway inválida. Confira RUNWAYML_API_SECRET.";
    if (e.status === 402 || /credit/i.test(e.message)) return "Sem créditos na API do Runway. Adicione saldo em dev.runwayml.com.";
    if (e.status === 400) return `O Runway recusou a entrada: ${e.message}`;
    if (e.status === 429) return "Limite de uso do Runway atingido. Tente em alguns minutos.";
    return `Falha no Runway (HTTP ${e.status}).`;
  }
  return (e as Error)?.message || "Falha no Runway.";
}

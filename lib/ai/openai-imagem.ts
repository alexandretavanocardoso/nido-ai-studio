/**
 * GPT Image direto na API da OpenAI (sem passar pelo fal). Usado quando há
 * OPENAI_API_KEY; sem ela, o modelo "gpt-image" continua indo pelo fal.
 * Server-side apenas.
 */

const MODELO = () => process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2";

export function getOpenAIKey(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

type Tipo = "referencia" | "retrato";

/** Mesmos tamanhos usados no fal: card 16:9, retrato 2:3 (múltiplos de 16). */
const TAMANHO: Record<Tipo, string> = {
  referencia: "1536x864",
  retrato: "1024x1536",
};

/** Erro da OpenAI já com a mensagem em português pra mostrar na tela. */
export class OpenAIImagemError extends Error {
  constructor(
    message: string,
    /** A OpenAI recusou o conteúdo (moderação) — não é falha do serviço. */
    public bloqueado = false,
  ) {
    super(message);
  }
}

function mensagemDeErro(
  status: number,
  erro: { message?: string; code?: string | null; type?: string } | undefined,
): OpenAIImagemError {
  const code = erro?.code ?? "";
  const msg = erro?.message ?? "";
  if (code === "moderation_blocked" || /safety system|content policy/i.test(msg))
    return new OpenAIImagemError(
      "A OpenAI recusou esta imagem pelas regras de conteúdo. Ajuste a descrição e tente de novo.",
      true,
    );
  if (status === 401)
    return new OpenAIImagemError(
      "Chave da OpenAI inválida. Confira OPENAI_API_KEY.",
    );
  if (code === "insufficient_quota" || code === "billing_hard_limit_reached")
    return new OpenAIImagemError(
      "Sem créditos na OpenAI. Adicione saldo na conta.",
    );
  if (status === 403 || /must be verified/i.test(msg))
    return new OpenAIImagemError(
      "A conta da OpenAI não tem acesso ao GPT Image (verifique a organização no painel da OpenAI).",
    );
  if (status === 429)
    return new OpenAIImagemError(
      "A OpenAI está limitando os pedidos. Tente de novo em instantes.",
    );
  return new OpenAIImagemError(
    `Falha na OpenAI (HTTP ${status})${msg ? `: ${msg}` : "."}`,
  );
}

/** Gera a imagem (com referências = edição) e devolve o JPEG. */
export async function gerarImagemOpenAI(o: {
  tipo: Tipo;
  prompt: string;
  referencias: Array<{ mimeType: string; data: Buffer }>;
  qualidade: "padrao" | "pro";
}): Promise<Buffer> {
  const key = getOpenAIKey();
  if (!key) throw new OpenAIImagemError("OPENAI_API_KEY não configurada.");

  const campos = {
    model: MODELO(),
    prompt: o.prompt,
    size: TAMANHO[o.tipo],
    // "alta" pode passar de US$ 0,15 por imagem; o Padrão fica na média.
    quality: o.qualidade === "pro" ? "high" : "medium",
    output_format: "jpeg",
  };

  let res: Response;
  if (o.referencias.length > 0) {
    const form = new FormData();
    for (const [k, v] of Object.entries(campos)) form.append(k, v);
    o.referencias.forEach((r, i) =>
      form.append(
        "image[]",
        new Blob([new Uint8Array(r.data)], { type: r.mimeType }),
        `ref-${i}.${r.mimeType.split("/")[1]}`,
      ),
    );
    res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } else {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(campos),
    });
  }

  const json = (await res.json().catch(() => null)) as {
    data?: Array<{ b64_json?: string }>;
    error?: { message?: string; code?: string | null; type?: string };
  } | null;
  if (!res.ok) throw mensagemDeErro(res.status, json?.error);
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new OpenAIImagemError("A OpenAI não devolveu imagem.");
  return Buffer.from(b64, "base64");
}

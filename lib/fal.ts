import { ApiError, createFalClient, type FalClient } from "@fal-ai/client";

/** Cliente do fal.ai (imagem e vídeo usam a mesma chave). Server-side apenas. */
let client: FalClient | null = null;

export function getFal(): FalClient | null {
  const key = process.env.FAL_KEY?.trim();
  if (!key) return null;
  if (!client) client = createFalClient({ credentials: key });
  return client;
}

/** Mensagem em português para erros do fal (chave, créditos, entrada recusada). */
export function mensagemDeErro(e: unknown): string {
  if (e instanceof ApiError) {
    // Conta do fal sem saldo responde 403 ("User is locked. Reason: Exhausted balance"), não 402.
    const semSaldo =
      e.status === 402 || (e.status === 403 && /exhausted balance|user is locked/i.test(JSON.stringify(e.body ?? "")));
    if (semSaldo) return "Sem créditos no fal.ai. Adicione saldo na conta.";
    if (e.status === 401 || e.status === 403) return "Chave do fal inválida ou sem permissão. Confira FAL_KEY.";
    if (e.status === 422) {
      const body = e.body as { detail?: Array<{ msg?: string }> | string };
      const det = Array.isArray(body?.detail) ? body.detail.map((d) => d.msg).join("; ") : body?.detail;
      // Seedance bloqueia vídeos/imagens com rosto de pessoa real reconhecível.
      if (det && /likeness|real people|private information/i.test(det))
        return "O motor Premium (Seedance) recusa vídeos em que aparece o rosto de uma pessoa real. Use o motor Padrão (Kling O3) para este vídeo.";
      return `O fal recusou a entrada${det ? `: ${det}` : "."}`;
    }
    return `Falha no fal.ai (HTTP ${e.status}).`;
  }
  return (e as Error)?.message || "Falha no fal.ai.";
}

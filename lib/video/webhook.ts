import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Webhook dos serviços de vídeo (fal.ai). A URL leva o id do job e um token
 * HMAC — o webhook só serve de "gatilho": a finalização sempre confere o
 * estado direto na API do serviço, então não confiamos no corpo recebido.
 */

/** URL pública do app (webhook só funciona com domínio https acessível de fora). */
export function urlPublica(): string | null {
  const u = process.env.BETTER_AUTH_URL?.trim().replace(/\/$/, "");
  if (!u || !u.startsWith("https://") || /localhost|127\.0\.0\.1/.test(u)) return null;
  return u;
}

function token(jobId: string): string {
  return createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "")
    .update(`webhook:${jobId}`)
    .digest("hex")
    .slice(0, 32);
}

/** URL de webhook do job, ou undefined em dev (localhost não recebe chamadas de fora). */
export function webhookUrl(jobId: string): string | undefined {
  const base = urlPublica();
  return base ? `${base}/api/videos/webhook?job=${encodeURIComponent(jobId)}&t=${token(jobId)}` : undefined;
}

export function tokenValido(jobId: string, t: string | null): boolean {
  if (!t || !process.env.BETTER_AUTH_SECRET) return false;
  const a = Buffer.from(token(jobId));
  const b = Buffer.from(t);
  return a.length === b.length && timingSafeEqual(a, b);
}

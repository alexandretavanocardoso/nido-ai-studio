import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth/server";
import { armazenamentoOuResponder, somarArmazenamento } from "@/lib/limites";
import { STORAGE_KINDS } from "@/lib/storage/env";
import { getS3, newKey, presignPut } from "@/lib/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  kind: z.enum(["refs", "videos", "audios"]),
  contentType: z.string(),
  size: z.number().int().positive(),
});

/**
 * POST — devolve uma URL pré-assinada pro navegador enviar o arquivo
 * direto ao S3 (sem passar pela Vercel, que limita requests a 4,5 MB).
 */
export async function POST(req: Request) {
  const s3 = getS3();
  if (!s3)
    return NextResponse.json(
      { error: "Armazenamento não configurado.", code: "CONFIG_MISSING" },
      { status: 500 },
    );
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json(
      {
        error: "Entre na sua conta para enviar arquivos.",
        code: "UNAUTHORIZED",
      },
      { status: 401 },
    );

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Corpo inválido.", code: "BAD_INPUT" },
      { status: 400 },
    );
  const { kind, contentType, size } = parsed.data;

  const rules = STORAGE_KINDS[kind];
  if (!(rules.types as readonly string[]).includes(contentType))
    return NextResponse.json(
      { error: `Formato não aceito: ${contentType}.`, code: "BAD_INPUT" },
      { status: 400 },
    );
  if (size > rules.maxBytes)
    return NextResponse.json(
      {
        error: `Arquivo maior que ${Math.round(rules.maxBytes / 1024 / 1024)} MB.`,
        code: "BAD_INPUT",
      },
      { status: 400 },
    );

  // Cota de armazenamento do plano.
  const semEspaco = await armazenamentoOuResponder(userId, size);
  if (semEspaco) return semEspaco;

  const key = newKey(userId, kind, contentType);
  const url = await presignPut(s3, key, contentType, size);
  await somarArmazenamento(userId, size); // otimista; o recálculo periódico corrige se o envio falhar
  return NextResponse.json({ key, url });
}

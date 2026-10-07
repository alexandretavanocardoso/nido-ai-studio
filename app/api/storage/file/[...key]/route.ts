import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/server";
import { getS3, ownsKey, presignGet } from "@/lib/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — lê um arquivo do bucket privado: confere se a key é da conta
 * logada e redireciona pra uma URL pré-assinada (válida por 1h). Assim
 * `<img src="/api/storage/file/...">` e `<video>` funcionam direto.
 * `?baixar=nome.jpg` força o download com esse nome (em vez de abrir na aba).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const s3 = getS3();
  if (!s3)
    return new NextResponse("Armazenamento não configurado.", { status: 404 });
  const userId = await getUserId();
  if (!userId) return new NextResponse("Não autorizado.", { status: 401 });

  const key = (await params).key.join("/");
  if (!ownsKey(userId, key))
    return new NextResponse("Não encontrado.", { status: 404 });

  const baixar =
    new URL(req.url).searchParams.get("baixar")?.slice(0, 120) || undefined;
  const url = await presignGet(s3, key, 3600, baixar);
  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": baixar ? "no-store" : "private, max-age=3000" },
  });
}

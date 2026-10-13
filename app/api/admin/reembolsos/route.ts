import { NextResponse } from "next/server";
import { adminOuResponder } from "@/lib/admin/acesso";
import { getS3 } from "@/lib/storage/s3";
import { listarReembolsos } from "@/lib/video/reembolso-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?status= — pedidos de reembolso de vídeo, mais recentes primeiro (só admin). */
export async function GET(req: Request) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json(
    await listarReembolsos(
      getS3(),
      new URL(req.url).searchParams.get("status") ?? undefined,
    ),
  );
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { adminOuResponder } from "@/lib/admin/acesso";
import {
  atualizarFornecedor,
  FornecedorError,
  gerarAbordagem,
} from "@/lib/fornecedores/server";
import { ANOTACOES_MAX, STATUS_FORNECEDOR } from "@/lib/fornecedores/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Acao = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("status"), status: z.enum(STATUS_FORNECEDOR) }),
  z.object({
    acao: z.literal("anotacoes"),
    anotacoes: z.string().max(ANOTACOES_MAX),
  }),
  z.object({ acao: z.literal("abordagem"), idioma: z.enum(["en", "zh"]) }),
]);

/**
 * POST — muda o status, guarda as anotações ou escreve o rascunho de abordagem
 * de um fornecedor. Devolve a ficha atualizada (só admin).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const parsed = Acao.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const { id } = await params;
  const a = parsed.data;
  try {
    return NextResponse.json(
      a.acao === "abordagem"
        ? await gerarAbordagem(id, a.idioma)
        : await atualizarFornecedor(
            id,
            a.acao === "status"
              ? { status: a.status }
              : { anotacoes: a.anotacoes },
          ),
    );
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: e instanceof FornecedorError ? 400 : 500 },
    );
  }
}

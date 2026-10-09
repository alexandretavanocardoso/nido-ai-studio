import { z } from "zod";
import { ErroDaFerramenta } from "./ferramentas";
import { ferramentaPorNome, TODAS } from "./todas";

/**
 * Servidor MCP mínimo, só com ferramentas, no transporte "Streamable HTTP"
 * sem sessão: cada POST traz uma mensagem JSON-RPC (ou um lote) e recebe a
 * resposta em JSON. Não há stream do servidor para o cliente (GET responde
 * 405), que é opcional no protocolo.
 */
const VERSOES = ["2025-06-18", "2025-03-26", "2024-11-05"];

export const INFO_DO_SERVIDOR = { name: "nido-ai-studio", version: "1.0.0" };

const INSTRUCOES = [
  "NIDO AI Studio: cria e opera influenciadores virtuais (personagens).",
  "Comece por listar_personagens. Use ver_personagem para achar imagens, vozes e roteiros salvos.",
  "As ferramentas de geração gastam créditos da conta: diga o custo e confirme com a pessoa antes de chamar. Use saldo para ver quanto resta.",
  "Vídeos são assíncronos: as ferramentas de vídeo devolvem um job_id; consulte status_do_video até terminar.",
  "Publicar nas redes é público e definitivo: confirme texto, redes e horário com a pessoa antes.",
  "Para escolher pessoas num vídeo, olhe o quadro com ver_quadro_do_video e passe as posições em frações (0 a 1).",
].join("\n");

interface Mensagem {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

type Resposta =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | {
      jsonrpc: "2.0";
      id: string | number | null;
      error: { code: number; message: string };
    };

const erro = (
  id: Mensagem["id"],
  code: number,
  message: string,
): Resposta => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** Lista de ferramentas no formato do protocolo (o esquema de entrada sai do zod). */
export function listaDeFerramentas() {
  return TODAS.map((f) => ({
    name: f.name,
    description: f.description,
    inputSchema: z.toJSONSchema(f.entrada, { io: "input" }),
  }));
}

/** Trata uma mensagem. Null = notificação (não tem resposta). */
export async function tratarMensagem(
  m: Mensagem,
  ctx: { userId: string; req: Request },
): Promise<Resposta | null> {
  if (m?.jsonrpc !== "2.0" || typeof m.method !== "string")
    return erro(m?.id, -32600, "Mensagem JSON-RPC inválida.");
  // Notificações (sem id) não têm resposta: initialized, cancelled…
  if (m.id === undefined || m.id === null) return null;
  const ok = (result: unknown): Resposta => ({
    jsonrpc: "2.0",
    id: m.id!,
    result,
  });

  switch (m.method) {
    case "initialize": {
      const pedida = String(m.params?.protocolVersion ?? "");
      return ok({
        protocolVersion: VERSOES.includes(pedida) ? pedida : VERSOES[0],
        capabilities: { tools: {} },
        serverInfo: INFO_DO_SERVIDOR,
        instructions: INSTRUCOES,
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: listaDeFerramentas() });
    case "tools/call": {
      const f = ferramentaPorNome(String(m.params?.name ?? ""));
      if (!f) return erro(m.id, -32602, "Ferramenta desconhecida.");
      const args = f.entrada.safeParse(m.params?.arguments ?? {});
      // Erro de uso da ferramenta volta como resultado (isError): assim o
      // Claude lê a mensagem e pode corrigir a chamada.
      const falha = (texto: string) =>
        ok({ content: [{ type: "text", text: texto }], isError: true });
      if (!args.success)
        return falha(
          `Argumentos inválidos: ${args.error.issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`).join("; ")}`,
        );
      try {
        const resultado = await f.executar({
          userId: ctx.userId,
          args: args.data,
          req: ctx.req,
        });
        // `_imagem` no resultado vira uma imagem que o Claude enxerga (ex.: um quadro do vídeo).
        const { _imagem, ...dados } = (
          resultado && typeof resultado === "object" ? resultado : { resultado }
        ) as Record<string, unknown> & {
          _imagem?: { data: string; mimeType: string };
        };
        return ok({
          content: [
            { type: "text", text: JSON.stringify(dados, null, 2) },
            ...(_imagem ? [{ type: "image", ..._imagem }] : []),
          ],
        });
      } catch (e) {
        if (e instanceof ErroDaFerramenta) return falha(e.message);
        console.error("[mcp]", f.name, e);
        return falha("Falha interna ao executar a ferramenta. Tente de novo.");
      }
    }
    default:
      return erro(m.id, -32601, `Método não suportado: ${m.method}`);
  }
}

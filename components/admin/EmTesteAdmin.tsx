"use client";

import { useEffect, useState } from "react";
import { Loader2, Lock, LockOpen } from "lucide-react";
import type { RecursoAdmin } from "@/lib/admin/em-teste-server";
import { cn } from "@/lib/cn";
import { SOBRE_O_RECURSO, type RecursoEmTeste } from "@/lib/em-teste";
import { confirmar } from "@/components/ui/Confirmacao";
import { diaHora, Estado, Secao, Selo, useAdmin } from "./partes";

/**
 * Aba "Em teste": cada recurso que ainda não foi aberto a todos, com um botão
 * para liberar (todas as contas passam a ver e usar) ou fechar de novo (só
 * admin). Vale para as telas e para as rotas, sem precisar de deploy.
 */
export function EmTesteAdmin() {
  const { dados, erro, carregando } = useAdmin<{ itens: RecursoAdmin[] }>(
    "/api/admin/em-teste",
  );
  const [itens, setItens] = useState<RecursoAdmin[] | null>(null);
  const [mudando, setMudando] = useState<RecursoEmTeste | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  useEffect(() => {
    if (dados) setItens(dados.itens);
  }, [dados]);

  async function mudar(item: RecursoAdmin) {
    const sobre = SOBRE_O_RECURSO[item.recurso];
    const liberar = item.soAdmin;
    const ok = await confirmar({
      titulo: liberar
        ? `Liberar “${sobre.titulo}” para todos?`
        : `Fechar “${sobre.titulo}”?`,
      mensagem: liberar
        ? "Todas as contas passam a ver e usar este recurso. Você pode fechar de novo quando quiser."
        : "Só as contas admin continuam vendo e usando. Quem já estava usando perde o acesso — as telas somem e as rotas recusam.",
      confirmar: liberar ? "Liberar para todos" : "Deixar só para admin",
      tom: liberar ? undefined : "perigo",
    });
    if (!ok) return;
    setFalha(null);
    setMudando(item.recurso);
    try {
      const res = await fetch("/api/admin/em-teste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recurso: item.recurso, soAdmin: !item.soAdmin }),
      });
      const b = (await res.json().catch(() => ({}))) as {
        itens?: RecursoAdmin[];
        error?: string;
      };
      if (!res.ok || !b.itens)
        return setFalha(b.error ?? `Não deu para salvar (HTTP ${res.status}).`);
      setItens(b.itens);
    } catch (e) {
      setFalha((e as Error).message);
    } finally {
      setMudando(null);
    }
  }

  return (
    <div className="grid gap-6 min-w-0">
      <Secao
        titulo="Recursos em teste"
        descricao="Fechado, só as contas admin veem e usam. Liberado, vale para todas as contas — nas telas e no servidor. A mudança entra em poucos segundos; quem está com o app aberto vê ao recarregar a página."
      >
        {falha ? (
          <div className="rounded-xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink">
            {falha}
          </div>
        ) : null}
        {!itens ? (
          <Estado
            carregando={carregando}
            erro={erro}
            vazio={false}
            textoVazio=""
          />
        ) : (
          <ul className="grid gap-3">
            {itens.map((item) => {
              const sobre = SOBRE_O_RECURSO[item.recurso];
              const ocupado = mudando === item.recurso;
              return (
                <li
                  key={item.recurso}
                  className="card p-4 sm:p-5 flex flex-wrap items-start gap-4"
                >
                  <div className="min-w-0 flex-1 basis-64">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15px] font-bold text-ink">
                        {sobre.titulo}
                      </h3>
                      <Selo tom={item.soAdmin ? "neutro" : "ok"}>
                        {item.soAdmin ? (
                          <Lock className="h-3 w-3" />
                        ) : (
                          <LockOpen className="h-3 w-3" />
                        )}
                        {item.soAdmin ? "Só admin" : "Liberado para todos"}
                      </Selo>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink-mute">
                      {sobre.descricao}
                    </p>
                    <p className="mt-2 text-[11px] text-ink-dim">
                      {item.atualizadoEm
                        ? `Mudado em ${diaHora(item.atualizadoEm)}${item.atualizadoPor ? ` por ${item.atualizadoPor}` : ""}`
                        : "Nunca mudado pela tela: vale o padrão do código."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => mudar(item)}
                    disabled={ocupado || mudando !== null}
                    className={cn(
                      "inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[13px] font-bold transition disabled:opacity-50",
                      item.soAdmin
                        ? "bg-accent text-bg hover:brightness-110"
                        : "border border-line text-ink hover:border-pink hover:text-pink",
                    )}
                  >
                    {ocupado ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : item.soAdmin ? (
                      <LockOpen className="h-4 w-4" />
                    ) : (
                      <Lock className="h-4 w-4" />
                    )}
                    {item.soAdmin ? "Liberar para todos" : "Deixar só para admin"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Secao>
    </div>
  );
}

"use client";

import { create } from "zustand";
import { avisarCreditos } from "@/components/creditos/CreditosProvider";

/**
 * Pagamentos em USDC que saíram da carteira conectada. O app confere cada um
 * no servidor (com o hash que a carteira devolveu) até a rede confirmar —
 * mesmo com o modal fechado ou a página recarregada: a lista fica neste
 * navegador.
 */
export interface Enviado {
  /** Id da cobrança. */
  id: string;
  /** Hash da transação (assinatura, na Solana). */
  tx: string;
  desde: number;
  pago?: boolean;
  /** A rede recusou a transação (em português; a tela traduz). */
  erro?: string;
}

const CHAVE = "nido:usdc-enviados";
/** O que foi enviado há mais que isso não é retomado na visita seguinte. */
const VALIDADE_MS = 48 * 3600_000;
/** Tempo, desde o envio, que o app insiste antes de dar o pagamento por não confirmado. */
const INSISTE_MS = 30 * 60_000;

const useEnviados = create<{ enviados: Record<string, Enviado> }>(() => ({
  enviados: {},
}));

/** O pagamento enviado desta cobrança, se houver. */
export const useEnviado = (id: string | undefined) =>
  useEnviados((s) => (id ? s.enviados[id] : undefined));

/** Há outro pagamento enviado que a rede ainda não confirmou (fora o da cobrança `menos`)? */
export const useOutroEnviado = (menos: string | undefined) =>
  useEnviados((s) =>
    Object.values(s.enviados).some((e) => e.id !== menos && !e.pago && !e.erro),
  );

/** A carteira já enviou o pagamento desta cobrança e a rede ainda não respondeu? */
export function aguardandoRede(id: string): boolean {
  const e = useEnviados.getState().enviados[id];
  return !!e && !e.pago && !e.erro;
}

function guardar(e: Enviado) {
  const enviados = { ...useEnviados.getState().enviados, [e.id]: e };
  useEnviados.setState({ enviados });
  try {
    // Só o que ainda falta confirmar precisa sobreviver à página.
    localStorage.setItem(
      CHAVE,
      JSON.stringify(Object.values(enviados).filter((x) => !x.pago && !x.erro)),
    );
  } catch {
    // sem armazenamento: o acompanhamento vale até recarregar a página
  }
}

/** A carteira enviou o pagamento da cobrança `id`: acompanha até confirmar. */
export function acompanharPagamento(id: string, tx: string): void {
  const e = { id, tx, desde: Date.now() };
  guardar(e);
  void seguir(e);
}

let retomado = false;

/** Volta a acompanhar o que ficou sem confirmar na última visita. Uma vez por página. */
export function retomarPagamentos(): void {
  if (retomado || typeof window === "undefined") return;
  retomado = true;
  let salvos: Enviado[] = [];
  try {
    const b = JSON.parse(localStorage.getItem(CHAVE) ?? "[]") as unknown;
    if (Array.isArray(b))
      salvos = (b as Enviado[]).filter(
        (e) =>
          e &&
          typeof e.id === "string" &&
          typeof e.tx === "string" &&
          Date.now() - e.desde < VALIDADE_MS,
      );
  } catch {
    // lista ilegível: nada a retomar
  }
  for (const e of salvos) {
    guardar(e);
    void seguir(e);
  }
}

type Resposta = "pago" | "pendente" | { erro: string };

async function consultar(e: Enviado): Promise<Resposta> {
  try {
    const r = await fetch(`/api/pagamentos/usdc/${e.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tx: e.tx }),
    });
    const b = (await r.json()) as {
      status?: string;
      erro?: string;
      aguardar?: boolean;
    };
    if (b.status === "pago") return "pago";
    // `aguardar`: a rede ainda não tem a transação, ou faltam confirmações.
    return b.erro && !b.aguardar ? { erro: b.erro } : "pendente";
  } catch {
    return "pendente"; // sem rede: tenta de novo
  }
}

const seguindo = new Set<string>();

async function seguir(e: Enviado) {
  if (seguindo.has(e.id)) return;
  seguindo.add(e.id);
  try {
    // Retomado de outra visita: confere logo, a rede já teve tempo.
    let espera = Date.now() - e.desde > 60_000 ? 1_500 : 7_000;
    for (;;) {
      await new Promise((ok) => setTimeout(ok, espera));
      const r = await consultar(e);
      if (r === "pago") {
        guardar({ ...e, pago: true });
        avisarCreditos();
        return;
      }
      if (r !== "pendente") return guardar({ ...e, erro: r.erro });
      const idade = Date.now() - e.desde;
      if (idade > INSISTE_MS)
        return guardar({
          ...e,
          erro: "A rede não confirmou este pagamento. Se o valor saiu da carteira, cole o hash da transação; se não saiu, pague de novo.",
        });
      // A rede costuma confirmar em segundos; depois de 3 min, pergunta devagar.
      espera = idade < 3 * 60_000 ? 7_000 : 30_000;
    }
  } finally {
    seguindo.delete(e.id);
  }
}

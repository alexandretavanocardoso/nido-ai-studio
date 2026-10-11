"use client";

import { useEffect, useState } from "react";
import { useCreditos } from "@/components/creditos/CreditosProvider";
import { useRecursos } from "@/components/RecursosProvider";
import { liberadoNaTela } from "@/lib/em-teste";

const NENHUM: ReadonlySet<string> = new Set();

/**
 * Ids dos personagens da conta que têm NFT mintado. Vazio enquanto carrega, e
 * sempre vazio quando o NFT não está configurado ou liberado para a conta.
 */
export function useNftsMintados(): ReadonlySet<string> {
  const recursos = useRecursos();
  const { conta } = useCreditos();
  const ligado = recursos.nft && liberadoNaTela("nft", conta);
  const [ids, setIds] = useState<ReadonlySet<string>>(NENHUM);

  useEffect(() => {
    if (!ligado) return;
    let vivo = true;
    fetch("/api/nft/personagens", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { mintados: [] }))
      .then((b: { mintados?: string[] }) => {
        if (vivo) setIds(new Set(b.mintados ?? []));
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [ligado]);

  return ligado ? ids : NENHUM;
}

"use client";

import { useEffect, useState } from "react";
import { useRecursos } from "@/components/RecursosProvider";
import { confirmar } from "@/components/ui/Confirmacao";
import { authClient } from "@/lib/auth/client";
import {
  erroDoRetorno,
  NOME_VINCULO,
  type ProvedorVinculo,
} from "@/lib/auth/vinculos";
import { tx } from "@/lib/i18n/tx";

export interface EstadoVinculo {
  vinculado: boolean;
  nome?: string | null;
  /** Foto do perfil na rede. */
  imagem?: string | null;
}

/** Textos com o nome da rede (inteiros, para a tradução achar cada um). */
const TEXTOS: Record<ProvedorVinculo, { desvincular: string; naoAbriu: string }> =
  {
    discord: {
      desvincular: "Desvincular o Discord?",
      naoAbriu: "Não consegui abrir o Discord. Tente de novo.",
    },
    linkedin: {
      desvincular: "Desvincular o LinkedIn?",
      naoAbriu: "Não consegui abrir o LinkedIn. Tente de novo.",
    },
    twitter: {
      desvincular: "Desvincular o X?",
      naoAbriu: "Não consegui abrir o X. Tente de novo.",
    },
  };

/**
 * Vínculo de uma rede (Discord, LinkedIn, X) com a conta: o estado, e as ações
 * de vincular e desvincular. `ligado` é falso em deploy sem o app dessa rede
 * configurado — aí nada é consultado e quem usa não mostra nada.
 */
export function useVinculo(provedor: ProvedorVinculo) {
  const ligado = useRecursos()[provedor];
  const [estado, setEstado] = useState<EstadoVinculo | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!ligado) return;
    let vivo = true;
    fetch(`/api/conta/vinculo/${provedor}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { vinculado: false }))
      .then((b: EstadoVinculo) => vivo && setEstado(b))
      .catch(() => vivo && setEstado({ vinculado: false }));
    return () => {
      vivo = false;
    };
  }, [ligado, provedor]);

  // Voltou da rede sem vincular (recusou, ou a conta já é de outro usuário):
  // mostra o motivo e limpa o endereço.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const codigo = p.get("error");
    if (p.get("vinculo") !== provedor || !codigo) return;
    const e = erroDoRetorno(codigo);
    setErro(tx(e.aviso) + (e.codigo ? ` (${e.codigo})` : ""));
    for (const k of ["vinculo", "error", "error_description"]) p.delete(k);
    const resto = p.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (resto ? `?${resto}` : ""),
    );
  }, [provedor]);

  async function vincular() {
    setOcupado(true);
    setErro(null);
    // Vai para a rede autorizar e volta para a mesma tela, já vinculado.
    const aqui = window.location.pathname;
    const r = await authClient.linkSocial({
      provider: provedor,
      callbackURL: aqui,
      errorCallbackURL: `${aqui}?vinculo=${provedor}`,
    });
    if (r.error) {
      setErro(tx(TEXTOS[provedor].naoAbriu));
      setOcupado(false);
    }
  }

  async function desvincular() {
    if (
      !(await confirmar({
        titulo: tx(TEXTOS[provedor].desvincular),
        mensagem: tx("Você pode vincular de novo quando quiser."),
        confirmar: tx("Desvincular"),
      }))
    )
      return;
    setOcupado(true);
    setErro(null);
    const r = await fetch(`/api/conta/vinculo/${provedor}`, {
      method: "DELETE",
    }).catch(() => null);
    if (!r?.ok) setErro(tx("Não consegui desvincular. Tente de novo."));
    else setEstado({ vinculado: false });
    setOcupado(false);
  }

  return {
    ligado,
    nome: NOME_VINCULO[provedor],
    estado,
    vinculado: !!estado?.vinculado,
    ocupado,
    erro,
    vincular,
    desvincular,
  };
}

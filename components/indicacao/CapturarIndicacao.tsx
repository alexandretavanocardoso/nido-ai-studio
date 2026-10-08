"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  COOKIE_INDICACAO,
  COOKIE_INDICACAO_DIAS,
  normalizarCodigo,
  problemaDoCodigo,
} from "@/lib/indicacao/regras";

function temCookie() {
  return document.cookie
    .split("; ")
    .some((c) => c.startsWith(`${COOKIE_INDICACAO}=`));
}

/**
 * Indicação pelo link: guarda o código de `?ref=` num cookie (30 dias) e,
 * quando a pessoa entra na conta, pede ao servidor para ligá-la a quem
 * indicou. O servidor decide se vale (conta nova, não é o próprio dono…).
 */
export function CapturarIndicacao() {
  const { user } = useAuth();

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (!ref || problemaDoCodigo(ref)) return;
    // O primeiro link clicado é o que vale: não troca um código já guardado.
    if (temCookie()) return;
    document.cookie = `${COOKIE_INDICACAO}=${encodeURIComponent(normalizarCodigo(ref))}; path=/; max-age=${COOKIE_INDICACAO_DIAS * 86400}; samesite=lax`;
  }, []);

  const userId = user?.id;
  useEffect(() => {
    if (!userId || !temCookie()) return;
    fetch("/api/indicacao/vincular", { method: "POST" }).catch(() => {});
  }, [userId]);

  return null;
}

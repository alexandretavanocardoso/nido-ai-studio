"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";

/**
 * Notificação do navegador quando algo que estava em andamento termina (vídeo,
 * imagem, figurinha…). Serve para quem deixou a geração rodando e foi para
 * outra aba ou outro programa: com o app na frente, o aviso do canto da tela
 * já basta e a notificação não é mostrada.
 *
 * Só funciona com a aba aberta — é ela que acompanha as tarefas.
 *
 * Cada aviso também entra na lista do sino da barra do topo (guardada neste
 * navegador), para quem não viu a notificação na hora.
 */
const DISPENSADO = "nido:notificacoes-dispensado";

export type Permissao = "sem-suporte" | "perguntar" | "ligadas" | "bloqueadas";

const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

function dispensado(): boolean {
  try {
    return localStorage.getItem(DISPENSADO) === "1";
  } catch {
    return false;
  }
}

function permissaoAgora(): Permissao {
  if (typeof window === "undefined" || !("Notification" in window))
    return "sem-suporte";
  if (Notification.permission === "granted") return "ligadas";
  if (Notification.permission === "denied") return "bloqueadas";
  return "perguntar";
}

/** Estado para a tela: `convidar` = vale mostrar o botão "Avisar quando terminar". */
const instantaneo = () => `${permissaoAgora()}|${dispensado() ? 1 : 0}`;

export function useNotificacoes(): { permissao: Permissao; convidar: boolean } {
  const s = useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    instantaneo,
    () => "sem-suporte|0",
  );
  const [permissao, d] = s.split("|") as [Permissao, string];
  return { permissao, convidar: permissao === "perguntar" && d === "0" };
}

/** Pede a permissão ao navegador (precisa vir de um clique). */
export async function ligarNotificacoes(): Promise<void> {
  if (permissaoAgora() !== "perguntar") return;
  try {
    await Notification.requestPermission();
  } catch {
    // navegador recusou o pedido: segue sem notificação
  }
  avisar();
}

/** "Agora não": o convite não aparece mais neste navegador. */
export function dispensarConvite(): void {
  try {
    localStorage.setItem(DISPENSADO, "1");
  } catch {
    // sem armazenamento: o convite volta na próxima visita
  }
  avisar();
}

/** Mostra a notificação se estiver ligada e o app não estiver na frente. */
export function notificar(corpo: string): void {
  if (permissaoAgora() !== "ligadas") return;
  if (!document.hidden && document.hasFocus()) return;
  try {
    const n = new Notification("NIDO AI Studio", {
      body: corpo,
      icon: "/icon.png",
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Chrome no Android só aceita notificação por service worker: fica só o aviso na tela.
  }
}

/** Um aviso da lista do sino. */
export interface Aviso {
  id: string;
  texto: string;
  /** A tarefa falhou (os créditos voltaram). */
  erro?: boolean;
  /** Onde ver o resultado. */
  href?: string;
  quando: number;
  lida: boolean;
}

const AVISOS = "nido:avisos";
const MAX_AVISOS = 30;

const useAvisosGuardados = create<{ avisos: Aviso[]; carregado: boolean }>(() => ({
  avisos: [],
  carregado: false,
}));

function guardar(avisos: Aviso[]) {
  useAvisosGuardados.setState({ avisos, carregado: true });
  try {
    localStorage.setItem(AVISOS, JSON.stringify(avisos));
  } catch {
    // sem armazenamento: a lista vale até recarregar a página
  }
}

/** Lê a lista guardada (uma vez, já no navegador — no servidor ela é vazia). */
export function carregarAvisos(): void {
  if (useAvisosGuardados.getState().carregado) return;
  let lidos: Aviso[] = [];
  try {
    const bruto = JSON.parse(localStorage.getItem(AVISOS) ?? "[]") as unknown;
    if (Array.isArray(bruto))
      lidos = (bruto as Aviso[]).filter(
        (a) => a && typeof a.id === "string" && typeof a.texto === "string",
      );
  } catch {
    // lista ilegível: começa vazia
  }
  // Avisos que chegaram antes da leitura ficam na frente.
  guardar([...useAvisosGuardados.getState().avisos, ...lidos].slice(0, MAX_AVISOS));
}

export const useAvisos = () => useAvisosGuardados((s) => s.avisos);

/** Registra o aviso no sino e mostra a notificação do navegador. */
export function registrarAviso(
  texto: string,
  o: { erro?: boolean; href?: string } = {},
): void {
  carregarAvisos();
  const aviso: Aviso = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    texto,
    erro: o.erro,
    href: o.href,
    quando: Date.now(),
    lida: false,
  };
  guardar([aviso, ...useAvisosGuardados.getState().avisos].slice(0, MAX_AVISOS));
  notificar(texto);
}

export function marcarAvisosLidos(): void {
  const { avisos } = useAvisosGuardados.getState();
  if (avisos.some((a) => !a.lida))
    guardar(avisos.map((a) => ({ ...a, lida: true })));
}

export const limparAvisos = () => guardar([]);

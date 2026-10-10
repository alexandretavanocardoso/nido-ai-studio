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
 * Cada aviso também entra na lista do sino da barra do topo (guardada na
 * conta), para quem não viu a notificação na hora.
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
  /** O que terminou; a tela põe "Terminou:" / "Não deu certo:" na frente. */
  rotulo: string;
  /** A tarefa falhou (os créditos voltaram). */
  erro?: boolean;
  /** Onde ver o resultado. */
  href?: string | null;
  /** Identifica o acontecimento, para não avisar duas vezes. */
  chave?: string | null;
  quando: number;
  lida: boolean;
}

/**
 * A lista mora na conta (/api/conta/avisos): aparece em qualquer aparelho e
 * inclui o que o servidor registrou com o app fechado. Este navegador guarda
 * uma cópia, que vale enquanto a da conta não chega (ou sem login).
 */
const AVISOS = "nido:avisos";
const MAX_AVISOS = 30;
const ROTA = "/api/conta/avisos";

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

/** Troca a lista pela da conta, quando a resposta trouxe uma. */
async function daConta(resposta: Promise<Response>): Promise<void> {
  try {
    const res = await resposta;
    // Sem login: a cópia guardada pode ser de outra conta que usou este navegador.
    if (res.status === 401) return guardar([]);
    if (!res.ok) return;
    const b = (await res.json()) as { avisos?: Aviso[] };
    if (Array.isArray(b.avisos)) guardar(b.avisos);
  } catch {
    // sem rede: fica a cópia deste navegador
  }
}

/** Busca a lista da conta (ao abrir o app, ao voltar para a aba, ao abrir o sino). */
export const sincronizarAvisos = () => daConta(fetch(ROTA, { cache: "no-store" }));

/** Lê a cópia guardada (uma vez, já no navegador) e busca a da conta. */
export function carregarAvisos(): void {
  if (useAvisosGuardados.getState().carregado) return;
  let lidos: Aviso[] = [];
  try {
    const bruto = JSON.parse(localStorage.getItem(AVISOS) ?? "[]") as unknown;
    if (Array.isArray(bruto))
      lidos = (bruto as Aviso[]).filter(
        (a) => a && typeof a.id === "string" && typeof a.rotulo === "string",
      );
  } catch {
    // lista ilegível: começa vazia
  }
  // Avisos que chegaram antes da leitura ficam na frente.
  guardar([...useAvisosGuardados.getState().avisos, ...lidos].slice(0, MAX_AVISOS));
  void sincronizarAvisos();
}

export const useAvisos = () => useAvisosGuardados((s) => s.avisos);

/**
 * Registra o aviso no sino (na conta) e mostra a notificação do navegador.
 * `texto` é o aviso já no idioma da pessoa, para a notificação.
 */
export function registrarAviso(
  texto: string,
  o: { rotulo: string; erro?: boolean; href?: string; chave?: string },
): void {
  carregarAvisos();
  const { avisos } = useAvisosGuardados.getState();
  // Já está na lista (o servidor ou outra aba registrou antes): nada a fazer.
  if (o.chave && avisos.some((a) => a.chave === o.chave)) return;
  guardar(
    [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...o,
        quando: Date.now(),
        lida: false,
      },
      ...avisos,
    ].slice(0, MAX_AVISOS),
  );
  notificar(texto);
  void daConta(
    fetch(ROTA, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(o),
    }),
  );
}

export function marcarAvisosLidos(): void {
  const { avisos } = useAvisosGuardados.getState();
  if (!avisos.some((a) => !a.lida)) return;
  guardar(avisos.map((a) => ({ ...a, lida: true })));
  fetch(ROTA, { method: "PATCH" }).catch(() => {});
}

export function limparAvisos(): void {
  guardar([]);
  fetch(ROTA, { method: "DELETE" }).catch(() => {});
}

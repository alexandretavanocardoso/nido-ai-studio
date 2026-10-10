"use client";

import { useCallback, useRef } from "react";
import { create } from "zustand";

/**
 * Estado que sobrevive à troca de tela dentro do app.
 *
 * As gerações (imagem, texto, vídeo, voz) são pedidos que levam de segundos a
 * minutos. Com `useState`, sair da tela no meio perdia o "carregando", o erro e
 * o resultado — o pedido terminava, mas ninguém ficava sabendo. Aqui o valor
 * mora fora do componente: o pedido em andamento continua gravando nele e, ao
 * voltar para a tela, ela mostra o estado atual.
 *
 * Vale enquanto a aba estiver aberta (recarregar a página zera).
 */
interface Estado {
  valores: Record<string, unknown>;
  /** Chaves que representam uma tarefa em andamento (valor "ligado" = rodando). */
  rotulos: Record<string, string>;
  /** Tarefas que acabaram há pouco (aviso rápido no canto da tela). */
  terminadas: Array<{ id: number; rotulo: string; href?: string }>;
}

const useDuraveis = create<Estado>(() => ({
  valores: {},
  rotulos: {},
  terminadas: [],
}));

let proximoId = 1;

/** "Ligado" = tarefa rodando. O 0 conta (progresso de envio começa em 0). */
const ligado = (v: unknown) =>
  v !== undefined && v !== null && v !== false && v !== "";

/**
 * Mostra o aviso rápido de que algo terminou (ex.: um vídeo ficou pronto).
 * `href` é onde ver o resultado (vai para a lista do sino).
 */
export function avisarTermino(rotulo: string, href?: string) {
  useDuraveis.setState((s) => ({
    terminadas: [...s.terminadas, { id: proximoId++, rotulo, href }],
  }));
}

export function dispensarTermino(id: number) {
  useDuraveis.setState((s) => ({
    terminadas: s.terminadas.filter((t) => t.id !== id),
  }));
}

/**
 * Igual ao `useState`, mas guardado por `chave` fora do componente.
 * Com `rotulo`, o valor marca uma tarefa em andamento: enquanto estiver
 * "ligado" (true, texto, número — inclusive 0), ela aparece no indicador global.
 */
export function useDuravel<T>(
  chave: string,
  inicial: T,
  rotulo?: string | ((valor: T) => string),
): [T, (v: T | ((atual: T) => T)) => void] {
  // O valor inicial da primeira renderização vale até alguém gravar (mesma
  // referência a cada render, como no useState).
  const inicio = useRef(inicial).current;
  const bruto = useDuraveis((s) => s.valores[chave]);
  const valor = bruto === undefined ? inicio : (bruto as T);

  const definir = useCallback(
    (v: T | ((atual: T) => T)) => {
      useDuraveis.setState((s) => {
        const atual =
          s.valores[chave] === undefined ? inicio : (s.valores[chave] as T);
        const novo =
          typeof v === "function" ? (v as (atual: T) => T)(atual) : v;
        const valores = { ...s.valores, [chave]: novo };
        if (!rotulo) return { valores };
        if (ligado(novo))
          return {
            valores,
            rotulos: {
              ...s.rotulos,
              [chave]: typeof rotulo === "function" ? rotulo(novo) : rotulo,
            },
          };
        // Desligou: sai da lista e, se estava rodando, vira aviso de "terminou".
        const { [chave]: terminou, ...rotulos } = s.rotulos;
        return {
          valores,
          rotulos,
          terminadas:
            ligado(atual) && terminou
              ? [...s.terminadas, { id: proximoId++, rotulo: terminou }]
              : s.terminadas,
        };
      });
    },
    // `rotulo` só importa no momento da chamada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chave, inicio],
  );

  return [valor, definir];
}

/** Rótulos das tarefas em andamento agora (uma string só, pra não re-renderizar à toa). */
export function useTarefasRodando(): string[] {
  const junto = useDuraveis((s) =>
    Object.keys(s.rotulos)
      .filter((k) => ligado(s.valores[k]))
      .map((k) => s.rotulos[k])
      .join("\n"),
  );
  return junto ? junto.split("\n") : [];
}

export function useTerminadas() {
  return useDuraveis((s) => s.terminadas);
}

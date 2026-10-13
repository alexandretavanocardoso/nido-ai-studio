"use client";

import { create } from "zustand";
import { aoMudarCarteiras } from "@/lib/nft/carteira-navegador";
import type { CarteiraInstalada, Familia } from "./comum";
import {
  aoMudarCarteirasEvm,
  aoTrocarContaEvm,
  carteirasEvm,
  conectarEvm,
} from "./evm";
import {
  aoTrocarContaSolana,
  carteirasSolana,
  conectarSolana,
  desconectarSolana,
} from "./solana";

export type { CarteiraInstalada, Familia } from "./comum";

/**
 * Carteiras conectadas neste navegador (uma Solana e uma EVM), que a barra do
 * topo mostra e o pagamento em USDC usa. O app lembra qual foi conectada e, ao
 * abrir de novo, reconecta sem abrir a janela da carteira.
 */
export interface CarteiraConectada extends CarteiraInstalada {
  endereco: string;
}

interface Estado {
  solana: CarteiraConectada | null;
  evm: CarteiraConectada | null;
  instaladas: Record<Familia, CarteiraInstalada[]>;
}

export const useCarteiras = create<Estado>(() => ({
  solana: null,
  evm: null,
  instaladas: { solana: [], evm: [] },
}));

const FAMILIAS = {
  solana: {
    listar: carteirasSolana,
    conectar: conectarSolana,
    aoTrocarConta: aoTrocarContaSolana,
    desconectar: desconectarSolana,
  },
  // Nas EVM não há "desconectar" padrão: o app só esquece a carteira.
  evm: {
    listar: carteirasEvm,
    conectar: conectarEvm,
    aoTrocarConta: aoTrocarContaEvm,
    desconectar: async () => {},
  },
} satisfies Record<Familia, unknown>;

const CHAVE = "nido:carteiras";

function lembradas(): Partial<Record<Familia, string>> {
  try {
    const b = JSON.parse(localStorage.getItem(CHAVE) ?? "{}") as unknown;
    return b && typeof b === "object" ? (b as Record<Familia, string>) : {};
  } catch {
    return {};
  }
}

/** Para de ouvir a troca de conta da carteira anterior de cada família. */
const soltar: Partial<Record<Familia, () => void>> = {};

const por = (familia: Familia, c: CarteiraConectada | null) =>
  useCarteiras.setState(familia === "solana" ? { solana: c } : { evm: c });

function definir(familia: Familia, c: CarteiraConectada | null) {
  soltar[familia]?.();
  delete soltar[familia];
  por(familia, c);
  try {
    const salvas = lembradas();
    if (c) salvas[familia] = c.id;
    else delete salvas[familia];
    localStorage.setItem(CHAVE, JSON.stringify(salvas));
  } catch {
    // sem armazenamento: a conexão vale até recarregar a página
  }
  if (c)
    soltar[familia] = FAMILIAS[familia].aoTrocarConta(c.id, (endereco) =>
      endereco
        ? por(familia, { ...c, endereco })
        : definir(familia, null),
    );
}

/** Abre a janela da carteira para conectar. Lança CarteiraError (lib/nft/carteira-navegador.ts). */
export async function conectarCarteira(
  familia: Familia,
  id: string,
): Promise<CarteiraConectada | null> {
  const endereco = await FAMILIAS[familia].conectar(id);
  const info = FAMILIAS[familia].listar().find((c) => c.id === id);
  if (!endereco || !info) return null;
  const conectada = { ...info, endereco };
  definir(familia, conectada);
  return conectada;
}

export function desconectarCarteira(familia: Familia): void {
  const c = useCarteiras.getState()[familia];
  if (c) void FAMILIAS[familia].desconectar(c.id);
  definir(familia, null);
}

/** Cada carteira lembrada é tentada uma vez por página. */
const tentadas = new Set<string>();

async function retomar() {
  const salvas = lembradas();
  for (const familia of ["solana", "evm"] as const) {
    const id = salvas[familia];
    if (!id || useCarteiras.getState()[familia]) continue;
    // A extensão pode não ter carregado ainda: tenta de novo quando ela aparecer.
    const info = FAMILIAS[familia].listar().find((c) => c.id === id);
    if (!info || tentadas.has(`${familia}:${id}`)) continue;
    tentadas.add(`${familia}:${id}`);
    const endereco = await FAMILIAS[familia].conectar(id, true);
    if (endereco && !useCarteiras.getState()[familia])
      definir(familia, { ...info, endereco });
  }
}

let ligado = false;

/**
 * Liga a lista de carteiras instaladas e reconecta as que a pessoa já tinha
 * conectado. Pode ser chamada mais de uma vez; só a primeira faz algo.
 */
export function ligarCarteiras(): void {
  if (ligado || typeof window === "undefined") return;
  ligado = true;
  const atualizar = () => {
    useCarteiras.setState({
      instaladas: { solana: carteirasSolana(), evm: carteirasEvm() },
    });
    void retomar();
  };
  aoMudarCarteiras(atualizar);
  aoMudarCarteirasEvm(atualizar);
  atualizar();
}

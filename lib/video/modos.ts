/**
 * O que a Sombra muda no vídeo. Nos dois primeiros alguém vira o personagem;
 * nos outros ninguém é trocado e só o pedido escrito vale (o fundo, ou um
 * detalhe como um acessório). O pedido é texto livre do usuário.
 */
export const MODOS_TROCA = {
  personagem: {
    label: "Personagem",
    nota: "Troca a pessoa; o resto fica igual",
    personagem: true,
    pedidoObrigatorio: false,
    exemplo: "Ex.: ele segura uma xícara branca",
  },
  personagem_cena: {
    label: "Personagem e cena",
    nota: "Troca a pessoa e muda o lugar",
    personagem: true,
    pedidoObrigatorio: true,
    exemplo: "Ex.: numa praia ao pôr do sol",
  },
  cena: {
    label: "Só a cena",
    nota: "As pessoas ficam; o fundo muda",
    personagem: false,
    pedidoObrigatorio: true,
    exemplo: "Ex.: num escritório moderno com janelas grandes",
  },
  detalhe: {
    label: "Só um detalhe",
    nota: "Muda só o que você pedir",
    personagem: false,
    pedidoObrigatorio: true,
    exemplo: "Ex.: troque o boné por um chapéu de palha",
  },
} as const;

export type ModoTroca = keyof typeof MODOS_TROCA;
export const MODOS_TROCA_IDS = Object.keys(MODOS_TROCA) as ModoTroca[];

/** Tamanho máximo do pedido: o motor (Kling) aceita até 2500 caracteres no total. */
export const PEDIDO_TROCA_MAX = 300;

/** O que vai junto ao motor quando há pedido escrito (já em inglês). */
export interface EdicaoTroca {
  modo: ModoTroca;
  pedido?: string;
}

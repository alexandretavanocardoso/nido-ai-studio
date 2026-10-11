/**
 * O que fazer com um mint já enviado, a partir do que a rede diz. Sem rede e
 * sem banco aqui, para a regra poder ser testada caso a caso: é ela que
 * garante que ninguém é cobrado sem NFT nem fica com NFT e estorno.
 */

/**
 * finalizada = entrou e não volta mais · pendente = entrou, ainda sem
 * finalizar · revertida = entrou com erro · sem_registro = a rede não a conhece.
 */
export type Situacao = "finalizada" | "pendente" | "revertida" | "sem_registro";

/**
 * Folga, em blocos (cerca de 2 minutos), depois do último bloco válido antes
 * de dar a transação por vencida. Cobre RPC atrasado: a transação só é dada
 * como perdida quando não há mais como ela entrar.
 */
export const FOLGA_BLOCOS = 300;

export interface Fatos {
  /** Primeira consulta da transação. */
  situacao: Situacao;
  /** Último bloco em que a transação ainda podia entrar. */
  validoAteBloco: number;
  /** Altura do último bloco finalizado — lida DEPOIS da primeira consulta. */
  altura?: number;
  /** Segunda consulta da transação, feita depois de ler a altura. */
  situacaoDepois?: Situacao;
  /** A conta do NFT existe na rede (bloco finalizado)? */
  contaExiste?: boolean;
}

export type Passo =
  /** A transação entrou: o NFT existe. */
  | "confirmar"
  /** A rede executou e recusou: não há NFT. Estorna. */
  | "falhar_recusada"
  /** O prazo passou e nada entrou: não há NFT e não haverá. Estorna. */
  | "falhar_vencida"
  /** Ainda pode entrar (ou já entrou e falta finalizar): não muda nada. */
  | "aguardar"
  /** Falta ler a altura do último bloco finalizado. */
  | "ler_altura"
  /** Falta consultar a transação de novo e ver se a conta do NFT existe. */
  | "ler_de_novo";

/**
 * Regra: só dá por perdida a transação que a rede não conhece DEPOIS de o
 * prazo dela ter passado com folga, consultando de novo e conferindo que a
 * conta do NFT não existe. Na dúvida, aguarda.
 */
export function proximoPasso(f: Fatos): Passo {
  if (f.situacao === "finalizada") return "confirmar";
  if (f.situacao === "revertida") return "falhar_recusada";
  if (f.situacao === "pendente") return "aguardar";
  // A rede não conhece a transação.
  if (f.altura === undefined) return "ler_altura";
  if (f.altura <= f.validoAteBloco + FOLGA_BLOCOS) return "aguardar";
  if (f.situacaoDepois === undefined || f.contaExiste === undefined)
    return "ler_de_novo";
  if (f.situacaoDepois === "finalizada" || f.contaExiste) return "confirmar";
  if (f.situacaoDepois === "revertida") return "falhar_recusada";
  if (f.situacaoDepois === "pendente") return "aguardar";
  return "falhar_vencida";
}

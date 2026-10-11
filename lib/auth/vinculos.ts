/**
 * Contas de outras redes que dá para vincular à conta do app (Perfil). O id é
 * o do provedor no Better Auth e o da chave em `Recursos`. O Google fica de
 * fora de propósito: ele é o login, e o que está aqui pode ser desvinculado.
 */
export const PROVEDORES_VINCULO = ["discord", "linkedin", "twitter"] as const;
export type ProvedorVinculo = (typeof PROVEDORES_VINCULO)[number];

export const NOME_VINCULO: Record<ProvedorVinculo, string> = {
  discord: "Discord",
  linkedin: "LinkedIn",
  twitter: "X",
};

export function ehProvedorVinculo(v: string): v is ProvedorVinculo {
  return (PROVEDORES_VINCULO as readonly string[]).includes(v);
}

/** O que a rede devolve sobre a conta (`accountInfo` do Better Auth). */
interface InfoDaRede {
  user: { name?: string | null };
  data?: unknown;
}

/**
 * Como mostrar a conta vinculada: no X, o @ (é o que identifica a conta; o
 * nome de exibição qualquer um repete); nas outras, o nome do perfil.
 */
export function nomeDaConta(
  provedor: ProvedorVinculo,
  info: InfoDaRede,
): string | null {
  if (provedor === "twitter") {
    const arroba = (info.data as { data?: { username?: unknown } } | null)?.data
      ?.username;
    if (typeof arroba === "string" && arroba.trim()) return `@${arroba.trim()}`;
  }
  return info.user.name?.trim() || null;
}

/**
 * Aviso para o código de erro com que o Better Auth volta da rede. `codigo` só
 * vem preenchido no erro sem aviso próprio (app da rede mal configurado, por
 * exemplo), para a tela mostrar qual foi — e só se tiver cara de código, porque
 * ele chega pelo endereço da página.
 */
export function erroDoRetorno(codigo: string): {
  aviso: string;
  codigo?: string;
} {
  if (codigo === "account_already_linked_to_different_user")
    return { aviso: "Essa conta já está vinculada a outro usuário do app." };
  // A pessoa fechou ou recusou a tela da rede (o LinkedIn usa códigos próprios).
  if (codigo === "access_denied" || codigo.startsWith("user_cancelled"))
    return { aviso: "Você não autorizou o acesso. Nada foi vinculado." };
  return {
    aviso: "Não deu para concluir o vínculo. Tente de novo.",
    codigo: /^[a-z0-9_]{1,60}$/i.test(codigo) ? codigo : undefined,
  };
}

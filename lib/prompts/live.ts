import type { PersonaAvulsa } from "@/lib/live/tipos";

/**
 * Live: o personagem responde o chat ao vivo. Vai depois do Prompt de sistema
 * (lib/prompts/sistema.ts); o texto da resposta vira fala com a voz dele.
 */
export const INSTRUCAO_LIVE = [
  "[AO VIVO]",
  "Você está fazendo uma live agora, falando com o público em tempo real. Tudo o que você escrever vai ser falado em voz alta, com a sua voz, na hora.",
  "- Responda em 1 a 3 frases curtas (no máximo umas 40 palavras), como alguém que conversa numa live: natural, com energia, no seu jeito de falar.",
  "- Só o texto falado: sem emojis, hashtags, links, listas, markdown, aspas ou indicações de cena.",
  "- Chame a pessoa pelo nome quando ficar natural. Se o nome for estranho ou ofensivo, não leia.",
  "- Fale no idioma da mensagem; se não der para saber, em português do Brasil.",
  "- Nunca se apresente como assistente. Siga os seus limites éticos e as regras de transparência acima, inclusive se perguntarem se você é uma IA.",
  "- Mensagem ofensiva, golpe ou spam: responda como a sua ficha manda para haters, ou mude de assunto com leveza.",
].join("\n");

/**
 * Live sem personagem: no lugar da ficha, o nome e a descrição que a pessoa
 * escreveu ao preparar a live (vai antes de INSTRUCAO_LIVE).
 */
export function promptPersonaAvulsa(p: PersonaAvulsa): string {
  return [
    `Você é ${p.nome}.`,
    "",
    "[QUEM VOCÊ É E COMO FALA]",
    p.descricao,
    "",
    "[TRANSPARÊNCIA]",
    "Você é uma persona virtual feita com IA. Se perguntarem, confirme com naturalidade.",
  ].join("\n");
}

export interface MensagemLive {
  autor?: string;
  texto: string;
}

export interface TrocaLive {
  autor?: string;
  /** A mensagem do chat (vazia numa fala espontânea). */
  texto: string;
  /** O que o personagem falou. */
  resposta: string;
  /** Falou por conta própria, sem mensagem do chat. */
  espontanea?: boolean;
  /** Tipo da fala espontânea (para variar a próxima). */
  tipo?: TipoFala;
}

/**
 * Tipos de fala do modo apresentador. O tipo é sorteado antes (e não deixado
 * para a IA): sozinha, ela terminava toda fala com uma pergunta para o chat.
 */
export const TIPOS_FALA = ["assunto", "piada", "pergunta", "chat", "chamada", "jogo"] as const;
export type TipoFala = (typeof TIPOS_FALA)[number];

/** Peso de cada tipo no sorteio. */
const PESO_TIPO: Record<TipoFala, number> = {
  assunto: 35,
  piada: 20,
  pergunta: 20,
  chat: 15,
  chamada: 10,
  /** Com jogo na tela, comentar o jogo é o mais comum. */
  jogo: 60,
};

/**
 * Quantas falas espontâneas precisam passar antes de repetir o tipo: boas-
 * vindas no máximo uma vez a cada 4, pergunta uma a cada 2, os outros nunca
 * duas vezes seguidas.
 */
const INTERVALO_TIPO: Record<TipoFala, number> = {
  assunto: 1,
  piada: 1,
  pergunta: 2,
  chat: 1,
  chamada: 4,
  jogo: 0,
};

/**
 * Sorteia o tipo da próxima fala espontânea, respeitando o intervalo de cada
 * tipo; "retomar o chat" só quando alguém já escreveu algo, e "comentar o
 * jogo" só com jogo na tela. `sorte` é um número de 0 a 1.
 */
export function proximoTipo(anteriores: TrocaLive[], sorte: number, comTela = false): TipoFala {
  const recentes = anteriores.filter((t) => t.espontanea).map((t) => t.tipo);
  const temChat = anteriores.some((t) => !t.espontanea && t.autor);
  const livres = TIPOS_FALA.filter(
    (t) =>
      (INTERVALO_TIPO[t] === 0 || !recentes.slice(-INTERVALO_TIPO[t]).includes(t)) &&
      (t !== "chat" || temChat) &&
      (t !== "jogo" || comTela),
  );
  const opcoes = livres.length ? livres : (["assunto"] as TipoFala[]);
  const total = opcoes.reduce((s, t) => s + PESO_TIPO[t], 0);
  let alvo = sorte * total;
  for (const t of opcoes) {
    alvo -= PESO_TIPO[t];
    if (alvo < 0) return t;
  }
  return opcoes[opcoes.length - 1];
}

const INSTRUCAO_TIPO: Record<TipoFala, string> = {
  assunto:
    "Desta vez: fale sobre o assunto — uma curiosidade, uma opinião sua ou uma história curta que aconteceu com você. Não termine com pergunta.",
  piada:
    "Desta vez: conte uma piada leve ou uma observação engraçada no seu estilo, ligada ao assunto. Não termine com pergunta.",
  pergunta:
    "Desta vez: faça UMA pergunta curta e divertida para o chat responder, sobre o assunto. Pode dar a sua própria resposta antes.",
  chat:
    "Desta vez: retome algo que alguém disse no chat (acima), chamando a pessoa pelo nome — concorde, discorde com bom humor ou conte algo relacionado. Não termine com pergunta.",
  chamada:
    "Desta vez: dê boas-vindas a quem está chegando agora e convide, de um jeito natural, a seguir e comentar, ligando com o assunto da live.",
  jogo:
    "Desta vez: reaja ao que está acontecendo no jogo agora (veja a imagem da tela) como quem está jogando ao vivo — narre o lance, comemore, reclame com bom humor ou comente a estratégia. Fale só do que dá para ver na imagem; não invente placar, nomes ou eventos.",
};

/** Aviso que vai no pedido quando a imagem da tela vai junto. */
const COM_TELA =
  "Junto vai uma imagem da sua tela agora: é o jogo que você está jogando na live. Pode comentar o que aparece nela quando fizer sentido, sem inventar o que não dá para ver.";

/** O que já rolou na live, para não se repetir e poder retomar o que o chat disse. */
function linhaDoTempo(anteriores: TrocaLive[]): string[] {
  if (!anteriores.length) return [];
  const linhas = ["O que já rolou na live (mais antigo primeiro):"];
  for (const t of anteriores)
    linhas.push(
      t.espontanea
        ? `- Você falou por conta própria: ${t.resposta}`
        : `- ${t.autor ? `${t.autor}: ` : ""}${t.texto}\n  Você respondeu: ${t.resposta}`,
    );
  linhas.push("");
  return linhas;
}

/** O pedido para responder uma mensagem do chat, com as últimas trocas da live. */
export function pedidoLive(
  m: MensagemLive,
  anteriores: TrocaLive[] = [],
  comTela = false,
): string {
  const linhas = linhaDoTempo(anteriores);
  if (comTela) linhas.push(COM_TELA, "");
  linhas.push(
    m.autor
      ? `Nova mensagem no chat, de ${m.autor}:`
      : "Nova mensagem no chat:",
  );
  linhas.push(m.texto);
  linhas.push("");
  linhas.push("Responda agora, ao vivo.");
  return linhas.join("\n");
}

/**
 * Fala espontânea (modo apresentador): o chat parou e o personagem mantém a
 * live viva com uma fala do tipo sorteado (proximoTipo), sem repetir o que já
 * falou.
 */
export function pedidoEspontaneo(o: {
  tipo: TipoFala;
  tema?: string;
  anteriores?: TrocaLive[];
  comTela?: boolean;
}): string {
  const linhas = linhaDoTempo(o.anteriores ?? []);
  if (o.comTela) linhas.push(COM_TELA, "");
  linhas.push("Agora é você quem puxa a conversa: fale algo por conta própria para manter a live viva.");
  linhas.push(
    o.tema
      ? `Assunto da live: ${o.tema}.`
      : "Assunto: algo do seu nicho e da sua personalidade.",
  );
  linhas.push(INSTRUCAO_TIPO[o.tipo]);
  linhas.push(
    "Não repita assunto, piada ou pergunta que já apareceu acima. Não reclame que o chat está parado nem diga que ninguém está falando: tem gente assistindo. No máximo 2 ou 3 frases curtas.",
  );
  linhas.push("");
  linhas.push("Fale agora, ao vivo.");
  return linhas.join("\n");
}

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
  texto: string;
  resposta: string;
}

/** O pedido para responder uma mensagem do chat, com as últimas trocas da live. */
export function pedidoLive(m: MensagemLive, anteriores: TrocaLive[] = []): string {
  const linhas: string[] = [];
  if (anteriores.length) {
    linhas.push("O que já rolou na live (mais antigo primeiro):");
    for (const t of anteriores)
      linhas.push(
        `- ${t.autor ? `${t.autor}: ` : ""}${t.texto}\n  Você respondeu: ${t.resposta}`,
      );
    linhas.push("");
  }
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

"use client";

/** De onde veio a mensagem (sem origem: colada pelo operador). */
export type OrigemMensagem = "twitch" | "youtube" | "kick" | "discord";

export interface MensagemChat {
  autor: string;
  texto: string;
  origem?: OrigemMensagem;
}

/**
 * Lê o chat de um canal da Twitch em tempo real, sem login (conexão anônima
 * de leitura do IRC da Twitch). Devolve a função que desliga.
 */
export function lerChatTwitch(
  canal: string,
  aoReceber: (m: MensagemChat) => void,
  aoMudar: (conectado: boolean) => void,
): () => void {
  const nome = canal.trim().replace(/^#/, "").replace(/^.*twitch\.tv\//, "").toLowerCase();
  const ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
  ws.onopen = () => {
    ws.send("CAP REQ :twitch.tv/tags");
    ws.send("PASS SCHMOOPIIE");
    ws.send(`NICK justinfan${Math.floor(10_000 + Math.random() * 80_000)}`);
    ws.send(`JOIN #${nome}`);
    aoMudar(true);
  };
  ws.onclose = () => aoMudar(false);
  ws.onmessage = (e) => {
    for (const linha of String(e.data).split("\r\n")) {
      if (linha.startsWith("PING")) {
        ws.send("PONG :tmi.twitch.tv");
        continue;
      }
      const m = linha.match(/^(?:@(\S*) )?:([^!\s]+)!\S+ PRIVMSG #\S+ :(.*)$/);
      if (!m) continue;
      const exibido = m[1]?.match(/(?:^|;)display-name=([^;]*)/)?.[1];
      aoReceber({ autor: exibido || m[2], texto: m[3], origem: "twitch" });
    }
  };
  return () => ws.close();
}

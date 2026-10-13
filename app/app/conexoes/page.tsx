"use client";

import { EmTeste } from "@/components/EmTeste";
import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Bot,
  Cloud,
  Plug,
  SquareTerminal,
  Copy,
  KeyRound,
  Loader2,
  Terminal,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { confirmar } from "@/components/ui/Confirmacao";
import { cn } from "@/lib/cn";
import { copyToClipboard } from "@/lib/export";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import type { TokenApi } from "@/lib/mcp/tokens";

/** O que dá para fazer pelo Claude Code (resumo das ferramentas de /api/mcp). */
const PODE = [
  "Ver personagens, imagens, vozes, roteiros e vídeos",
  "Escrever legendas, roteiros e respostas na voz do personagem",
  "Gerar imagens do personagem",
  "Criar vídeo falado (close ou corpo inteiro, com cenários)",
  "Criar vídeo de cena",
  "Buscar vídeo por link e trocar a pessoa pelo personagem",
  "Escolher voz e gerar falas",
  "Consultar o saldo de créditos",
  "Criar e editar personagens",
  "Gerar o radar do dia",
  "Publicar e agendar posts nas redes",
  "Remover ou trocar legenda de vídeo",
  "Trocar pessoa em foto",
  "Treinar a persona do personagem",
  "Enviar arquivos do computador",
  "Trocar várias pessoas de um vídeo",
];

type Aba = "claude" | "chatgpt";

/** Cada assistente tem o seu passo a passo. */
const ABAS: Array<{ id: Aba; titulo: string; icone: LucideIcon }> = [
  { id: "claude", titulo: "Claude", icone: Plug },
  { id: "chatgpt", titulo: "ChatGPT e Codex", icone: Bot },
];

/**
 * Conta → Claude e ChatGPT (MCP): cria os tokens com que o Claude Code se conecta
 * à conta e mostra o comando pronto. O token inteiro aparece uma vez só.
 */
export default function Conexoes() {
  return (
    <EmTeste recurso="mcp">
      <ConexoesLiberada />
    </EmTeste>
  );
}

function ConexoesLiberada() {
  const { user } = useAuth();
  const [tokens, setTokens] = useState<TokenApi[] | null>(null);
  const [nome, setNome] = useState("Claude Code");
  const [novo, setNovo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [origem, setOrigem] = useState("");
  const [aba, setAba] = useState<Aba>("claude");
  useEffect(() => setOrigem(window.location.origin), []);

  const carregar = useCallback(() => {
    fetch("/api/conta/tokens", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { tokens: [] }))
      .then((b: { tokens: TokenApi[] }) => setTokens(b.tokens))
      .catch(() => setTokens([]));
  }, []);
  useEffect(() => {
    if (user) carregar();
  }, [user, carregar]);

  async function criar() {
    setErro(null);
    setOcupado(true);
    try {
      const res = await fetch("/api/conta/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      const b = (await res.json().catch(() => ({}))) as {
        token?: string;
        error?: string;
      };
      if (!res.ok || !b.token)
        return setErro(txErro(b.error ?? `Falha (HTTP ${res.status}).`));
      setNovo(b.token);
      carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function revogar(t: TokenApi) {
    const ok = await confirmar({
      titulo: tx("Revogar este token?"),
      mensagem: tx(
        "Quem estiver conectado com ele perde o acesso na hora. Não dá para desfazer.",
      ),
      confirmar: tx("Revogar"),
      tom: "perigo",
    });
    if (!ok) return;
    await fetch(`/api/conta/tokens?id=${encodeURIComponent(t.id)}`, {
      method: "DELETE",
    });
    carregar();
  }

  async function copiar(texto: string, chave: string) {
    if (await copyToClipboard(texto)) {
      setCopiado(chave);
      setTimeout(() => setCopiado(null), 1500);
    }
  }

  const comando = (token: string) =>
    `claude mcp add --transport http nido ${origem}/api/mcp --header "Authorization: Bearer ${token}"`;

  // Claude Code web (claude.ai/code): a sessão roda na nuvem, sem `claude mcp
  // add`. O servidor entra por um arquivo do repositório e o token fica numa
  // variável do ambiente — nunca no arquivo, que vai para o GitHub.
  const VARIAVEL = "NIDO_MCP_TOKEN";
  const arquivoMcp = JSON.stringify(
    {
      mcpServers: {
        nido: {
          type: "http",
          url: `${origem}/api/mcp`,
          headers: { Authorization: `Bearer \${${VARIAVEL}}` },
        },
      },
    },
    null,
    2,
  );
  const variavel = `${VARIAVEL}=${novo ?? "SEU_TOKEN"}`;

  // Codex (CLI, extensão e aplicativo dividem o mesmo ~/.codex/config.toml).
  const codexAdicionar = `codex mcp add nido --url ${origem}/api/mcp`;
  const codexEntrar = "codex mcp login nido";
  const codexToml = `[mcp_servers.nido]\nurl = "${origem}/api/mcp"\nbearer_token_env_var = "${VARIAVEL}"`;
  const dominio = origem ? new URL(origem).host : "";

  const BotaoCopiar = ({ texto, chave }: { texto: string; chave: string }) => (
    <button
      type="button"
      onClick={() => copiar(texto, chave)}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line px-3 text-[12px] font-bold text-ink hover:border-accent"
    >
      {copiado === chave ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {copiado === chave ? tx("Copiado") : tx("Copiar")}
    </button>
  );

  // O mesmo cartão nas duas abas: no Claude é o passo 1; no ChatGPT, só
  // quem prefere o Codex com token precisa dele.
  const cartaoDoToken = (titulo: string) => (
    <section className="card p-5">
      <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink">
        <KeyRound className="h-4 w-4" /> {titulo}
      </div>
      <label
        htmlFor="nome-do-token"
        className="mb-1.5 block text-[12px] text-ink-mute"
      >
        {tx("Nome do token")}{" "}
        <span className="text-ink-dim">
          · {tx("só para você identificar na lista")}
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="nome-do-token"
          className="h-10 max-w-[260px]"
          maxLength={60}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder={tx("Ex.: meu notebook")}
        />
        <Button
          variant="accent"
          onClick={criar}
          disabled={ocupado || !nome.trim() || !user}
        >
          {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {tx("Criar token")}
        </Button>
      </div>
      {erro ? <p className="mt-2 text-[13px] text-pink">{erro}</p> : null}

      {novo ? (
        <div className="mt-4 rounded-xl border border-accent bg-accent/10 p-3">
          <p className="mb-2 text-[12px] text-ink">
            {tx(
              "Copie agora: este token não aparece de novo. Quem tiver o token usa os seus créditos — trate como uma senha.",
            )}
          </p>
          <div className="flex items-center gap-2">
            <code className="mono min-w-0 flex-1 truncate rounded-lg bg-black/40 px-3 py-2 text-[12px] text-ink">
              {novo}
            </code>
            <BotaoCopiar texto={novo} chave="token" />
          </div>
        </div>
      ) : null}
    </section>
  );

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-5 px-4 py-8 sm:px-6 [&>*]:min-w-0">
      <header>
        <h1 className="display text-2xl uppercase text-ink">
          {tx("Claude e ChatGPT (MCP)")}
        </h1>
        <p className="mt-1 text-[14px] text-ink-mute">
          {tx(
            "Conecte o Claude, o ChatGPT ou o Codex à sua conta e peça, numa conversa ou pelo terminal, o que você faz aqui no app. Tudo roda na sua conta, com o seu plano e os seus créditos.",
          )}
        </p>
      </header>

      <div
        role="tablist"
        aria-label={tx("Assistente")}
        className="flex gap-1 rounded-2xl border border-line bg-panel p-1"
      >
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition",
              aba === a.id
                ? "bg-card text-ink"
                : "text-ink-mute hover:text-ink",
            )}
          >
            <a.icone
              className={cn("h-4 w-4 shrink-0", aba === a.id && "text-accent")}
            />
            {tx(a.titulo)}
          </button>
        ))}
      </div>

      {aba === "claude" ? (
        <>
          {cartaoDoToken(tx("1. Crie um token de acesso"))}

          <section className="card p-5">
            <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink">
              <Terminal className="h-4 w-4" /> {tx("2. Rode este comando no terminal")}
            </div>
            <div className="flex items-start gap-2">
              <code className="mono min-w-0 flex-1 whitespace-pre-wrap break-all rounded-lg bg-black/40 px-3 py-2 text-[12px] leading-relaxed text-ink">
                {comando(novo ?? "SEU_TOKEN")}
              </code>
              <BotaoCopiar texto={comando(novo ?? "SEU_TOKEN")} chave="comando" />
            </div>
            <p className="mt-2 text-[12px] text-ink-dim">
              {tx(
                "Depois abra o Claude Code e peça, por exemplo: “liste meus personagens do NIDO” ou “crie um vídeo falado do meu personagem com este roteiro”.",
              )}
            </p>
          </section>

          <section className="card p-5">
            <div className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-ink">
              <Plug className="h-4 w-4" />{" "}
              {tx("Ou conecte pelo aplicativo do Claude (conector)")}
            </div>
            <p className="mb-4 text-[12px] text-ink-dim">
              {tx(
                "No Claude (claude.ai ou aplicativo), sem terminal e sem token: você autoriza com o seu login daqui.",
              )}
            </p>
            <ol className="grid grid-cols-1 gap-3 text-[13px] text-ink">
              <li>
                <strong>a.</strong>{" "}
                {tx(
                  "No Claude, abra Configurações → Conectores e clique em Adicionar → Adicionar conector personalizado.",
                )}
              </li>
              <li>
                <div className="mb-1.5">
                  <strong>b.</strong>{" "}
                  {tx(
                    "Dê um nome (por exemplo, NIDO AI Studio) e cole este endereço:",
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <code className="mono min-w-0 flex-1 truncate rounded-lg bg-black/40 px-3 py-2 text-[12px] text-ink">
                    {`${origem}/api/mcp`}
                  </code>
                  <BotaoCopiar texto={`${origem}/api/mcp`} chave="conector" />
                </div>
                <p className="mt-1.5 text-[12px] text-ink-dim">
                  {tx(
                    "O Claude verifica o servidor sozinho. Quando aparecer “Servidor encontrado”, clique em Continuar.",
                  )}
                </p>
              </li>
              <li>
                <strong>c.</strong>{" "}
                {tx(
                  "Na tela seguinte, não mude nada: deixe “Entrar agora” e “Registrar automaticamente” (os dois marcados como Detectado), sem adicionar cabeçalho. Clique em Adicionar.",
                )}
              </li>
              <li>
                <strong>d.</strong>{" "}
                {tx(
                  "O Claude mostra “Você ainda não está conectado a NIDO AI Studio”. Clique em Vincular.",
                )}
              </li>
              <li>
                <strong>e.</strong>{" "}
                {tx(
                  "Abre a tela do NIDO “Conectar à sua conta NIDO”. Se pedir, entre com o Google; confira a conta e clique em Permitir. Você volta para o Claude já conectado.",
                )}
              </li>
              <li>
                <strong>f.</strong>{" "}
                {tx(
                  "Para usar: abra uma conversa nova no Claude, clique no botão de ferramentas da caixa de mensagem (ao lado de onde você digita) e ligue o NIDO AI Studio na lista de conectores.",
                )}
              </li>
              <li>
                <strong>g.</strong>{" "}
                {tx(
                  "Peça normalmente, por exemplo: “liste meus personagens do NIDO” ou “qual é o meu saldo no NIDO?”. Na primeira vez que usar cada ferramenta, o Claude pede a sua permissão.",
                )}
              </li>
              <li className="text-ink-mute">
                {tx(
                  "O conector aparece na lista de tokens abaixo como “Conector”: é ali que você desliga. Se ele não aparecer na conversa, confira em Configurações → Conectores se está conectado.",
                )}
              </li>
            </ol>
          </section>

          <section className="card p-5">
            <div className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-ink">
              <Cloud className="h-4 w-4" />{" "}
              {tx("Ou use no Claude Code web (claude.ai/code)")}
            </div>
            <p className="mb-4 text-[12px] text-ink-dim">
              {tx(
                "No navegador a sessão roda na nuvem, sem terminal: a conexão vem de um arquivo do seu repositório e o token fica guardado no ambiente.",
              )}
            </p>
            <ol className="grid grid-cols-1 gap-4 text-[13px] text-ink-mute">
              <li>
                <div className="mb-1.5 text-ink">
                  <strong>a.</strong>{" "}
                  {tx(
                    "Crie o arquivo .mcp.json na raiz do repositório, com este conteúdo, e envie para o GitHub (commit e push):",
                  )}
                </div>
                <div className="flex items-start gap-2">
                  <code className="mono min-w-0 flex-1 whitespace-pre-wrap break-all rounded-lg bg-black/40 px-3 py-2 text-[12px] leading-relaxed text-ink">
                    {arquivoMcp}
                  </code>
                  <BotaoCopiar texto={arquivoMcp} chave="arquivo" />
                </div>
                <p className="mt-1.5 text-[12px] text-ink-dim">
                  {tx(
                    "O token não vai no arquivo: o Claude troca ${NIDO_MCP_TOKEN} pelo valor guardado no passo seguinte.",
                  )}
                </p>
              </li>
              <li>
                <div className="mb-1.5 text-ink">
                  <strong>b.</strong>{" "}
                  {tx(
                    "Em claude.ai/code, abra as configurações do ambiente (o “Default”, se só tiver um) e adicione esta variável de ambiente:",
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <code className="mono min-w-0 flex-1 truncate rounded-lg bg-black/40 px-3 py-2 text-[12px] text-ink">
                    {variavel}
                  </code>
                  <BotaoCopiar texto={variavel} chave="variavel" />
                </div>
              </li>
              <li>
                <div className="mb-1.5 text-ink">
                  <strong>c.</strong>{" "}
                  {tx(
                    "Na mesma tela, em acesso à rede, libere este domínio (o ambiente só alcança os domínios da lista):",
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <code className="mono min-w-0 flex-1 truncate rounded-lg bg-black/40 px-3 py-2 text-[12px] text-ink">
                    {dominio}
                  </code>
                  <BotaoCopiar texto={dominio} chave="dominio" />
                </div>
              </li>
              <li className="text-ink">
                <strong>d.</strong>{" "}
                {tx(
                  "Abra uma sessão nova nesse repositório e peça, por exemplo: “qual é o meu saldo no NIDO?”. Tem que ser uma sessão nova: o arquivo e a variável são lidos quando ela começa.",
                )}
              </li>
            </ol>
          </section>
        </>
      ) : (
        <>
          <section className="card p-5">
            <div className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-ink">
              <Bot className="h-4 w-4" /> {tx("Conecte pelo ChatGPT (plugin)")}
            </div>
            <p className="mb-4 text-[12px] text-ink-dim">
              {tx(
                "No ChatGPT, pelo navegador, sem terminal e sem token: você autoriza com o seu login daqui. Precisa de um plano pago do ChatGPT (Plus, Pro, Business, Enterprise ou Edu).",
              )}
            </p>
            <ol className="grid grid-cols-1 gap-3 text-[13px] text-ink">
              <li>
                <strong>a.</strong>{" "}
                {tx(
                  "No ChatGPT, abra Plugins (chatgpt.com/plugins) e clique em Explorar catálogo. No canto de cima à direita, clique em Adicionar → Adicionar servidor MCP personalizado.",
                )}
              </li>
              <li>
                <div className="mb-1.5">
                  <strong>b.</strong>{" "}
                  {tx(
                    "Em Nome, escreva NIDO AI Studio (ícone e descrição são opcionais). Em Conexão, deixe “URL do servidor” e cole este endereço:",
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <code className="mono min-w-0 flex-1 truncate rounded-lg bg-black/40 px-3 py-2 text-[12px] text-ink">
                    {`${origem}/api/mcp`}
                  </code>
                  <BotaoCopiar texto={`${origem}/api/mcp`} chave="chatgpt" />
                </div>
              </li>
              <li>
                <strong>c.</strong>{" "}
                {tx(
                  "Em Autenticação, deixe OAuth — não precisa abrir as Configurações avançadas de OAuth. Marque “Entendo e quero continuar” e clique em Criar como plugin.",
                )}
              </li>
              <li>
                <strong>d.</strong>{" "}
                {tx(
                  "Abre a tela do NIDO “Conectar à sua conta NIDO”. Se pedir, entre com o Google; confira a conta e clique em Permitir. Você volta para o ChatGPT já conectado.",
                )}
              </li>
              <li>
                <strong>e.</strong>{" "}
                {tx(
                  "Para usar: abra uma conversa nova, digite @ na caixa de mensagem, escolha o NIDO AI Studio e peça, por exemplo: “liste meus personagens do NIDO”. O ChatGPT pede a sua confirmação antes de cada ação.",
                )}
              </li>
              <li className="text-ink-mute">
                {tx(
                  "O plugin aparece na lista de tokens abaixo como “Conector”: é ali que você desliga. Se o Adicionar não mostra a opção de servidor MCP, o seu plano do ChatGPT não inclui esse recurso ou, em conta de empresa, o administrador precisa liberar.",
                )}
              </li>
            </ol>
          </section>

          <section className="card p-5">
            <div className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-ink">
              <SquareTerminal className="h-4 w-4" />{" "}
              {tx("Ou use no Codex (terminal, extensão ou aplicativo)")}
            </div>
            <p className="mb-4 text-[12px] text-ink-dim">
              {tx(
                "O Codex da OpenAI guarda a conexão no computador: o que você configurar no terminal vale também para a extensão do editor e para o aplicativo.",
              )}
            </p>
            <ol className="grid grid-cols-1 gap-4 text-[13px] text-ink-mute">
              <li>
                <div className="mb-1.5 text-ink">
                  <strong>a.</strong> {tx("No terminal, adicione o servidor:")}
                </div>
                <div className="flex items-start gap-2">
                  <code className="mono min-w-0 flex-1 whitespace-pre-wrap break-all rounded-lg bg-black/40 px-3 py-2 text-[12px] leading-relaxed text-ink">
                    {codexAdicionar}
                  </code>
                  <BotaoCopiar texto={codexAdicionar} chave="codex-add" />
                </div>
              </li>
              <li>
                <div className="mb-1.5 text-ink">
                  <strong>b.</strong>{" "}
                  {tx(
                    "Faça o login. O navegador abre a tela do NIDO: confira a conta e clique em Permitir.",
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <code className="mono min-w-0 flex-1 truncate rounded-lg bg-black/40 px-3 py-2 text-[12px] text-ink">
                    {codexEntrar}
                  </code>
                  <BotaoCopiar texto={codexEntrar} chave="codex-login" />
                </div>
              </li>
              <li className="text-ink">
                <strong>c.</strong>{" "}
                {tx(
                  "Abra o Codex e peça, por exemplo: “qual é o meu saldo no NIDO?”. Na extensão do editor, o servidor aparece nas configurações de MCP; se pedir, clique em Autenticar.",
                )}
              </li>
              <li>
                <div className="mb-1.5">
                  {tx(
                    "Prefere usar um token? Crie um logo abaixo, guarde na variável de ambiente NIDO_MCP_TOKEN e ponha isto no arquivo ~/.codex/config.toml, no lugar dos passos a e b:",
                  )}
                </div>
                <div className="flex items-start gap-2">
                  <code className="mono min-w-0 flex-1 whitespace-pre-wrap break-all rounded-lg bg-black/40 px-3 py-2 text-[12px] leading-relaxed text-ink">
                    {codexToml}
                  </code>
                  <BotaoCopiar texto={codexToml} chave="codex-toml" />
                </div>
              </li>
            </ol>
          </section>

          {cartaoDoToken(tx("Token de acesso (só para o Codex com token)"))}
        </>
      )}

      <section className="card p-5">
        <div className="mb-3 text-[13px] font-semibold text-ink">
          {tx("O que dá para fazer")}
        </div>
        <ul className="grid gap-1.5 text-[13px] text-ink-mute sm:grid-cols-2">
          {PODE.map((p) => (
            <li key={p} className="flex gap-2">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
              {tx(p)}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-ink-dim">
          {tx(
            "As gerações gastam créditos como no app, e o assistente avisa o custo antes. Compras, reembolsos e saques só são feitos aqui no app.",
          )}
        </p>
      </section>

      <section className="card p-5">
        <div className="mb-3 text-[13px] font-semibold text-ink">
          {tx("Tokens ativos")}
        </div>
        {tokens === null ? (
          <Loader2 className="h-4 w-4 animate-spin text-ink-mute" />
        ) : tokens.length === 0 ? (
          <p className="text-[13px] text-ink-mute">
            {tx("Nenhum token criado ainda.")}
          </p>
        ) : (
          // grid-cols-1 (minmax(0,1fr)): o nome comprido do token trunca em vez de alargar a lista.
          <ul className="grid grid-cols-1 gap-2">
            {tokens.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-xl border border-line px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-ink">
                    {t.nome}
                  </div>
                  <div className="mono truncate text-[11px] text-ink-dim">
                    {t.prefixo}… · {tx("criado em")}{" "}
                    {new Date(t.criadoEm).toLocaleDateString()} ·{" "}
                    {t.ultimoUsoEm
                      ? `${tx("último uso")} ${new Date(t.ultimoUsoEm).toLocaleString()}`
                      : tx("nunca usado")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => revogar(t)}
                  title={tx("Revogar")}
                  aria-label={tx("Revogar")}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-mute transition hover:bg-pink/10 hover:text-pink"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Terminal, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { confirmar } from "@/components/ui/Confirmacao";
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

/**
 * Conta → Claude Code (MCP): cria os tokens com que o Claude Code se conecta
 * à conta e mostra o comando pronto. O token inteiro aparece uma vez só.
 */
export default function Conexoes() {
  const { user } = useAuth();
  const [tokens, setTokens] = useState<TokenApi[] | null>(null);
  const [nome, setNome] = useState("Claude Code");
  const [novo, setNovo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [origem, setOrigem] = useState("");
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

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-5 px-4 py-8 sm:px-6 [&>*]:min-w-0">
      <header>
        <h1 className="display text-2xl uppercase text-ink">
          {tx("Claude Code (MCP)")}
        </h1>
        <p className="mt-1 text-[14px] text-ink-mute">
          {tx(
            "Conecte o Claude Code à sua conta e peça, pelo terminal, o que você faz aqui no app. Tudo roda na sua conta, com o seu plano e os seus créditos.",
          )}
        </p>
      </header>

      <section className="card p-5">
        <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink">
          <KeyRound className="h-4 w-4" /> {tx("1. Crie um token de acesso")}
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
            "As gerações gastam créditos como no app, e o Claude avisa o custo antes. Compras, reembolsos e saques só são feitos aqui no app.",
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
          <ul className="grid gap-2">
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

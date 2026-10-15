"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Box, Check, Download, Loader2, Maximize2, Plus, Trash2, X } from "lucide-react";
import { avisarCreditos, useCreditos } from "@/components/creditos/CreditosProvider";
import { ErroGeracao } from "@/components/creditos/ErroGeracao";
import { pilula } from "@/components/live/Preparar";
import { useRecursos } from "@/components/RecursosProvider";
import { QuemEntra, type ImagemEnviada } from "@/components/sombra/comum";
import { Button } from "@/components/ui/Button";
import { confirmar } from "@/components/ui/Confirmacao";
import { Input, Textarea } from "@/components/ui/Input";
import { SeletorModelo } from "@/components/ui/SeletorModelo";
import { MODELOS_IMAGEM } from "@/lib/ai/modelos-imagem";
import { cn } from "@/lib/cn";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import { dinheiro } from "@/lib/moeda";
import { bloqueioImagem, PLANOS } from "@/lib/planos";
import {
  creditosProdutoCriado,
  DESCRICAO_PRODUTO_MAX,
  NOME_PRODUTO_MAX,
  OPCOES_PRODUTO,
  opcaoProduto,
  PROMPT_PRODUTO_MAX,
  type CoresProduto,
  type ProdutoCriado,
} from "@/lib/produto-criado";
import { downloadUrl, fileUrl } from "@/lib/storage/client";

/**
 * Aba "Criar produto" da tela de vídeo de produto: a IA cria o produto em 3D
 * nas cores da logo da empresa (a partir de uma foto básica ou de uma
 * descrição). Os criados ficam salvos; o escolhido vira a foto do produto.
 */
export function CriarProduto({
  escolhido,
  onEscolher,
}: {
  escolhido: string | null;
  onEscolher: (p: ProdutoCriado | null) => void;
}) {
  const recursos = useRecursos();
  const { conta } = useCreditos();
  const [produtos, setProdutos] = useState<ProdutoCriado[] | null>(null);
  const [novo, setNovo] = useState(false);
  /** Produto aberto em tela cheia. */
  const [aberto, setAberto] = useState<ProdutoCriado | null>(null);

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [base, setBase] = useState<"foto" | "descrever">("foto");
  const [foto, setFoto] = useState<ImagemEnviada | null>(null);
  const [prompt, setPrompt] = useState("");
  const [logo, setLogo] = useState<ImagemEnviada | null>(null);
  const [cores, setCores] = useState<CoresProduto>("logo");
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<{ mensagem: string; code?: string } | null>(null);

  // Só os modelos com o serviço configurado neste deploy (GPT Image roda na OpenAI ou no fal).
  const opcoes = OPCOES_PRODUTO.filter((o) =>
    MODELOS_IMAGEM[o.modelo].provedor === "gemini"
      ? recursos.gemini
      : recursos.fal || (o.modelo === "gpt-image" && recursos.openai),
  );
  const pro = conta ? PLANOS[conta.plano].qualidadePro : true;
  const [opcaoId, setOpcaoId] = useState(() =>
    pro && opcoes.some((o) => o.id === "nano-banana:pro") ? "nano-banana:pro" : (opcoes[0]?.id ?? "nano-banana"),
  );
  const opcao = opcaoProduto(opcaoId) ?? opcoes[0];
  const preco = (id: string) => {
    const o = opcaoProduto(id)!;
    return conta
      ? `${creditosProdutoCriado(o)} ${tx("créditos")}`
      : `~${dinheiro(MODELOS_IMAGEM[o.modelo].custo[o.qualidade], { de: "USD" })}`;
  };
  const bloqueio = conta && opcao ? bloqueioImagem(conta.plano, opcao.modelo, opcao.qualidade) : null;
  const pronto =
    !!opcao && nome.trim().length >= 2 && !!logo && (base === "foto" ? !!foto : prompt.trim().length >= 3);

  useEffect(() => {
    let vivo = true;
    fetch("/api/produto/criar", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { produtos: [] }))
      .then((b: { produtos?: ProdutoCriado[] }) => {
        if (!vivo) return;
        setProdutos(b.produtos ?? []);
        // Sem nenhum criado ainda: o formulário já vem aberto.
        if (!b.produtos?.length) setNovo(true);
      })
      .catch(() => vivo && setProdutos([]));
    return () => {
      vivo = false;
    };
  }, []);

  async function criar() {
    if (!opcao) return;
    setErro(null);
    setCriando(true);
    try {
      const r = await fetch("/api/produto/criar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          descricao,
          fotoKey: base === "foto" ? foto?.key : undefined,
          prompt: base === "descrever" ? prompt : "",
          logoKey: logo?.key,
          cores,
          opcao: opcao.id,
        }),
      });
      const b = await r.json().catch(() => ({}));
      avisarCreditos();
      if (!r.ok || !b.produto)
        return setErro({ mensagem: txErro(b.error ?? `Falha (HTTP ${r.status}).`), code: b.code });
      setProdutos((l) => [b.produto, ...(l ?? [])]);
      onEscolher(b.produto);
      setNovo(false);
    } catch {
      setErro({ mensagem: tx("Sem conexão. Tente de novo.") });
    } finally {
      setCriando(false);
    }
  }

  async function remover(p: ProdutoCriado) {
    const ok = await confirmar({
      titulo: tx("Excluir este produto?"),
      mensagem: tx("Os vídeos já feitos com ele não mudam."),
      confirmar: tx("Excluir"),
      tom: "perigo",
    });
    if (!ok) return;
    const r = await fetch(`/api/produto/criar?id=${encodeURIComponent(p.id)}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) return setErro({ mensagem: tx("Não deu para excluir o produto. Tente de novo.") });
    setProdutos((l) => (l ?? []).filter((x) => x.id !== p.id));
    setAberto(null);
    if (escolhido === p.id) onEscolher(null);
  }

  // Esc fecha a tela cheia.
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(null);
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aberto]);

  if (!opcoes.length)
    return <p className="text-[12.5px] text-ink-dim">{tx("Nenhum modelo de imagem configurado neste servidor.")}</p>;

  return (
    <div className="grid gap-3">
      {produtos === null ? (
        <Loader2 className="h-4 w-4 animate-spin text-ink-mute" />
      ) : produtos.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
          {produtos.map((p) => (
            <div key={p.id} className="group relative">
              <button
                type="button"
                onClick={() => onEscolher(p)}
                aria-pressed={escolhido === p.id}
                title={p.descricao ? `${p.nome} — ${p.descricao}` : p.nome}
                className={cn(
                  "grid w-full gap-1 rounded-xl border p-1 text-left transition cursor-pointer",
                  escolhido === p.id ? "border-accent bg-accent/10" : "border-line hover:border-line-strong",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(p.imageKey)} alt={p.nome} className="aspect-square w-full rounded-lg bg-panel object-cover" />
                <span className="truncate px-0.5 text-[11px] font-semibold text-ink">{p.nome}</span>
              </button>
              {/* Ações sobre a imagem: aparecem ao passar o mouse; no celular, sempre visíveis. */}
              <div className="pointer-events-none absolute inset-x-1 top-1 flex aspect-square items-end justify-center gap-1.5 rounded-lg bg-gradient-to-t from-black/70 via-transparent to-transparent pb-1.5 transition [&>*]:pointer-events-auto sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                <AcaoProduto titulo={tx("Ver grande")} onClick={() => setAberto(p)}>
                  <Maximize2 className="h-3.5 w-3.5" />
                </AcaoProduto>
                <AcaoProduto titulo={tx("Excluir")} onClick={() => void remover(p)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </AcaoProduto>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {produtos?.length && !novo ? (
        <button
          type="button"
          onClick={() => setNovo(true)}
          className="inline-flex items-center gap-1.5 justify-self-start text-[12.5px] font-semibold text-accent hover:underline cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" /> {tx("Novo produto")}
        </button>
      ) : null}

      {novo ? (
        <div className="grid gap-3 rounded-xl border border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              <Box className="h-4 w-4 text-accent" /> {tx("Novo produto em 3D")}
            </span>
            {produtos?.length ? (
              <button
                type="button"
                onClick={() => setNovo(false)}
                aria-label={tx("Fechar")}
                className="text-ink-mute hover:text-ink cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={NOME_PRODUTO_MAX}
            placeholder={tx("Nome do produto")}
            aria-label={tx("Nome do produto")}
          />
          <Textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={2}
            maxLength={DESCRICAO_PRODUTO_MAX}
            placeholder={tx("Descrição: o que é, para que serve (opcional)")}
            aria-label={tx("Descrição")}
          />
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["foto", "Foto básica"],
                ["descrever", "Descrever"],
              ] as const
            ).map(([b, rotulo]) => (
              <button key={b} type="button" onClick={() => setBase(b)} className={cn(pilula(base === b), "h-8 px-3 cursor-pointer")}>
                {tx(rotulo)}
              </button>
            ))}
          </div>
          {base === "foto" ? (
            <QuemEntra
              valor={foto}
              onChange={setFoto}
              textos={{
                enviada: "Foto básica do produto",
                enviar: "Enviar a foto básica",
                dica:
                  cores === "logo"
                    ? "Uma foto simples do produto: a IA mantém a forma e troca as cores."
                    : "Uma foto simples do produto: a IA mantém o produto e só aplica a logo.",
              }}
            />
          ) : (
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              maxLength={PROMPT_PRODUTO_MAX}
              placeholder={tx("Como o produto é: formato, cor, material, detalhes…")}
              aria-label={tx("Como o produto é")}
            />
          )}
          <QuemEntra
            valor={logo}
            onChange={setLogo}
            textos={{
              enviada: "Logo da empresa",
              enviar: "Enviar a logo da empresa",
              dica:
                cores === "logo"
                  ? "As cores do produto saem dela, e ela vai aplicada no produto."
                  : "Ela vai aplicada no produto, que mantém as cores dele.",
            }}
          />
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                ["logo", "Cores da logo", "O produto ganha as cores da logo"],
                ["produto", "Cores do produto", "O produto mantém as cores dele e só recebe a logo"],
              ] as const
            ).map(([v, rotulo, dica]) => (
              <button
                key={v}
                type="button"
                onClick={() => setCores(v)}
                aria-pressed={cores === v}
                title={tx(dica)}
                className={cn(
                  "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-full border px-2 text-[12.5px] font-semibold transition cursor-pointer",
                  cores === v ? "border-accent bg-accent/15 text-ink" : "border-line text-ink-mute hover:text-ink",
                )}
              >
                {tx(rotulo)}
              </button>
            ))}
          </div>
          <div className="grid gap-2">
            <SeletorModelo
              opcoes={opcoes.map((o) => ({ id: o.id, label: o.label, nota: tx(o.nota), preco: preco(o.id) }))}
              valor={opcao?.id ?? ""}
              onChange={setOpcaoId}
              rotulo={tx("Modelo da imagem")}
            />
            {bloqueio ? <p className="text-[12px] text-pink">{tx(bloqueio)}</p> : null}
            <Button onClick={() => void criar()} disabled={!pronto || !!bloqueio || criando}>
              {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Box className="h-4 w-4" />}
              {criando ? tx("Criando o produto…") : `${tx("Criar produto")} · ${preco(opcao!.id)}`}
            </Button>
          </div>
        </div>
      ) : null}

      {erro ? <ErroGeracao mensagem={erro.mensagem} code={erro.code} /> : null}

      {/* Tela cheia (no body: nada da página prende o fixed). A confirmação de excluir fica por cima (z-60). */}
      {aberto
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-label={aberto.nome}
              onClick={(e) => e.target === e.currentTarget && setAberto(null)}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
                <span className="min-w-0 text-[13px] text-white/80">
                  <b className="text-white">{aberto.nome}</b>
                  {aberto.descricao ? ` · ${aberto.descricao}` : ""}
                </span>
                {/* flex-wrap: no celular os botões com texto não cabem numa linha só. */}
                <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                  {escolhido !== aberto.id ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        onEscolher(aberto);
                        setAberto(null);
                      }}
                    >
                      <Check className="h-3.5 w-3.5" /> {tx("Usar este produto")}
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => void remover(aberto)}>
                    <Trash2 className="h-3.5 w-3.5" /> {tx("Excluir")}
                  </Button>
                  <a
                    href={downloadUrl(aberto.imageKey, nomeDoArquivo(aberto.nome))}
                    download={nomeDoArquivo(aberto.nome)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[13px] font-bold text-bg"
                  >
                    <Download className="h-3.5 w-3.5" /> {tx("Baixar")}
                  </a>
                  <button
                    type="button"
                    onClick={() => setAberto(null)}
                    className="grid h-9 w-9 place-items-center rounded-full border border-white/20 text-white/80 hover:text-white cursor-pointer"
                    aria-label={tx("Fechar")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div
                // grid-rows-[minmax(0,1fr)]: prende a linha à altura da área (sem isso o max-h-full da imagem não vale).
                className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] place-items-center p-4 pt-0"
                onClick={() => setAberto(null)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fileUrl(aberto.imageKey)}
                  alt={aberto.nome}
                  className="max-h-full max-w-full rounded-xl object-contain"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/** Botão redondo sobre a miniatura do produto. */
function AcaoProduto({ titulo, onClick, children }: { titulo: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      className="grid h-[26px] w-[26px] place-items-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/30 cursor-pointer"
    >
      {children}
    </button>
  );
}

/** Nome do arquivo baixado: o nome do produto, sem acentos nem espaços. */
function nomeDoArquivo(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${base || "produto"}.jpg`;
}

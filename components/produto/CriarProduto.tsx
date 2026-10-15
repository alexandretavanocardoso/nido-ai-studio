"use client";

import { useEffect, useState } from "react";
import { Box, Loader2, Plus, X } from "lucide-react";
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
import { fileUrl } from "@/lib/storage/client";

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
      titulo: tx("Tirar este produto da lista?"),
      mensagem: tx("Os vídeos já feitos com ele não mudam."),
      confirmar: tx("Tirar"),
      tom: "perigo",
    });
    if (!ok) return;
    const r = await fetch(`/api/produto/criar?id=${encodeURIComponent(p.id)}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) return setErro({ mensagem: tx("Não deu para tirar o produto. Tente de novo.") });
    setProdutos((l) => (l ?? []).filter((x) => x.id !== p.id));
    if (escolhido === p.id) onEscolher(null);
  }

  if (!opcoes.length)
    return <p className="text-[12.5px] text-ink-dim">{tx("Nenhum modelo de imagem configurado neste servidor.")}</p>;

  return (
    <div className="grid gap-3">
      {produtos === null ? (
        <Loader2 className="h-4 w-4 animate-spin text-ink-mute" />
      ) : produtos.length ? (
        <div className="grid grid-cols-3 gap-2">
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
              <button
                type="button"
                onClick={() => void remover(p)}
                aria-label={tx("Tirar da lista")}
                title={tx("Tirar da lista")}
                className="absolute -right-1.5 -top-1.5 hidden h-6 w-6 place-items-center rounded-full border border-line bg-bg text-ink-mute hover:text-ink group-hover:grid cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
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
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["logo", "Seguir a cor da logo"],
                ["produto", "Só adicionar a logo"],
              ] as const
            ).map(([v, rotulo]) => (
              <button key={v} type="button" onClick={() => setCores(v)} className={cn(pilula(cores === v), "h-8 px-3 cursor-pointer")}>
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
    </div>
  );
}

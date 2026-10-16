"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Loader2,
  Radar,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { avisarNaTela } from "@/lib/notificar";
import { copyToClipboard } from "@/lib/export";
import {
  ANOTACOES_MAX,
  buscaNoLinkedin,
  CATEGORIAS,
  NOME_CATEGORIA,
  NOME_STATUS,
  STATUS_FORNECEDOR,
  type Categoria,
  type Fornecedor,
  type FornecedoresAdmin,
  type IdiomaAbordagem,
  type ResumoPesquisa,
  type StatusFornecedor,
} from "@/lib/fornecedores/tipos";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import {
  acaoAdmin,
  dinheiro,
  Estado,
  Filtros,
  haQuanto,
  Secao,
  Selo,
  useAdmin,
} from "./partes";

type FiltroStatus = "" | StatusFornecedor;

/**
 * Aba Fornecedores: empresas de IA (vídeo, imagem e voz) que o agente acha na
 * web toda semana. O contato é feito à mão, pelo LinkedIn — daqui saem o link
 * e o rascunho da mensagem.
 */
export function Fornecedores() {
  const [status, setStatus] = useState<FiltroStatus>("nova");
  const [categoria, setCategoria] = useState<"" | Categoria>("");
  const { dados, erro, carregando, recarregar, setDados } =
    useAdmin<FornecedoresAdmin>(`/api/admin/fornecedores?status=${status}`);
  const [pesquisando, setPesquisando] = useState(false);

  const total = (s: string) =>
    dados?.totais.find((t) => t.status === s)?.n ?? 0;
  const itens =
    dados?.itens.filter(
      (f) => !categoria || f.categorias.includes(categoria),
    ) ?? [];

  async function pesquisar() {
    setPesquisando(true);
    try {
      const r = await acaoAdmin<ResumoPesquisa>("/api/admin/fornecedores", {});
      // O mesmo erro nas três categorias (chave, saldo) aparece uma vez só.
      const erros = [...new Set(r.falhas.map((f) => f.erro))];
      const falhas =
        erros.length === 1
          ? erros[0]
          : r.falhas
              .map((f) => `${NOME_CATEGORIA[f.categoria]}: ${f.erro}`)
              .join(" · ");
      const feito = `${r.novos} ${r.novos === 1 ? "empresa nova" : "empresas novas"} (de ${r.achados} achadas) · custo ${dinheiro(r.usd, "USD")}`;
      avisarNaTela(
        r.falhas.length === CATEGORIAS.length
          ? `A pesquisa não rodou. ${falhas}`
          : feito +
            (erros.length === 1
              ? ` · Falhou em ${r.falhas.map((f) => NOME_CATEGORIA[f.categoria]).join(" e ")}: ${falhas}`
              : falhas
                ? ` · Falhou em ${falhas}`
                : ""),
        { tom: falhas ? "erro" : "ok" },
      );
      if (status === "nova") recarregar();
      else setStatus("nova");
    } catch (e) {
      avisarNaTela((e as Error).message, { tom: "erro" });
    } finally {
      setPesquisando(false);
    }
  }

  const trocar = (f: Fornecedor) =>
    setDados((d) =>
      d ? { ...d, itens: d.itens.map((i) => (i.id === f.id ? f : i)) } : d,
    );

  return (
    <Secao
      titulo="Fornecedores de IA"
      descricao="Empresas de vídeo, imagem e voz que o agente acha na web toda segunda, com prioridade para a China. Confira as fontes antes de procurar a empresa: preço e API podem estar errados."
      acoes={
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-ink-dim">
            {dados
              ? dados.ultimaBusca
                ? `Última pesquisa ${haQuanto(dados.ultimaBusca)}`
                : "Nenhuma pesquisa ainda"
              : ""}
          </span>
          <Button
            size="sm"
            variant="accent"
            disabled={pesquisando}
            onClick={pesquisar}
          >
            {pesquisando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Radar className="h-3.5 w-3.5" />
            )}
            Pesquisar agora
          </Button>
        </div>
      }
    >
      {pesquisando ? (
        <div className="rounded-xl border border-line bg-panel px-4 py-3 text-sm text-ink-mute">
          Pesquisando vídeo, imagem e voz. Leva de 2 a 3 minutos; deixe esta aba
          aberta.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Filtros<FiltroStatus>
          rotulo="Status"
          valor={status}
          onChange={setStatus}
          opcoes={[
            ...STATUS_FORNECEDOR.map((s) => ({
              id: s,
              rotulo: NOME_STATUS[s],
              n: total(s),
            })),
            { id: "" as const, rotulo: "Todas" },
          ]}
        />
        <Filtros<"" | Categoria>
          rotulo="Categoria"
          valor={categoria}
          onChange={setCategoria}
          opcoes={[
            { id: "", rotulo: "Tudo" },
            ...CATEGORIAS.map((c) => ({ id: c, rotulo: NOME_CATEGORIA[c] })),
          ]}
        />
      </div>

      <Estado
        carregando={carregando}
        erro={erro}
        vazio={!itens.length}
        textoVazio={
          dados?.ultimaBusca
            ? "Nenhum fornecedor aqui."
            : "Nenhum fornecedor ainda. Clique em “Pesquisar agora” para a primeira rodada."
        }
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {itens.map((f) => (
          <Ficha key={f.id} f={f} trocar={trocar} recarregar={recarregar} />
        ))}
      </div>
    </Secao>
  );
}

const link =
  "inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[12px] font-bold text-ink transition hover:border-accent";

function Ficha({
  f,
  trocar,
  recarregar,
}: {
  f: Fornecedor;
  trocar: (f: Fornecedor) => void;
  recarregar: () => void;
}) {
  const [aberta, setAberta] = useState(false);
  const [anotacoes, setAnotacoes] = useState(f.anotacoes ?? "");
  const [agindo, setAgindo] = useState<"status" | IdiomaAbordagem | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function agir(
    qual: "status" | IdiomaAbordagem | null,
    corpo: Record<string, string>,
  ): Promise<Fornecedor | null> {
    setAgindo(qual);
    setErro(null);
    try {
      return await acaoAdmin<Fornecedor>(
        `/api/admin/fornecedores/${encodeURIComponent(f.id)}`,
        corpo,
      );
    } catch (e) {
      setErro((e as Error).message);
      return null;
    } finally {
      setAgindo(null);
    }
  }

  async function mudarStatus(status: string) {
    // Recarrega: a ficha pode sair do filtro aberto e as contagens mudam.
    if (await agir("status", { acao: "status", status })) recarregar();
  }
  async function guardarAnotacoes() {
    if (anotacoes.trim() === (f.anotacoes ?? "")) return;
    const novo = await agir(null, { acao: "anotacoes", anotacoes });
    if (novo) trocar(novo);
  }
  async function rascunho(idioma: IdiomaAbordagem) {
    const novo = await agir(idioma, { acao: "abordagem", idioma });
    if (novo) trocar(novo);
  }

  return (
    <article className="card grid min-w-0 content-start gap-3 p-4 text-[13px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] font-bold text-ink">{f.nome}</div>
          <div className="text-[12px] text-ink-mute">
            {[f.pais, ...f.categorias.map((c) => NOME_CATEGORIA[c])]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {f.api === "sim" ? (
            <Selo tom="ok">Tem API</Selo>
          ) : f.api === "nao" ? (
            <Selo tom="erro">Sem API</Selo>
          ) : (
            <Selo>API a confirmar</Selo>
          )}
          <Selo tom={f.nota >= 8 ? "alerta" : "neutro"}>Nota {f.nota}</Selo>
        </div>
      </div>

      {f.oferece ? <p className="leading-relaxed text-ink">{f.oferece}</p> : null}

      <dl className="grid gap-2">
        {f.porque ? <Fato rotulo="Por que interessa">{f.porque}</Fato> : null}
        <Fato rotulo="Preço">{f.preco ?? "Não divulgado"}</Fato>
        {f.pessoas ? <Fato rotulo="Pessoas">{f.pessoas}</Fato> : null}
      </dl>

      <div className="flex flex-wrap gap-2">
        <a
          href={f.linkedin ?? buscaNoLinkedin(f.nome)}
          target="_blank"
          rel="noopener noreferrer"
          className={link}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {f.linkedin ? "LinkedIn" : "Procurar no LinkedIn"}
        </a>
        {f.site ? (
          <a
            href={f.site}
            target="_blank"
            rel="noopener noreferrer"
            className={link}
          >
            <ExternalLink className="h-3.5 w-3.5" /> Site
          </a>
        ) : null}
        {f.fontes.map((fonte, i) => (
          <a
            key={fonte.url}
            href={fonte.url}
            target="_blank"
            rel="noopener noreferrer"
            title={fonte.titulo}
            className={cn(link, "font-semibold text-ink-mute")}
          >
            Fonte {i + 1}
          </a>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <label className="flex items-center gap-2 text-[12px] text-ink-mute">
          Status
          <select
            value={f.status}
            disabled={agindo === "status"}
            onChange={(e) => mudarStatus(e.target.value)}
            className="h-8 rounded-full border border-line bg-panel px-3 text-[12px] font-semibold text-ink focus:border-accent focus:outline-none"
          >
            {STATUS_FORNECEDOR.map((s) => (
              <option key={s} value={s}>
                {NOME_STATUS[s]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setAberta((a) => !a)}
          aria-expanded={aberta}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-mute hover:text-ink"
        >
          Mensagem e anotações
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition", aberta && "rotate-180")}
          />
        </button>
      </div>

      {erro ? <p className="text-[12px] text-pink">{erro}</p> : null}

      {aberta ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["en", "Rascunho em inglês"],
                ["zh", "Rascunho em chinês"],
              ] as const
            ).map(([idioma, nome]) => (
              <Button
                key={idioma}
                size="sm"
                variant="ghost"
                disabled={agindo !== null}
                onClick={() => rascunho(idioma)}
              >
                {agindo === idioma ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {nome}
              </Button>
            ))}
          </div>
          {f.abordagem ? (
            <>
              <Rascunho rotulo="Nota do convite" texto={f.abordagem.convite} />
              <Rascunho
                rotulo="Mensagem depois de aceitar"
                texto={f.abordagem.mensagem}
              />
            </>
          ) : null}
          <div>
            <div className="label-cap mb-1">Anotações</div>
            <Textarea
              rows={3}
              maxLength={ANOTACOES_MAX}
              placeholder="Com quem falou, o que responderam, próximo passo…"
              value={anotacoes}
              onChange={(e) => setAnotacoes(e.target.value)}
              onBlur={guardarAnotacoes}
            />
          </div>
        </div>
      ) : null}
    </article>
  );
}

function Fato({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="label-cap">{rotulo}</dt>
      <dd className="whitespace-pre-wrap text-ink-mute">{children}</dd>
    </div>
  );
}

/** Texto do rascunho com botão de copiar (quem envia é o admin, no LinkedIn). */
function Rascunho({ rotulo, texto }: { rotulo: string; texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="label-cap">
          {rotulo} · {texto.length} caracteres
        </span>
        <button
          type="button"
          onClick={async () => {
            if (await copyToClipboard(texto)) {
              setOk(true);
              setTimeout(() => setOk(false), 1200);
            }
          }}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-mute hover:text-ink"
        >
          {ok ? (
            <Check className="h-3.5 w-3.5 text-ok" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          Copiar
        </button>
      </div>
      <p className="whitespace-pre-wrap leading-relaxed text-ink">{texto}</p>
    </div>
  );
}

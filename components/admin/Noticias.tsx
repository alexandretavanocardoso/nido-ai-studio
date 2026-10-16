"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExternalLink, Loader2, Newspaper } from "lucide-react";
import { avisarNaTela } from "@/lib/notificar";
import {
  AGENTES,
  ALVOS,
  alvosLidos,
  NOME_AGENTE,
  NOME_FONTE,
  type Agente,
  type Noticia,
  type NoticiasAdmin,
  type ResumoNoticias,
} from "@/lib/noticias/tipos";
import { quandoPublicado } from "@/lib/radar/tipos";
import { Button } from "@/components/ui/Button";
import {
  acaoAdmin,
  dia,
  diaHora,
  dinheiro,
  Estado,
  Filtros,
  haQuanto,
  Secao,
  Selo,
  useAdmin,
} from "./partes";

const DESCRICAO: Record<Agente, string> = {
  concorrentes:
    "O que os concorrentes anunciaram no X e no site, lido todo dia por um agente. Nota 9 ou 10 também chega no sino. Abra a fonte antes de agir: o resumo pode errar.",
  ias: "O que mudou nas IAs que o NIDO usa (modelos, preços, limites), lido todo dia por um agente. Nota 9 ou 10 também chega no sino. Abra a fonte antes de agir: o resumo pode errar.",
};

/** Quando a notícia saiu: a hora exata se for post do X, senão o que a fonte informou. */
function publicado(n: Noticia): string | null {
  const q = quandoPublicado({
    url: n.url ?? undefined,
    publicadoEm: n.publicadoEm ?? undefined,
  });
  if (!q) return null;
  return q.comHora ? diaHora(q.data.toISOString()) : dia(q.data.toISOString());
}

/**
 * Aba Notícias: dois agentes — concorrentes e IAs que o NIDO usa. Quem cada um
 * acompanha fica em lib/noticias/tipos.ts.
 */
export function Noticias() {
  // O aviso do sino abre a aba já no agente da notícia (?agente=).
  const pedido = useSearchParams().get("agente");
  const [agente, setAgente] = useState<Agente>(
    AGENTES.find((a) => a === pedido) ?? "concorrentes",
  );
  const [alvo, setAlvo] = useState("");
  const { dados, erro, carregando, recarregar } = useAdmin<NoticiasAdmin>(
    `/api/admin/noticias?agente=${agente}`,
  );
  const [pesquisando, setPesquisando] = useState(false);

  const alvos = ALVOS[agente];
  const nomeAlvo = (id: string) => alvos.find((a) => a.id === id)?.nome ?? id;
  const semLeitura = alvos.filter((a) => !alvosLidos(agente).includes(a));
  const itens = dados?.itens.filter((n) => !alvo || n.alvo === alvo) ?? [];

  async function pesquisar() {
    setPesquisando(true);
    try {
      const r = await acaoAdmin<ResumoNoticias>("/api/admin/noticias", {
        agente,
      });
      const falha = r.falhas[0]?.erro;
      avisarNaTela(
        falha
          ? `A pesquisa não rodou. ${falha}`
          : `${r.novos} ${r.novos === 1 ? "notícia nova" : "notícias novas"} · custo ${dinheiro(r.usd, "USD")}` +
            (r.usouX.length ? " (sem contar a leitura do X)" : " · o X não foi lido"),
        { tom: falha ? "erro" : "ok" },
      );
      recarregar();
    } catch (e) {
      avisarNaTela((e as Error).message, { tom: "erro" });
    } finally {
      setPesquisando(false);
    }
  }

  return (
    <Secao
      titulo={`Notícias · ${NOME_AGENTE[agente]}`}
      descricao={DESCRICAO[agente]}
      acoes={
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-ink-dim">
            {dados
              ? dados.ultimaBusca
                ? `Última leitura ${haQuanto(dados.ultimaBusca)}`
                : "Nenhuma leitura ainda"
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
              <Newspaper className="h-3.5 w-3.5" />
            )}
            Ler agora
          </Button>
        </div>
      }
    >
      {pesquisando ? (
        <div className="rounded-xl border border-line bg-panel px-4 py-3 text-sm text-ink-mute">
          Lendo o X e a web. Leva de 1 a 2 minutos; deixe esta aba aberta.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Filtros<Agente>
          rotulo="Agente"
          valor={agente}
          onChange={(a) => {
            setAgente(a);
            setAlvo("");
          }}
          opcoes={AGENTES.map((a) => ({ id: a, rotulo: NOME_AGENTE[a] }))}
        />
        <Filtros<string>
          rotulo="Quem"
          valor={alvo}
          onChange={setAlvo}
          opcoes={[
            { id: "", rotulo: "Todos" },
            ...alvos.map((a) => ({ id: a.id, rotulo: a.nome })),
          ]}
        />
      </div>

      {semLeitura.length || (dados && !dados.comX) ? (
        <p className="text-[12px] text-ink-dim">
          {dados && !dados.comX
            ? "O X não está configurado neste deploy (XAI_API_KEY): o agente lê só a web. "
            : ""}
          {semLeitura.length
            ? `Ainda sem leitura: ${semLeitura.map((a) => a.nome).join(", ")} (falta o perfil do X ou o site em lib/noticias/tipos.ts).`
            : ""}
        </p>
      ) : null}

      <Estado
        carregando={carregando}
        erro={erro}
        vazio={!itens.length}
        textoVazio={
          dados?.ultimaBusca
            ? "Nenhuma notícia aqui."
            : "Nenhuma notícia ainda. Clique em “Ler agora” para a primeira rodada."
        }
      />
      <div className="grid gap-3">
        {itens.map((n) => {
          const quando = publicado(n);
          return (
            <article key={n.id} className="card grid min-w-0 gap-2 p-4 text-[13px]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-bold text-ink">{n.titulo}</div>
                  <div className="text-[12px] text-ink-mute">
                    {[
                      nomeAlvo(n.alvo),
                      NOME_FONTE[n.fonte],
                      quando ?? `lida em ${dia(n.criadoEm)}`,
                    ].join(" · ")}
                  </div>
                </div>
                <Selo tom={n.nota >= 8 ? "alerta" : "neutro"}>Nota {n.nota}</Selo>
              </div>
              {n.resumo ? (
                <p className="leading-relaxed text-ink">{n.resumo}</p>
              ) : null}
              {n.impacto ? (
                <div>
                  <div className="label-cap">Para o NIDO</div>
                  <p className="text-ink-mute">{n.impacto}</p>
                </div>
              ) : null}
              {n.url ? (
                <a
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 justify-self-start text-[12px] font-bold text-ink hover:text-accent"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir a fonte
                </a>
              ) : null}
            </article>
          );
        })}
      </div>
    </Secao>
  );
}

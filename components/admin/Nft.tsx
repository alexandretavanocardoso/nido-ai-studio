"use client";

import { useState } from "react";
import {
  Check,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import type { PainelNft } from "@/lib/nft/admin";
import { FAUCET_DEVNET } from "@/lib/nft/comum";
import { confirmar } from "@/components/ui/Confirmacao";
import {
  acaoAdmin,
  Copiavel,
  diaHora,
  Estado,
  Kpi,
  num,
  Secao,
  Selo,
  Tabela,
  useAdmin,
} from "./partes";

/**
 * Documento do desenho: fluxo on-chain, as três chaves, catálogo de badges e a
 * auditoria (falhas possíveis e o controle de cada uma). Abre em outra aba — a
 * página do claude.ai não aceita ser embutida em outro site — e é privada: só
 * abre para quem o dono compartilhou.
 */
const DESENHO_DO_FLUXO = "https://claude.ai/artifact/AFqUwmxx3WgZGdo7MKugJc";

const TOM_STATUS: Record<string, "ok" | "alerta" | "erro" | "neutro"> = {
  confirmado: "ok",
  enviado: "alerta",
  preparando: "alerta",
  falhou: "erro",
};
const NOME_STATUS: Record<string, string> = {
  confirmado: "Confirmado",
  enviado: "Confirmando",
  preparando: "Preparando",
  falhou: "Falhou",
};

/**
 * Aba "NFT": saldo e teto das chaves, badges que esperam aprovação (marcas de
 * 1 milhão de views para cima, ou leitura com salto) e os mints.
 */
export function Nft({
  abrirUsuario,
}: {
  abrirUsuario: (id: string | null) => void;
}) {
  const { dados, erro, carregando, recarregar, setDados } =
    useAdmin<PainelNft>("/api/admin/nft");
  const [decidindo, setDecidindo] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);

  async function decidir(
    b: PainelNft["aguardando"][number],
    aprovar: boolean,
  ) {
    const ok = await confirmar({
      titulo: aprovar
        ? `Aprovar “${b.nomeBadge}” de ${b.personagem}?`
        : `Recusar “${b.nomeBadge}” de ${b.personagem}?`,
      mensagem: aprovar
        ? "O badge passa a valer e é gravado no NFT na próxima rodada. Depois de gravado, só sai reescrevendo o NFT."
        : "O badge não vale e não volta a ser concedido a este personagem.",
      confirmar: aprovar ? "Aprovar" : "Recusar",
      tom: aprovar ? undefined : "perigo",
    });
    if (!ok) return;
    setFalha(null);
    setDecidindo(`${b.characterId}:${b.badge}`);
    try {
      setDados(
        await acaoAdmin<PainelNft>("/api/admin/nft", {
          characterId: b.characterId,
          badge: b.badge,
          aprovar,
        }),
      );
    } catch (e) {
      setFalha((e as Error).message);
    } finally {
      setDecidindo(null);
    }
  }

  if (!dados)
    return (
      <Estado carregando={carregando} erro={erro} vazio textoVazio="" />
    );
  const saldoBaixo = dados.saldo !== null && dados.saldo < dados.saldoMinimo;

  return (
    <div className="grid gap-6 min-w-0">
      <Secao
        titulo="NFT do influencer"
        descricao={
          dados.ligado
            ? `Rede: ${dados.rede}. A chave de mint paga as taxas; abaixo do saldo mínimo o mint para e o log avisa.`
            : "Desligado neste deploy: faltam NFT_REDE, NFT_COLECAO, NFT_MINT_SECRET_KEY ou NFT_BADGE_SECRET_KEY."
        }
        acoes={
          <button
            type="button"
            onClick={recarregar}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-mute hover:text-ink"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </button>
        }
      >
        <a
          href={DESENHO_DO_FLUXO}
          target="_blank"
          rel="noopener noreferrer"
          className="card p-4 flex items-center gap-3 hover:border-accent/50 transition"
        >
          <span className="h-10 w-10 rounded-xl bg-accent/15 text-accent grid place-items-center shrink-0">
            <FileText className="w-5 h-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold text-ink">
              Desenho do fluxo on-chain e auditoria
            </span>
            <span className="block text-[12px] text-ink-mute">
              Como o mint e os badges funcionam, as três chaves, o catálogo e
              cada falha possível com o seu controle. Abre em outra aba; só
              para quem tem acesso ao documento.
            </span>
          </span>
          <ExternalLink className="w-4 h-4 text-ink-mute shrink-0" />
        </a>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi
            rotulo="Saldo da chave de mint"
            valor={dados.saldo === null ? "—" : `${dados.saldo.toFixed(4)} SOL`}
            detalhe={`Mínimo: ${dados.saldoMinimo} SOL`}
            destaque={saldoBaixo}
          />
          <Kpi
            rotulo="Mints em 24h"
            valor={num(dados.mints24h)}
            detalhe={`Teto: ${num(dados.tetoDia)}`}
            destaque={dados.mints24h >= dados.tetoDia}
          />
          <Kpi rotulo="NFTs confirmados" valor={num(dados.confirmados)} />
          <Kpi
            rotulo="Badges esperando"
            valor={num(dados.aguardando.length)}
            destaque={dados.aguardando.length > 0}
          />
        </div>
        {dados.ligado ? (
          <div className="card p-4 grid gap-1.5 text-[13px] text-ink-mute">
            <div>
              Coleção: <Copiavel texto={dados.colecao ?? ""} curto={12} />
            </div>
            <div>
              Chave de mint: <Copiavel texto={dados.chaveMint ?? ""} curto={12} />
            </div>
            <div>
              Chave de badges:{" "}
              <Copiavel texto={dados.chaveBadges ?? ""} curto={12} />
            </div>
            {dados.rede === "devnet" ? (
              <div className="mt-1.5 border-t border-line pt-2.5">
                Rede de teste: para abastecer a chave de mint, copie o endereço
                dela acima e peça SOL de teste no{" "}
                <a
                  href={FAUCET_DEVNET}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                >
                  faucet da Solana <ExternalLink className="w-3 h-3" />
                </a>{" "}
                (escolha devnet).
              </div>
            ) : null}
          </div>
        ) : null}
      </Secao>

      <Secao
        titulo="Badges esperando aprovação"
        descricao="Marcas de 1 milhão de views para cima, e badges liberados numa leitura em que as views de um post saltaram fora do normal. Confira os posts do personagem antes de aprovar."
      >
        {falha ? (
          <div className="rounded-xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink">
            {falha}
          </div>
        ) : null}
        {dados.aguardando.length ? (
          <Tabela
            colunas={["Personagem", "Badge", "Total", "Motivo", ""]}
            larguras={["", 150, 130, 220, 150]}
            minimo={760}
          >
            {dados.aguardando.map((b) => {
              const chave = `${b.characterId}:${b.badge}`;
              return (
                <tr key={chave} className="hover:bg-panel/60 transition">
                  <td className="px-3 py-3">
                    <div className="text-ink font-semibold truncate">
                      {b.personagem}
                    </div>
                    <button
                      type="button"
                      onClick={() => b.userId && abrirUsuario(b.userId)}
                      className="text-[12px] text-ink-dim hover:text-accent truncate block max-w-full text-left"
                    >
                      {b.email ?? "usuário removido"}
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-ink truncate">{b.nomeBadge}</div>
                    <div className="text-[12px] text-ink-dim truncate">
                      {diaHora(b.quando)}
                    </div>
                  </td>
                  <td className="px-3 py-3 tabular-nums">
                    <div className="text-ink font-semibold">
                      {num(b.valor)}{" "}
                      <span className="font-normal text-ink-mute">
                        {b.unidade}
                      </span>
                    </div>
                    <div className="text-[12px] text-ink-dim">
                      agora {num(b.valorAgora)}
                    </div>
                  </td>
                  <td
                    className="px-3 py-3 text-[12px] text-ink-mute"
                    title={b.motivo ?? undefined}
                  >
                    {b.motivo ?? "—"}
                  </td>
                  <td className="px-3 py-3">
                    {decidindo === chave ? (
                      <Loader2 className="w-4 h-4 animate-spin text-ink-mute" />
                    ) : (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          disabled={decidindo !== null}
                          onClick={() => decidir(b, true)}
                          className="inline-flex h-8 items-center gap-1 rounded-full bg-accent px-3 text-[12px] font-bold text-bg hover:brightness-110 disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" /> Aprovar
                        </button>
                        <button
                          type="button"
                          disabled={decidindo !== null}
                          onClick={() => decidir(b, false)}
                          title="Recusar"
                          aria-label="Recusar"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-mute hover:border-pink hover:text-pink disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </Tabela>
        ) : (
          <div className="card p-6 text-center text-[13px] text-ink-mute">
            Nenhum badge esperando aprovação.
          </div>
        )}
      </Secao>

      <Secao
        titulo="Mints"
        descricao="Os 100 mais recentes. Mint que falha devolve os créditos sozinho."
      >
        {dados.mints.length ? (
          <Tabela
            colunas={["Personagem", "Status", "NFT", "Badges no NFT", ""]}
            larguras={["", 120, 150, 130, 110]}
            minimo={760}
          >
            {dados.mints.map((m) => (
              <tr key={m.id} className="hover:bg-panel/60 transition">
                <td className="px-3 py-3">
                  <div className="text-ink font-semibold truncate">
                    {m.personagem}
                  </div>
                  <button
                    type="button"
                    onClick={() => m.userId && abrirUsuario(m.userId)}
                    className="text-[12px] text-ink-dim hover:text-accent truncate block max-w-full text-left"
                  >
                    {m.email ?? "usuário removido"} · {diaHora(m.quando)}
                  </button>
                </td>
                <td className="px-3 py-3">
                  <Selo tom={TOM_STATUS[m.status] ?? "neutro"}>
                    {NOME_STATUS[m.status] ?? m.status}
                  </Selo>
                  {m.rede !== dados.rede ? (
                    <div
                      className="mt-1 text-[11px] font-bold uppercase tracking-wide text-ink-dim"
                      title="Mint feito em outra rede. Este app só mexe nos mints da rede em que está."
                    >
                      {m.rede}
                    </div>
                  ) : null}
                  {m.erro ? (
                    <div
                      className="mt-1 text-[11px] text-ink-dim truncate"
                      title={m.erro}
                    >
                      {m.erro}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  <Copiavel texto={m.asset} curto={8} />
                  <div className="text-[11px] text-ink-dim truncate">
                    de <Copiavel texto={m.carteira} curto={6} />
                  </div>
                </td>
                <td className="px-3 py-3 text-ink tabular-nums">
                  {m.badges.length}
                </td>
                <td className="px-3 py-3 truncate">
                  {m.status === "falhou" && !m.linkTransacao ? null : (
                    <a
                      href={m.linkTransacao ?? m.linkAsset}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline"
                    >
                      Ver na rede <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </Tabela>
        ) : (
          <div className="card p-6 text-center text-[13px] text-ink-mute">
            Nenhum mint ainda.
          </div>
        )}
      </Secao>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Gift, Loader2, PartyPopper, Trophy, Upload, UserRound } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRecursos } from "@/components/RecursosProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import { avisarNaTela } from "@/lib/notificar";
import { PONTOS_POR_PARTICIPAR, reais, type Entrega, type MinhaParticipacao, type SorteioPublico } from "@/lib/sorteio/tipos";
import { capaSrc, fileUrl, uploadFile } from "@/lib/storage/client";
import { useCharacters } from "@/lib/store";
import { Corrida } from "./Corrida";
import { textoPremio, useSorteio } from "./comum";

/** Escolha de quem corre: a foto enviada (em vez do id de um influencer). */
const FOTO = "foto";

interface Resposta {
  sorteio: SorteioPublico | null;
  eu: MinhaParticipacao | null;
  ganhei?: boolean;
  entrega?: Entrega | null;
}

/**
 * /app/sorteio — o sorteio da vez: a corrida de influencers (a mesma do palco
 * da live, ao mesmo tempo) e a participação da conta: o nome na corrida e o
 * influencer que corre por ela. O ganhador recebe o presente na conta quando
 * cruza a linha.
 */
export function Sorteio() {
  const { user } = useAuth();
  const recursos = useRecursos();
  // Sem conta: o link do sorteio leva ao login e volta para cá.
  const semConta = recursos.login && user === undefined;
  const { dados, erro, desvio, recarregar } = useSorteio<Resposta>(semConta || user === null ? null : "/api/sorteio");
  const s = dados?.sorteio ?? null;
  const eu = dados?.eu ?? null;

  // Ganhou: avisa uma vez (o sino também recebe, do servidor).
  const avisou = useRef(false);
  useEffect(() => {
    if (!dados?.ganhei || avisou.current) return;
    avisou.current = true;
    avisarNaTela(tx("Você ganhou o sorteio! O presente já está na sua conta."), { tom: "ok", href: "/app/planos" });
  }, [dados?.ganhei]);

  return (
    <main className="mx-auto max-w-[1180px] px-4 sm:px-6 py-6 sm:py-10 grid grid-cols-[minmax(0,1fr)] gap-6">
      <header className="grid gap-1">
        <h1 className="display text-3xl sm:text-4xl uppercase text-ink flex items-center gap-3">
          <Trophy className="w-7 h-7 text-accent" />
          {tx("Sorteio")}
        </h1>
        {s ? (
          <p className="text-[15px] text-ink-mute">
            <b className="text-ink">{s.titulo}</b> · {tx("Prêmio")}: {textoPremio(s.premio)}
            {s.premio.tipo === "plano" ? <span className="text-ink-dim"> ({tx("sem renovação automática")})</span> : null}
          </p>
        ) : null}
      </header>

      {semConta ? (
        <div className="card grid justify-items-start gap-3 p-6">
          <p className="text-[15px] font-bold text-ink">{tx("Entre na sua conta para participar do sorteio.")}</p>
          <p className="text-[13px] text-ink-mute">{tx("O ganhador recebe o presente direto na conta NIDO. Depois de entrar, você volta para esta página.")}</p>
          <Link
            href={`/auth/login?voltar=${encodeURIComponent("/app/sorteio")}`}
            className="inline-flex min-h-10 items-center rounded-full bg-accent px-5 text-sm font-bold text-bg hover:brightness-110"
          >
            {tx("Entrar")}
          </Link>
        </div>
      ) : !dados ? (
        erro ? <p className="text-[13px] text-pink">{txErro(erro)}</p> : <Loader2 className="w-5 h-5 animate-spin text-ink-mute" />
      ) : !s ? (
        <div className="card p-8 text-center text-[14px] text-ink-mute">{tx("Nenhum sorteio no momento. Fique de olho nas lives do NIDO!")}</div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-line bg-black">
            <Corrida sorteio={s} desvio={desvio} destaque={eu?.id} />
          </div>
          <Participacao s={s} eu={eu} ganhei={!!dados.ganhei} entrega={dados.entrega ?? null} onMudou={recarregar} />
        </>
      )}
    </main>
  );
}

function Participacao({
  s,
  eu,
  ganhei,
  entrega,
  onMudou,
}: {
  s: SorteioPublico;
  eu: MinhaParticipacao | null;
  ganhei: boolean;
  entrega: Entrega | null;
  onMudou: () => Promise<void>;
}) {
  // A vaga sai na hora; o corredor ainda está sendo desenhado (uns 15 s).
  const [preparando, setPreparando] = useState(false);

  if (s.status === "concluido") {
    const vencedor = s.vencedor !== null ? s.corredores[s.vencedor] : null;
    return ganhei ? (
      <div className="card grid gap-2 border-accent/50 bg-accent/10 p-6">
        <p className="flex items-center gap-2 text-[18px] font-bold text-ink">
          <PartyPopper className="w-5 h-5 text-accent" />
          {tx("Você ganhou o sorteio!")}
        </p>
        {entrega?.tipo === "pix" ? (
          <ChavePix s={s} entrega={entrega} onMudou={onMudou} />
        ) : (
          <p className="text-[14px] text-ink-mute">
            {entrega?.tipo === "creditos"
              ? entrega.plano
                ? `${entrega.creditos.toLocaleString()} ${tx("créditos do presente já estão na sua conta (você já tinha um plano, então ele continua como está).")}`
                : `${entrega.creditos.toLocaleString()} ${tx("créditos já estão na sua conta.")}`
              : entrega?.tipo === "pontos"
                ? `${entrega.pontos.toLocaleString()} ${tx("pontos já estão na sua conta.")}`
                : entrega?.tipo === "plano"
                  ? `${textoPremio(s.premio)} ${tx("ativado na sua conta até")} ${new Date(entrega.ate).toLocaleDateString()}. ${tx("Não renova sozinho.")}`
                  : tx("O presente já está na sua conta.")}
          </p>
        )}
        <p className="text-[13px] text-ink-mute">
          + {PONTOS_POR_PARTICIPAR} {tx("pontos por participar.")}
        </p>
      </div>
    ) : (
      <div className="card p-6 text-[14px] text-ink-mute">
        {vencedor ? (
          <>
            {tx("Quem ganhou")}: <b className="text-ink">{vencedor.nome}</b>.{" "}
            {eu ? (
              <>
                {tx("Não foi desta vez — obrigado por participar!")} {tx("Você ganhou")}{" "}
                <b className="text-ink">{PONTOS_POR_PARTICIPAR} {tx("pontos por participar.")}</b>
              </>
            ) : null}
          </>
        ) : (
          tx("O sorteio terminou.")
        )}
      </div>
    );
  }

  if (s.status === "correndo")
    return (
      <div className="card p-6 text-[14px] text-ink-mute">
        {eu ? tx("A corrida começou! Você está com a plaquinha amarela.") : tx("A corrida começou! As inscrições estão encerradas.")}
      </div>
    );

  // Depois de entrar, não dá para trocar o nome nem quem corre.
  if (eu) return <Inscrito s={s} eu={eu} preparando={preparando} onMudou={onMudou} />;

  if (s.status !== "aberto")
    return <div className="card p-6 text-[14px] text-ink-mute">{tx("As inscrições estão encerradas. A corrida já vai começar!")}</div>;

  return <FormParticipar s={s} onPronto={onMudou} onPreparando={setPreparando} />;
}

/**
 * Prêmio em Pix: o ganhador informa a chave e o nome do titular (pode
 * corrigir até o pagamento); o admin paga à mão e marca como pago.
 */
function ChavePix({
  s,
  entrega,
  onMudou,
}: {
  s: SorteioPublico;
  entrega: Extract<Entrega, { tipo: "pix" }>;
  onMudou: () => Promise<void>;
}) {
  const [chave, setChave] = useState(entrega.chave ?? "");
  const [titular, setTitular] = useState(entrega.titular ?? "");
  const [editando, setEditando] = useState(!entrega.chave);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const valor = reais(entrega.centavos);

  if (entrega.pagoEm)
    return (
      <p className="text-[14px] text-ink-mute">
        {valor} {tx("pagos no seu Pix em")} {new Date(entrega.pagoEm).toLocaleDateString()} ({entrega.chave}).
      </p>
    );

  async function enviar() {
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch("/api/sorteio/pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sorteioId: s.id, chave, titular }),
      });
      const b = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) return setErro(txErro(b.error ?? `Falha (HTTP ${r.status}).`));
      avisarNaTela(tx("Chave Pix enviada. Vamos pagar o seu prêmio em breve."), { tom: "ok" });
      setEditando(false);
      await onMudou();
    } finally {
      setEnviando(false);
    }
  }

  if (!editando)
    return (
      <div className="flex flex-wrap items-center gap-3 text-[14px] text-ink-mute">
        <span>
          {tx("Você ganhou")} <b className="text-ink">{valor}</b>. {tx("Chave Pix enviada")}: <b className="text-ink">{entrega.chave}</b> ({entrega.titular}).{" "}
          {tx("Vamos pagar em breve e avisar aqui.")}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setEditando(true)}>
          {tx("Corrigir")}
        </Button>
      </div>
    );

  return (
    <div className="grid gap-3">
      <p className="text-[14px] text-ink-mute">
        {tx("Você ganhou")} <b className="text-ink">{valor}</b>. {tx("Informe a sua chave Pix para receber:")}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="label-cap">{tx("Chave Pix")}</span>
          <Input value={chave} onChange={(e) => setChave(e.target.value)} maxLength={120} placeholder={tx("CPF, e-mail, celular ou chave aleatória")} />
        </label>
        <label className="grid gap-1.5">
          <span className="label-cap">{tx("Nome do titular")}</span>
          <Input value={titular} onChange={(e) => setTitular(e.target.value)} maxLength={120} placeholder={tx("Nome completo, como no banco")} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="accent" onClick={enviar} disabled={enviando || chave.trim().length < 3 || titular.trim().length < 3}>
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {tx("Enviar chave Pix")}
        </Button>
        {erro ? <p className="basis-full text-[13px] text-pink">{erro}</p> : null}
      </div>
    </div>
  );
}

function Inscrito({
  s,
  eu,
  preparando,
  onMudou,
}: {
  s: SorteioPublico;
  eu: MinhaParticipacao;
  preparando: boolean;
  onMudou: () => Promise<void>;
}) {
  const personagens = useCharacters((st) => st.characters);
  const influencer = personagens.find((c) => c.id === eu.characterId);
  // O próprio influencer correndo, como aparece na corrida.
  const corpo = s.corredores.find((c) => c.id === eu.id)?.corpo ?? null;
  const [saindo, setSaindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function sair() {
    setSaindo(true);
    setErro(null);
    const r = await fetch("/api/sorteio/participar", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sorteioId: s.id }),
    }).catch(() => null);
    if (!r?.ok) setErro(tx("Não consegui tirar você do sorteio. Tente de novo."));
    await onMudou();
    setSaindo(false);
  }

  return (
    <div className="card flex flex-wrap items-center gap-4 p-5">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-accent/15 text-accent">
        <Check className="w-5 h-5" />
      </span>
      {corpo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={corpo} alt="" className="h-20 w-auto" />
      ) : preparando ? (
        <span className="flex items-center gap-2 text-[12px] text-ink-dim">
          <Loader2 className="w-4 h-4 animate-spin" />
          {tx("Desenhando o seu corredor…")}
        </span>
      ) : null}
      <div className="mr-auto grid gap-0.5">
        <b className="text-[15px] text-ink">{tx("Você está participando!")}</b>
        <span className="text-[13px] text-ink-mute">
          {tx("Na corrida como")} <b className="text-ink">{eu.nome}</b>
          {influencer ? (
            <>
              {" "}
              {tx("com")} <b className="text-ink">{influencer.identidade.nome || tx("seu influencer")}</b>
            </>
          ) : eu.fotoKey ? (
            <> {tx("com a foto enviada")}</>
          ) : null}
          . {tx("Você aparece na largada com a plaquinha amarela.")}
        </span>
      </div>
      {s.status === "aberto" ? (
        <Button variant="ghost" size="sm" onClick={sair} disabled={saindo}>
          {saindo ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {tx("Sair do sorteio")}
        </Button>
      ) : (
        <span className="text-[13px] text-ink-dim">{tx("Inscrições encerradas: a corrida já vai começar.")}</span>
      )}
      {erro ? <p className="basis-full text-[13px] text-pink">{erro}</p> : null}
    </div>
  );
}

function FormParticipar({
  s,
  onPronto,
  onPreparando,
}: {
  s: SorteioPublico;
  onPronto: () => Promise<void>;
  onPreparando: (sim: boolean) => void;
}) {
  const { user } = useAuth();
  const personagens = useCharacters((st) => st.characters);
  const ordenados = useMemo(() => [...personagens].sort((a, b) => b.updatedAt - a.updatedAt), [personagens]);
  const [nome, setNome] = useState("");
  // Quem corre: um influencer (id), a foto enviada ("foto") ou o boneco (null).
  const [influencer, setInfluencer] = useState<string | null>(ordenados[0]?.id ?? null);
  const [fotoKey, setFotoKey] = useState<string | null>(null);
  const [subindo, setSubindo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviarFoto(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setSubindo(true);
    try {
      setFotoKey(await uploadFile(arquivo, "refs"));
      setInfluencer(FOTO);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSubindo(false);
    }
  }
  const comFoto = influencer === FOTO && !!fotoKey;
  // Com influencer ou foto, o corredor é desenhado (uns 15 s).
  const desenha = comFoto || (!!influencer && influencer !== FOTO);

  // O nome da conta como sugestão (a pessoa pode trocar pelo @ ou apelido).
  useEffect(() => {
    if (!nome && user?.name) setNome(user.name.slice(0, 24));
  }, [user?.name, nome]);

  async function participar() {
    setErro(null);
    setEnviando(true);
    // A vaga sai na hora e a tela já mostra "Você está participando!" enquanto o corredor é desenhado.
    if (desenha) {
      onPreparando(true);
      setTimeout(() => void onPronto(), 1500);
    }
    try {
      const r = await fetch("/api/sorteio/participar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sorteioId: s.id,
          nome,
          characterId: influencer === FOTO ? null : influencer,
          fotoKey: comFoto ? fotoKey : null,
        }),
      });
      const b = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) return setErro(txErro(b.error ?? `Falha (HTTP ${r.status}).`));
      avisarNaTela(tx("Você está no sorteio! Boa sorte."), { tom: "ok" });
      await onPronto();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
      onPreparando(false);
    }
  }

  return (
    <section className="card grid gap-5 p-4 sm:p-6">
      <div className="grid gap-1">
        <h2 className="flex items-center gap-2 text-[17px] font-bold text-ink">
          <Gift className="w-5 h-5 text-accent" />
          {tx("Participar")}
        </h2>
        <p className="text-[13px] text-ink-mute">
          {tx("Uma participação por conta — depois de entrar, não dá para trocar o nome nem quem corre. O ganhador é sorteado na largada e recebe o presente direto na conta, sem renovação automática.")}{" "}
          {tx("Todo mundo que corre ganha")} {PONTOS_POR_PARTICIPAR} {tx("pontos quando a corrida termina.")}
        </p>
      </div>

      <label className="grid gap-1.5 max-w-sm">
        <span className="label-cap">{tx("Seu nome na corrida")}</span>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={24} placeholder={tx("Como você quer aparecer na live")} />
      </label>

      <div className="grid gap-2">
        <span className="label-cap">{tx("Quem corre por você")}</span>
        <div className="flex flex-wrap gap-2">
          {ordenados.map((c) => {
            const src = capaSrc(c);
            const ativo = influencer === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setInfluencer(c.id)}
                className={cn(
                  "grid w-[92px] justify-items-center gap-1.5 rounded-xl border p-2 text-[12px] transition cursor-pointer",
                  ativo ? "border-accent bg-accent/10 text-ink" : "border-line text-ink-mute hover:text-ink",
                )}
              >
                <span className="h-14 w-14 overflow-hidden rounded-full border-2 border-white/80 bg-panel">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" className="h-full w-full object-cover object-top" />
                  ) : null}
                </span>
                <span className="w-full truncate text-center font-semibold">{c.identidade.nome || tx("Sem nome")}</span>
              </button>
            );
          })}
          {/* Uma foto (a sua, ou de quem você quiser): é desenhada correndo, como um influencer. */}
          <label
            className={cn(
              "grid w-[92px] justify-items-center gap-1.5 rounded-xl border p-2 text-[12px] transition cursor-pointer",
              comFoto ? "border-accent bg-accent/10 text-ink" : "border-line text-ink-mute hover:text-ink",
            )}
            onClick={(e) => {
              // Já tem foto: o clique escolhe ela (trocar a foto é pelo ícone).
              if (fotoKey && influencer !== FOTO) {
                e.preventDefault();
                setInfluencer(FOTO);
              }
            }}
          >
            <span className="relative grid h-14 w-14 place-items-center overflow-hidden rounded-full border-2 border-white/80 bg-panel">
              {subindo ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : fotoKey ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(fotoKey)} alt="" className="h-full w-full object-cover object-top" />
              ) : (
                <Upload className="w-6 h-6" />
              )}
            </span>
            <span className="w-full truncate text-center font-semibold">{fotoKey && comFoto ? tx("Trocar foto") : tx("Enviar foto")}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={subindo || enviando}
              onChange={(e) => {
                void enviarFoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => setInfluencer(null)}
            className={cn(
              "grid w-[92px] justify-items-center gap-1.5 rounded-xl border p-2 text-[12px] transition cursor-pointer",
              influencer === null ? "border-accent bg-accent/10 text-ink" : "border-line text-ink-mute hover:text-ink",
            )}
          >
            <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-white/80 bg-panel">
              <UserRound className="w-6 h-6" />
            </span>
            <span className="w-full truncate text-center font-semibold">{tx("Sem influencer")}</span>
          </button>
        </div>
        <span className="text-[12px] text-ink-dim">
          {comFoto
            ? tx("A foto é desenhada correndo, de corpo inteiro, e é ela que corre por você. Uma foto nítida, de frente, funciona melhor.")
            : influencer
              ? tx("O influencer escolhido é desenhado correndo e é ele que corre por você, para todo mundo ver na corrida.")
              : ordenados.length
                ? tx("Sem influencer, você corre com um corredor com a sua inicial.")
                : tx("Você ainda não tem influencers: envie uma foto (ela é desenhada correndo) ou corra com a sua inicial.")}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="accent" onClick={participar} disabled={enviando || subindo || nome.trim().length < 2}>
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
          {enviando && desenha ? tx("Preparando o seu corredor… (uns 20 s)") : tx("Participar do sorteio")}
        </Button>
        {erro ? <p className="basis-full text-[13px] text-pink">{erro}</p> : null}
      </div>
    </section>
  );
}

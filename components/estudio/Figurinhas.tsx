"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Download,
  ImagePlus,
  Loader2,
  Package,
  Share2,
  Sticker,
  Trash2,
  Upload,
} from "lucide-react";
import { nanoid } from "nanoid";
import type { Character, FigurinhaArquivo } from "@/lib/types";
import { useCharacters } from "@/lib/store";
import { useRecursos } from "@/components/RecursosProvider";
import {
  avisarCreditos,
  useCreditos,
} from "@/components/creditos/CreditosProvider";
import { ErroGeracao } from "@/components/creditos/ErroGeracao";
import {
  EscolherImagemPersonagem,
  useImagensPersonagem,
} from "@/components/revisao/EscolherImagemPersonagem";
import {
  buscarMascara,
  ImagemMarcador,
  LinhaMarca,
  novaMarca,
  type Marca,
} from "@/components/revisao/MarcarPessoas";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { confirmar } from "@/components/ui/Confirmacao";
import { cn } from "@/lib/cn";
import { useDuravel } from "@/lib/duravel";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import { CREDITOS_FIGURINHA, creditosTroca } from "@/lib/planos";
import { downloadUrl, fileUrl, uploadFile } from "@/lib/storage/client";
import { STORAGE_KINDS } from "@/lib/storage/env";

/** Situações prontas: um clique preenche o campo. */
const IDEIAS = [
  "Rindo muito, com a mão na barriga",
  "Fazendo joinha e piscando",
  "Chorando de emoção",
  "Bravo, de braços cruzados",
  "Apaixonado, com corações em volta",
  "Com sono, bocejando",
  "Surpreso, de boca aberta",
  "Comemorando, com os braços para cima",
  "Mandando beijo",
  "Pensativo, com a mão no queixo",
];

/** Tipo da imagem pelos primeiros bytes (WebP, PNG ou JPEG), ou null. */
async function tipoDaImagem(file: File): Promise<string | null> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const texto = (i: number, n: number) =>
    String.fromCharCode(...b.slice(i, i + n));
  if (texto(0, 4) === "RIFF" && texto(8, 4) === "WEBP") return "image/webp";
  if (b[0] === 0x89 && texto(1, 3) === "PNG") return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  return null;
}

/**
 * Segundos a partir dos quais a espera já passou do normal. As trocas em vídeo
 * mais curtas (10s) levaram cerca de 8 min no motor.
 */
const ESPERA_LONGA = 12 * 60;

/** Figurinha animada sendo feita: há quanto tempo e quanto costuma levar. */
function EmPreparo({ desde }: { desde: number }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(relogio);
  }, []);
  const s = Math.max(0, Math.floor((agora - desde) / 1000));
  return (
    <div className="grid place-items-center gap-1 text-center text-ink-mute">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-[11px]">{tx("Trocando o personagem…")}</span>
      <span className="text-[13px] font-medium tabular-nums text-ink">
        {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
      </span>
      <span className="text-[10.5px] leading-tight">
        {s > ESPERA_LONGA
          ? tx("Está demorando mais que o normal. Pode deixar aberto.")
          : tx("Costuma levar de 5 a 10 min")}
      </span>
    </div>
  );
}

/** Primeiro quadro do arquivo, parado (figurinha animada não serve para clicar). */
async function primeiroQuadro(arquivo: Blob): Promise<string> {
  const img = await createImageBitmap(arquivo);
  const tela = document.createElement("canvas");
  tela.width = img.width;
  tela.height = img.height;
  tela.getContext("2d")!.drawImage(img, 0, 0);
  return tela.toDataURL("image/png");
}

/** Ícone do pacote (PNG de 96×96) a partir da primeira figurinha. */
async function iconeDoPacote(figurinha: Blob): Promise<Blob> {
  const img = await createImageBitmap(figurinha);
  const tela = document.createElement("canvas");
  tela.width = tela.height = 96;
  tela.getContext("2d")!.drawImage(img, 0, 0, 96, 96);
  return new Promise((ok, falha) =>
    tela.toBlob((b) => (b ? ok(b) : falha(new Error("ícone"))), "image/png"),
  );
}

/** Quantas figurinhas ficam guardadas por personagem (as mais antigas saem). */
const MAX_FIGURINHAS = 60;

const xadrez =
  "bg-[length:16px_16px] bg-[linear-gradient(45deg,#2a2a2a_25%,transparent_25%,transparent_75%,#2a2a2a_75%),linear-gradient(45deg,#2a2a2a_25%,#1c1c1c_25%,#1c1c1c_75%,#2a2a2a_75%)] bg-[position:0_0,8px_8px]";

/**
 * Estúdio → Figurinhas: figurinhas de WhatsApp do personagem (WebP 512×512
 * com fundo transparente). Gera uma nova a partir de uma situação, ou põe o
 * personagem no lugar de quem está numa figurinha que o usuário envia.
 */
export function Figurinhas({ character }: { character: Character }) {
  const recursos = useRecursos();
  const { conta } = useCreditos();
  const atualizar = useCharacters((s) => s.update);
  const opcoes = useImagensPersonagem(character);
  const [imagem, setImagem] = useState<string | null>(opcoes[0]?.key ?? null);
  const [modo, setModo] = useState<"gerar" | "substituir">("gerar");
  const [cena, setCena] = useState("");
  /** Figurinha original enviada para a troca. */
  const [original, setOriginal] = useState<{
    key: string;
    nome: string;
    /** Primeiro quadro, parado: é nele que se marca quem trocar. */
    previa: string;
  } | null>(null);
  /** Pessoas marcadas na figurinha (vazio: a IA troca a pessoa principal). */
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const personagens = useCharacters((st) => st.characters);
  const [enviandoArquivo, setEnviandoArquivo] = useState(false);
  /** Na troca: só o rosto (a roupa da figurinha fica) ou o rosto e a roupa. */
  const [roupa, setRoupa] = useState<"foto" | "personagem">("personagem");
  const [empacotando, setEmpacotando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useDuravel<boolean>(
    `figurinha:${character.id}:ocupado`,
    false,
    "Criando figurinha",
  );
  const [erro, setErro] = useDuravel<{ msg: string; code?: string } | null>(
    `figurinha:${character.id}:erro`,
    null,
  );
  const figurinhas = character.figurinhas ?? [];

  // Figurinha animada é feita pela troca em vídeo (leva alguns minutos):
  // consulta o job até ficar pronta ou falhar.
  const emPreparo = figurinhas
    .filter((f) => f.status === "processando" && f.jobId)
    .map((f) => `${f.id}:${f.jobId}`)
    .join(",");
  useEffect(() => {
    if (!emPreparo) return;
    const conferir = async () => {
      for (const par of emPreparo.split(",")) {
        const [id, jobId] = par.split(":");
        const r = await fetch(`/api/videos/jobs/${encodeURIComponent(jobId)}`, {
          cache: "no-store",
        })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null);
        if (!r) continue;
        const e = r as { status: string; key?: string; erro?: string };
        if (e.status !== "concluido" && e.status !== "erro") continue;
        avisarCreditos();
        atualizar(character.id, (c) => {
          const f = c.figurinhas?.find((x) => x.id === id);
          if (!f) return;
          if (e.status === "concluido" && e.key) {
            f.key = e.key;
            delete f.status;
            delete f.erro;
          } else {
            f.status = "erro";
            f.erro = e.erro ?? "A troca da figurinha falhou.";
          }
        });
      }
    };
    const relogio = setInterval(conferir, 10_000);
    void conferir();
    return () => clearInterval(relogio);
  }, [emPreparo, atualizar, character.id]);

  if (!recursos.gemini || !recursos.armazenamento)
    return (
      <div className="rounded-xl border border-dashed border-line-strong px-4 py-10 text-center text-[14px] text-ink-dim">
        {tx("As figurinhas não estão configuradas neste deploy (GEMINI_API_KEY).")}
      </div>
    );

  async function enviarOriginal(bruto: File | undefined) {
    if (!bruto) return;
    // "Salvar como" do WhatsApp grava a figurinha sem extensão: o navegador não
    // sabe o tipo. Descobre pelo começo do arquivo e envia com o tipo certo.
    const tipo = (STORAGE_KINDS.refs.types as readonly string[]).includes(
      bruto.type,
    )
      ? bruto.type
      : await tipoDaImagem(bruto);
    if (!tipo)
      return setErro({
        msg: tx("Formato não aceito. Envie a figurinha em WebP, PNG ou JPEG."),
      });
    const file =
      tipo === bruto.type
        ? bruto
        : new File([bruto], `${bruto.name}.${tipo.split("/")[1]}`, { type: tipo });
    setErro(null);
    setEnviandoArquivo(true);
    try {
      const previa = await primeiroQuadro(bruto);
      setOriginal({
        key: await uploadFile(file, "refs"),
        nome: bruto.name,
        previa,
      });
      setMarcas([]);
    } catch (e) {
      setErro({ msg: (e as Error).message });
    } finally {
      setEnviandoArquivo(false);
    }
  }

  async function criar() {
    if (!imagem) return setErro({ msg: tx("Escolha a imagem do personagem.") });
    setErro(null);
    setOcupado(true);
    try {
      const res = await fetch("/api/figurinhas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: character.id,
          imageKey: imagem,
          modo,
          cena: modo === "gerar" ? cena : undefined,
          fotoKey: modo === "substituir" ? original?.key : undefined,
          roupa,
          pessoas:
            modo === "substituir" && marcas.length
              ? marcas.map((m) => ({
                  x: m.x,
                  y: m.y,
                  imageKey: m.imageKey ?? imagem,
                }))
              : undefined,
        }),
      });
      const b = (await res.json().catch(() => ({}))) as {
        key?: string;
        size?: number;
        /** Figurinha animada: fica pronta depois (job da troca em vídeo). */
        jobId?: string;
        animada?: boolean;
        error?: string;
        code?: string;
      };
      avisarCreditos();
      if (!res.ok || (!b.key && !b.jobId))
        return setErro({
          msg: txErro(b.error ?? `Falha (HTTP ${res.status}).`),
          code: b.code,
        });
      const nova: FigurinhaArquivo = {
        id: nanoid(10),
        key: b.key ?? "",
        texto: modo === "gerar" ? cena.trim() : (original?.nome ?? ""),
        origem: modo === "gerar" ? "gerada" : "substituida",
        size: b.size ?? 0,
        createdAt: Date.now(),
        ...(b.jobId
          ? { animada: true, jobId: b.jobId, status: "processando" as const }
          : {}),
      };
      atualizar(character.id, (c) => {
        c.figurinhas = [nova, ...(c.figurinhas ?? [])].slice(0, MAX_FIGURINHAS);
      });
      if (modo === "substituir") {
        setOriginal(null);
        setMarcas([]);
      }
    } catch (e) {
      setErro({ msg: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  async function excluir(f: FigurinhaArquivo) {
    const ok = await confirmar({
      titulo: tx("Excluir esta figurinha?"),
      mensagem: tx("Ela sai da lista do personagem. Não dá para desfazer."),
      confirmar: tx("Excluir"),
      tom: "perigo",
    });
    if (!ok) return;
    atualizar(character.id, (c) => {
      c.figurinhas = (c.figurinhas ?? []).filter((x) => x.id !== f.id);
    });
  }

  const prontas = figurinhas.filter((f) => f.key && !f.status);

  /**
   * Pacote .wastickers: o formato que os aplicativos de figurinha (como o
   * Sticker Maker) abrem para adicionar o pacote inteiro ao WhatsApp. É um
   * zip com as figurinhas, o ícone do pacote e os arquivos de título e autor.
   * O WhatsApp não mistura paradas e animadas: sai um pacote de cada tipo.
   */
  async function baixarPacote(animadas: boolean) {
    const lista = prontas.filter((f) => !!f.animada === animadas).slice(0, 30);
    if (lista.length < 3) return;
    setErro(null);
    setEmpacotando(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const nome = character.identidade.nome || "NIDO";
      zip.file("title.txt", `${nome}${animadas ? " (animadas)" : ""}`);
      zip.file("author.txt", "NIDO AI Studio");
      const blobs = await Promise.all(
        lista.map(async (f) => (await fetch(fileUrl(f.key))).blob()),
      );
      blobs.forEach((b, i) =>
        zip.file(`${String(i + 1).padStart(2, "0")}.webp`, b),
      );
      zip.file("tray.png", await iconeDoPacote(blobs[0]));
      const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${nome.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "nido"}${animadas ? "-animadas" : ""}.wastickers`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setErro({ msg: (e as Error).message });
    } finally {
      setEmpacotando(false);
    }
  }

  /** No celular: abre o "compartilhar" do aparelho com o arquivo da figurinha. */
  async function compartilhar(f: FigurinhaArquivo, nome: string) {
    try {
      const blob = await (await fetch(fileUrl(f.key))).blob();
      const arquivo = new File([blob], nome, { type: "image/webp" });
      if (navigator.canShare?.({ files: [arquivo] }))
        await navigator.share({ files: [arquivo] });
      else window.open(downloadUrl(f.key, nome));
    } catch {
      // A pessoa fechou o compartilhar: nada a fazer.
    }
  }

  const pronto =
    !!imagem && (modo === "gerar" ? cena.trim().length >= 3 : !!original);
  const nomeDoArquivo = (f: FigurinhaArquivo, i: number) =>
    `${(character.identidade.nome || "figurinha").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${figurinhas.length - i}.webp`;

  return (
    <div className="grid gap-6 [&>*]:min-w-0">
      <div>
        <div className="mb-2 text-[13px] font-semibold text-ink">
          {tx("Imagem do personagem")}
        </div>
        <EscolherImagemPersonagem
          opcoes={opcoes}
          valor={imagem}
          onChange={setImagem}
          dica={tx(
            "É a referência do rosto, da roupa e do estilo: a figurinha sai parecida com esta imagem.",
          )}
        />
      </div>

      <div className="grid gap-3">
        {/* No celular as duas opções ficam uma embaixo da outra: lado a lado, na pílula de 32px, "Trocar o personagem de uma figurinha" quebrava e ficava colado nas bordas. */}
        <div className="flex w-full flex-col gap-1 rounded-2xl border border-line bg-panel p-1 sm:w-fit sm:flex-row sm:rounded-full">
          {(
            [
              ["gerar", "Criar figurinha", Sticker],
              ["substituir", "Trocar o personagem de uma figurinha", ImagePlus],
            ] as const
          ).map(([id, nome, Icone]) => (
            <button
              key={id}
              type="button"
              onClick={() => setModo(id)}
              aria-pressed={modo === id}
              className={cn(
                "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-center text-[12.5px] font-bold leading-tight transition sm:whitespace-nowrap sm:rounded-full sm:py-0",
                modo === id ? "bg-accent text-bg" : "text-ink-mute hover:text-ink",
              )}
            >
              <Icone className="h-3.5 w-3.5 shrink-0" /> {tx(nome)}
            </button>
          ))}
        </div>

        {modo === "gerar" ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {IDEIAS.map((ideia) => (
                <button
                  key={ideia}
                  type="button"
                  onClick={() => setCena(tx(ideia))}
                  className={cn(
                    "h-8 whitespace-nowrap rounded-full border px-3 text-[12px] font-semibold transition",
                    cena === tx(ideia)
                      ? "border-accent bg-accent/10 text-ink"
                      : "border-line text-ink-mute hover:border-line-strong hover:text-ink",
                  )}
                >
                  {tx(ideia).split(",")[0]}
                </button>
              ))}
            </div>
            <Textarea
              rows={2}
              maxLength={300}
              className="!resize-none"
              placeholder={tx(
                "O que o personagem está fazendo na figurinha. Ex.: tomando café com cara de segunda-feira",
              )}
              value={cena}
              onChange={(e) => setCena(e.target.value)}
            />
          </>
        ) : (
          <div className="grid gap-2">
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                void enviarOriginal(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {original ? (
              <div className="grid gap-2 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
                <div className={cn("h-[260px] overflow-hidden rounded-xl", xadrez)}>
                  <ImagemMarcador
                    src={original.previa}
                    marcas={marcas}
                    onMarcar={(x, y) => {
                      const nova = {
                        ...novaMarca(x, y, 0, character),
                        imageKey: imagem,
                      };
                      setMarcas((all) => [...all, nova]);
                      void buscarMascara({ fotoKey: original.key }, nova).then(
                        (r) =>
                          setMarcas((all) =>
                            all.map((z) =>
                              z.id === nova.id ? { ...z, ...r } : z,
                            ),
                          ),
                      );
                    }}
                    onRemover={(id) =>
                      setMarcas((all) => all.filter((z) => z.id !== id))
                    }
                  />
                </div>
                <div className="grid content-start gap-2">
                  <p className="text-[12px] text-ink-mute">
                    {marcas.length
                      ? tx("Cada pessoa marcada vira o personagem escolhido para ela. Clique no número para desmarcar.")
                      : tx("Clique em quem você quer trocar (até 3 pessoas). Sem marcar ninguém, a IA troca a pessoa principal.")}
                  </p>
                  {marcas.map((m, n) => (
                    <LinhaMarca
                      key={m.id}
                      numero={n + 1}
                      marca={m}
                      origem={{ tipo: "foto", src: original.previa }}
                      personagens={personagens.length ? personagens : [character]}
                      onChange={(mud) =>
                        setMarcas((all) =>
                          all.map((z) => (z.id === m.id ? { ...z, ...mud } : z)),
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="ghost"
                onClick={() => inputRef.current?.click()}
                disabled={enviandoArquivo || ocupado}
              >
                {enviandoArquivo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {original ? tx("Trocar a figurinha") : tx("Enviar a figurinha original")}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-ink-mute">{tx("O que trocar")}</span>
              <div className="flex gap-1 rounded-full border border-line bg-panel p-1">
                {(
                  [
                    ["foto", "Só o rosto"],
                    ["personagem", "Rosto e roupa"],
                  ] as const
                ).map(([id, nome]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setRoupa(id)}
                    aria-pressed={roupa === id}
                    className={cn(
                      "h-7 rounded-full px-3 text-[12px] font-bold transition",
                      roupa === id
                        ? "bg-accent text-bg"
                        : "text-ink-mute hover:text-ink",
                    )}
                  >
                    {tx(nome)}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-ink-dim">
                {roupa === "foto"
                  ? tx("a roupa da figurinha continua")
                  : tx("ele entra com a roupa dele")}
              </span>
            </div>
            <p className="text-[12px] text-ink-dim">
              {tx(
                "Envie a figurinha (o arquivo do “Salvar como” do WhatsApp serve, mesmo sem extensão). O personagem entra no lugar de quem está nela, com a mesma pose, expressão e estilo.",
              )}{" "}
              {tx("Figurinha animada continua animada: é feita pela troca em vídeo, leva alguns minutos e custa a partir de")}{" "}
              {creditosTroca(3, "standard")} {tx("créditos")}.
            </p>
          </div>
        )}

        <Button
          variant="accent"
          onClick={criar}
          disabled={!pronto || ocupado}
          className="w-fit"
        >
          {ocupado ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sticker className="h-4 w-4" />
          )}
          {ocupado
            ? tx("Criando a figurinha…")
            : `${modo === "gerar" ? tx("Criar figurinha") : tx("Trocar o personagem")}${conta ? ` · ${CREDITOS_FIGURINHA} ${tx("créditos")}` : ""}`}
        </Button>
        {erro ? <ErroGeracao mensagem={erro.msg} code={erro.code} /> : null}
      </div>

      <div className="grid gap-3">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[13px] font-semibold text-ink">
            {tx("Figurinhas do personagem")}
          </span>
          <span className="mono text-[11px] text-ink-dim">{figurinhas.length}</span>
        </div>
        {figurinhas.length === 0 ? (
          <p className="text-[13px] text-ink-mute">
            {tx("Nenhuma figurinha ainda. Crie a primeira acima.")}
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-3">
            {figurinhas.map((f, i) => (
              <figure
                key={f.id}
                className="group overflow-hidden rounded-xl border border-line bg-panel"
              >
                <div className={cn("grid aspect-square place-items-center p-2", xadrez)}>
                  {f.status === "processando" ? (
                    <EmPreparo desde={f.createdAt} />
                  ) : f.status === "erro" ? (
                    <div className="grid place-items-center gap-1.5 px-1 text-center">
                      <AlertTriangle className="h-5 w-5 text-pink" />
                      <span className="line-clamp-4 text-[10.5px] text-pink">
                        {txErro(f.erro ?? "A troca da figurinha falhou.")}
                      </span>
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={fileUrl(f.key)}
                      alt={f.texto}
                      loading="lazy"
                      className="max-h-full max-w-full object-contain"
                    />
                  )}
                </div>
                <figcaption className="flex items-center gap-1 p-2">
                  <span
                    className="min-w-0 flex-1 truncate text-[11px] text-ink-dim"
                    title={f.texto}
                  >
                    {f.animada ? `${tx("Animada")} · ` : ""}
                    {f.texto || tx("Figurinha")}
                  </span>
                  {f.key && !f.status ? (
                    <>
                      <button
                        type="button"
                        onClick={() => compartilhar(f, nomeDoArquivo(f, i))}
                        title={tx("Compartilhar")}
                        aria-label={tx("Compartilhar")}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-mute transition hover:bg-accent/10 hover:text-ink"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </button>
                      <a
                        href={downloadUrl(f.key, nomeDoArquivo(f, i))}
                        download={nomeDoArquivo(f, i)}
                        title={tx("Baixar")}
                        aria-label={tx("Baixar")}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-mute transition hover:bg-accent/10 hover:text-ink"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => excluir(f)}
                    title={tx("Excluir")}
                    aria-label={tx("Excluir")}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-mute transition hover:bg-pink/10 hover:text-pink"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        {prontas.length ? (
          <div className="grid gap-2 rounded-xl border border-line bg-panel p-3.5">
            <div className="text-[13px] font-semibold text-ink">
              {tx("Levar para o WhatsApp")}
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  [false, "Baixar pacote de figurinhas"],
                  [true, "Baixar pacote das animadas"],
                ] as const
              ).map(([animadas, nome]) => {
                const n = prontas.filter((f) => !!f.animada === animadas).length;
                if (!n) return null;
                return (
                  <Button
                    key={nome}
                    variant={animadas ? "ghost" : "accent"}
                    onClick={() => baixarPacote(animadas)}
                    disabled={empacotando || n < 3}
                    title={n < 3 ? tx("O WhatsApp pede pelo menos 3 figurinhas por pacote.") : undefined}
                  >
                    {empacotando ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Package className="h-4 w-4" />
                    )}
                    {tx(nome)} · {Math.min(n, 30)}
                  </Button>
                );
              })}
            </div>
            <p className="text-[12px] leading-relaxed text-ink-dim">
              {tx(
                "O pacote (.wastickers) abre num aplicativo de figurinhas, como o Sticker Maker, que adiciona todas ao WhatsApp de uma vez. O WhatsApp pede de 3 a 30 figurinhas por pacote e não mistura paradas com animadas.",
              )}{" "}
              {tx(
                "Uma só: baixe ou compartilhe a figurinha e, na conversa, abra as figurinhas → Criar → escolha o arquivo.",
              )}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

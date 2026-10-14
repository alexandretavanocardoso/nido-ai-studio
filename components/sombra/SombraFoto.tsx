"use client";

import { useState } from "react";
import {
  ChevronsLeftRight,
  Download,
  Hand,
  ImagePlus,
  Loader2,
  RefreshCw,
  Wand2,
} from "lucide-react";
import type { FotoDaSombra } from "@/app/api/sombra/route";
import { AntesDepoisImagem } from "@/components/revisao/AntesDepois";
import { useRecursos } from "@/components/RecursosProvider";
import {
  avisarCreditos,
  useCreditos,
} from "@/components/creditos/CreditosProvider";
import { ErroGeracao } from "@/components/creditos/ErroGeracao";
import { Button } from "@/components/ui/Button";
import {
  buscarMascara,
  ImagemMarcador,
  type Marca,
} from "@/components/revisao/MarcarPessoas";
import { cn } from "@/lib/cn";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import { bloqueioImagem, creditosImagem } from "@/lib/planos";
import type { RoupaTroca } from "@/lib/prompts/trocar-imagem";
import { downloadUrl, fileUrl, uploadFile } from "@/lib/storage/client";
import {
  EnviarOrigem,
  marcaSemPersonagem,
  Opcoes,
  PessoaMarcada,
  QuemEntra,
  type ImagemEnviada,
} from "./comum";

type Qualidade = "padrao" | "pro";

/** Fotos maiores que isso (ou fora de JPEG/PNG/WebP) são convertidas no navegador antes do envio. */
const LIMITE_ENVIO = 9 * 1024 * 1024;

/** Reduz/converte a foto para JPEG (lado maior ≤ 3072px) quando precisa. */
async function prepararFoto(file: File): Promise<Blob> {
  const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  if (ok && file.size <= LIMITE_ENVIO) return file;
  const bmp = await createImageBitmap(file);
  const escala = Math.min(1, 3072 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * escala);
  canvas.height = Math.round(bmp.height * escala);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) =>
    canvas.toBlob(
      (b) => (b ? res(b) : rej(new Error(tx("Não consegui ler a imagem.")))),
      "image/jpeg",
      0.92,
    ),
  );
}

/**
 * Sombra em foto, sem personagem: envia a foto, marca quem trocar (até 3, ou
 * nenhuma = a pessoa principal) e envia a imagem de quem entra no lugar de
 * cada um. Mesma rota do Estúdio (/api/imagens/trocar), sem `characterId`.
 */
export function SombraFoto({
  onGerada,
}: {
  onGerada: (foto: FotoDaSombra) => void;
}) {
  const recursos = useRecursos();
  const { conta } = useCreditos();
  const [foto, setFoto] = useState<ImagemEnviada | null>(null);
  const [enviando, setEnviando] = useState<number | null>(null);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  /** Quem entra no lugar de cada pessoa marcada (pelo id da marca). */
  const [quem, setQuem] = useState<Record<string, ImagemEnviada>>({});
  /** Sem marcas: quem entra no lugar da pessoa principal. */
  const [principal, setPrincipal] = useState<ImagemEnviada | null>(null);
  const [roupa, setRoupa] = useState<RoupaTroca>("foto");
  const [qualidade, setQualidade] = useState<Qualidade>("padrao");
  const [gerando, setGerando] = useState<"troca" | "pele" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroCode, setErroCode] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  /** A foto de antes do resultado atual (guardada pelo servidor ao lado dele). */
  const [antes, setAntes] = useState<string | null>(null);
  const [comparar, setComparar] = useState(false);
  const [verResultado, setVerResultado] = useState(false);

  const creditos = creditosImagem("nano-banana", qualidade);
  const bloqueio = conta
    ? bloqueioImagem(conta.plano, "nano-banana", qualidade)
    : null;
  const falta = marcas.length ? marcas.some((m) => !quem[m.id]) : !principal;

  if (!recursos.gemini)
    return (
      <p className="text-[13px] text-ink-dim">
        {tx(
          "A troca de pessoa em foto precisa do Gemini configurado (GEMINI_API_KEY).",
        )}
      </p>
    );

  async function escolherFoto(file: File) {
    setErro(null);
    setResultado(null);
    setVerResultado(false);
    setEnviando(0);
    try {
      const blob = await prepararFoto(file);
      const key = await uploadFile(blob, "refs", (p) => setEnviando(p));
      setFoto({ key, src: URL.createObjectURL(blob) });
      setMarcas([]);
      setQuem({});
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(null);
    }
  }

  /** Com `pele`, refaz só a pele das mãos do resultado atual. */
  async function gerar(pele = false) {
    if (!foto || (pele ? !resultado : falta)) return;
    setErro(null);
    setErroCode(null);
    setGerando(pele ? "pele" : "troca");
    try {
      const res = await fetch("/api/imagens/trocar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          pele
            ? { fotoKey: resultado, qualidade, corrigir: true }
            : {
                fotoKey: foto.key,
                qualidade,
                roupa,
                imageKey: marcas.length ? undefined : principal?.key,
                pessoas: marcas.length
                  ? marcas.map((m) => ({
                      x: m.x,
                      y: m.y,
                      imageKey: quem[m.id].key,
                    }))
                  : undefined,
              },
        ),
      });
      const body = (await res.json().catch(() => ({}))) as {
        key?: string;
        antesKey?: string;
        error?: string;
        code?: string;
      };
      avisarCreditos();
      if (!res.ok || !body.key) {
        setErroCode(body.code ?? null);
        return setErro(
          txErro(body.error ?? `Falha ao gerar (HTTP ${res.status}).`),
        );
      }
      setResultado(body.key);
      setAntes(body.antesKey ?? null);
      setVerResultado(true);
      onGerada({ key: body.key, antesKey: body.antesKey ?? null });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setGerando(null);
    }
  }

  if (!foto)
    return (
      <div className="grid gap-3">
        <EnviarOrigem
          titulo={tx("Envie a foto")}
          texto={tx(
            "Clique ou arraste uma foto (JPEG, PNG ou WebP). Depois marque quem trocar e envie a imagem de quem entra no lugar — cenário, luz e pose ficam iguais.",
          )}
          accept="image/jpeg,image/png,image/webp,image/*"
          enviando={enviando}
          onArquivo={escolherFoto}
          icone={<ImagePlus className="h-6 w-6" />}
        />
        {erro ? <ErroGeracao mensagem={erro} code={erroCode} /> : null}
      </div>
    );

  return (
    <section className="grid overflow-hidden rounded-2xl border border-line bg-panel lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Esquerda: a foto com as marcas (ou o resultado) */}
      <div className="relative flex h-[60svh] min-h-0 flex-col gap-2 p-4 sm:p-5 lg:h-[640px]">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <div className="flex gap-1 rounded-full border border-line bg-bg p-0.5">
            {(
              [
                ["original", tx("Original")],
                ["resultado", tx("Resultado")],
              ] as const
            ).map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                disabled={id === "resultado" && !resultado}
                onClick={() => setVerResultado(id === "resultado")}
                className={cn(
                  "h-7 cursor-pointer rounded-full px-3 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
                  (id === "resultado") === (verResultado && !!resultado)
                    ? "bg-card text-ink"
                    : "text-ink-mute hover:text-ink",
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <label
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 text-[12px] font-semibold text-ink-mute hover:text-ink",
              gerando && "pointer-events-none opacity-50",
            )}
          >
            {enviando !== null ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {tx("Outra foto")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void escolherFoto(f);
              }}
            />
          </label>
        </div>
        <div className="min-h-0 flex-1">
          {resultado && verResultado ? (
            <div className="relative h-full w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl(resultado)}
                alt={tx("Resultado")}
                className="absolute inset-0 h-full w-full object-contain"
              />
            </div>
          ) : (
            <ImagemMarcador
              src={foto.src}
              marcas={marcas}
              onMarcar={(x, y) => {
                const nova = marcaSemPersonagem(x, y, 0);
                setMarcas((all) => [...all, nova]);
                void buscarMascara({ fotoKey: foto.key }, nova).then((r) =>
                  setMarcas((all) =>
                    all.map((z) => (z.id === nova.id ? { ...z, ...r } : z)),
                  ),
                );
              }}
              onRemover={(id) =>
                setMarcas((all) => all.filter((z) => z.id !== id))
              }
            />
          )}
        </div>
        {gerando ? (
          <div className="absolute inset-0 grid place-items-center bg-black/60 backdrop-blur-[2px]">
            <div className="grid justify-items-center gap-2 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
              <span className="text-[13px] font-semibold text-white">
                {gerando === "pele"
                  ? tx("Corrigindo a pele das mãos… (até 1 min)")
                  : tx("Trocando a pessoa… (até 1 min)")}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Direita: quem entra, opções e botão */}
      <aside className="flex min-h-0 flex-col border-t border-line lg:h-[640px] lg:border-l lg:border-t-0">
        <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto p-4 sm:p-5">
          {marcas.length === 0 ? (
            <div className="grid gap-2">
              <div className="text-[13px] font-semibold text-ink">
                {tx("Quem entra no lugar")}
              </div>
              <QuemEntra valor={principal} onChange={setPrincipal} />
              <p className="text-[11px] text-ink-dim">
                {tx(
                  "Sem marcar ninguém, a IA troca a pessoa principal da foto. Mais de uma pessoa? Clique em cada uma na foto.",
                )}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {marcas.map((m, i) => (
                <PessoaMarcada
                  key={m.id}
                  numero={i + 1}
                  valor={quem[m.id] ?? null}
                  onChange={(v) => setQuem((q) => ({ ...q, [m.id]: v }))}
                />
              ))}
            </div>
          )}

          <Opcoes
            titulo={tx("Roupa")}
            valor={roupa}
            onChange={setRoupa}
            opcoes={[
              ["foto", tx("Da foto"), tx("Mantém a roupa original")],
              [
                "personagem",
                tx("Da imagem enviada"),
                tx("Veste o look de quem entra"),
              ],
            ]}
          />

          <Opcoes
            titulo={tx("Motor")}
            valor={qualidade}
            onChange={setQualidade}
            opcoes={[
              ["padrao", tx("Padrão"), "Nano Banana 2 · 1K"],
              ["pro", tx("Pro"), "Nano Banana Pro · 2K"],
            ]}
          />

          <p className="text-[11px] text-ink-dim">
            {tx(
              "Use só fotos e imagens que você tem direito de usar e sinalize quando o resultado for sintético.",
            )}
          </p>
          {bloqueio ? <ErroGeracao mensagem={bloqueio} code="PLANO" /> : null}
          {erro ? <ErroGeracao mensagem={erro} code={erroCode} /> : null}
        </div>

        <footer className="grid shrink-0 gap-2 border-t border-line p-4 sm:p-5">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="text-ink-mute">
              {marcas.length > 1
                ? `${marcas.length} ${tx("pessoas")}`
                : tx("1 pessoa")}
            </span>
            <strong className="text-ink">
              {creditos} {tx("créditos")}
            </strong>
          </div>
          <Button
            variant="accent"
            className="w-full justify-center"
            onClick={() => gerar()}
            disabled={!!gerando || falta || !!bloqueio}
          >
            {gerando === "troca" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            {gerando === "troca"
              ? tx("Gerando…")
              : resultado
                ? tx("Gerar de novo")
                : tx("Sombra")}
          </Button>
          {resultado ? (
            <>
              <button
                type="button"
                onClick={() => gerar(true)}
                disabled={!!gerando || !!bloqueio}
                title={tx(
                  "Se as mãos saíram com a pele da pessoa original, refaz só a pele delas para combinar com o rosto.",
                )}
                className="inline-flex h-9 items-center justify-center gap-1.5 text-[13px] font-semibold text-ink-mute hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Hand className="h-4 w-4" /> {tx("Corrigir pele das mãos")} ·{" "}
                {creditos} {tx("créditos")}
              </button>
              {antes ? (
                <button
                  type="button"
                  onClick={() => setComparar(true)}
                  className="inline-flex h-9 items-center justify-center gap-1.5 text-[13px] font-semibold text-ink-mute hover:text-ink"
                >
                  <ChevronsLeftRight className="h-4 w-4" />{" "}
                  {tx("Antes e depois")}
                </button>
              ) : null}
              <a
                href={downloadUrl(resultado, `sombra-${Date.now()}.jpg`)}
                className="inline-flex h-9 items-center justify-center gap-1.5 text-[13px] font-semibold text-ink-mute hover:text-ink"
              >
                <Download className="h-4 w-4" /> {tx("Baixar resultado")}
              </a>
            </>
          ) : null}
        </footer>
      </aside>
      {comparar && resultado && antes ? (
        <AntesDepoisImagem
          antes={fileUrl(antes)}
          depois={fileUrl(resultado)}
          onClose={() => setComparar(false)}
        />
      ) : null}
    </section>
  );
}

"use client";

import { useRef, useState } from "react";
import { nanoid } from "nanoid";
import {
  Download,
  Hand,
  ImagePlus,
  Loader2,
  Maximize2,
  RefreshCw,
  Trash2,
  UserRound,
  Wand2,
  X,
} from "lucide-react";
import type { Character, ImagemGerada } from "@/lib/types";
import { cn } from "@/lib/cn";
import { useCharacters } from "@/lib/store";
import { useDuravel } from "@/lib/duravel";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRecursos } from "@/components/RecursosProvider";
import {
  avisarCreditos,
  useCreditos,
} from "@/components/creditos/CreditosProvider";
import { ErroGeracao } from "@/components/creditos/ErroGeracao";
import { Button } from "@/components/ui/Button";
import { CapaImagem } from "@/components/ui/CapaImagem";
import { confirmar } from "@/components/ui/Confirmacao";
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
import { downloadUrl, fileUrl, uploadFile } from "@/lib/storage/client";
import { bloqueioImagem, creditosImagem } from "@/lib/planos";
import type { RoupaTroca } from "@/lib/prompts/trocar-imagem";
import { tx } from "@/lib/i18n/tx";
import { txErro } from "@/lib/i18n/erros";

type Motor = "nano-banana" | "nano-banana-pro";

const MOTORES: Array<{ id: Motor; titulo: string; sub: string; dica: string }> =
  [
    {
      id: "nano-banana",
      titulo: "Padrão",
      sub: "Nano Banana 2",
      dica: "Rápido, mantém bem o cenário. 1K.",
    },
    {
      id: "nano-banana-pro",
      titulo: "Pro",
      sub: "Nano Banana Pro",
      dica: "Mais fiel ao rosto e à luz da foto. 2K.",
    },
  ];

const motorApi = (m: Motor) =>
  ({ qualidade: m === "nano-banana-pro" ? "pro" : "padrao" }) as const;

const MAX_GALERIA = 30;
/** Fotos maiores que isso (ou fora de JPEG/PNG/WebP) são convertidas no navegador antes do envio. */
const LIMITE_ENVIO = 9 * 1024 * 1024;

/** Reduz/convert a foto para JPEG (lado maior ≤ 3072px) quando precisa. */
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
      (b) => (b ? res(b) : rej(new Error("Não consegui ler a imagem."))),
      "image/jpeg",
      0.92,
    ),
  );
}

/**
 * Estúdio → Imagens → Trocar pessoa: envia uma foto, marca quem trocar
 * (até 3) e escolhe qual influencer entra no lugar de cada um. Cenário,
 * luz e enquadramento ficam; o resultado vai para a galeria de trocas.
 */
export function TrocarPessoaImagem({ character }: { character: Character }) {
  const recursos = useRecursos();
  const { user } = useAuth();
  const update = useCharacters((s) => s.update);
  const personagens = useCharacters((s) => s.characters);
  const listaPersonagens = personagens.length ? personagens : [character];
  const opcoes = useImagensPersonagem(character);
  const { conta } = useCreditos();
  const inputRef = useRef<HTMLInputElement>(null);

  const [foto, setFoto] = useDuravel<{ key: string; src: string } | null>(
    `troca-img:${character.id}:foto`,
    null,
  );
  const [enviando, setEnviando] = useDuravel<number | null>(
    `troca-img:${character.id}:enviando`,
    null,
    "Enviando foto",
  );
  const [marcas, setMarcas] = useDuravel<Marca[]>(`troca-img:${character.id}:marcas`, []);
  const [imagem, setImagem] = useState<string | null>(opcoes[0]?.key ?? null);
  const [roupa, setRoupa] = useState<RoupaTroca>("foto");
  const disponiveis = MOTORES.filter((m) => recursos.gemini);
  const [motor, setMotor] = useState<Motor>(
    disponiveis[0]?.id ?? "nano-banana",
  );
  const [gerando, setGerando] = useDuravel<boolean>(
    `troca-img:${character.id}:gerando`,
    false,
    "Trocando pessoa na foto",
  );
  /** A geração em curso é a correção da pele das mãos (e não uma troca). */
  const [corrigindo, setCorrigindo] = useDuravel<boolean>(
    `troca-img:${character.id}:corrigindo`,
    false,
  );
  const [erro, setErro] = useDuravel<string | null>(
    `troca-img:${character.id}:erro`,
    null,
  );
  const [erroCode, setErroCode] = useDuravel<string | null>(
    `troca-img:${character.id}:erroCode`,
    null,
  );
  const [resultado, setResultado] = useDuravel<string | null>(
    `troca-img:${character.id}:resultado`,
    null,
  );
  /** Qual lado mostrar: a foto original (para marcar) ou o último resultado. */
  const [verResultado, setVerResultado] = useDuravel<boolean>(
    `troca-img:${character.id}:verResultado`,
    false,
  );
  const [aberta, setAberta] = useState<string | null>(null);

  const { qualidade } = motorApi(motor);
  const creditos = creditosImagem("nano-banana", qualidade);
  const bloqueio = conta
    ? bloqueioImagem(conta.plano, "nano-banana", qualidade)
    : null;
  const marcasSemImagem = marcas.some((x) => !x.imageKey);
  const trocas = (character.geradas ?? []).filter((g) => g.tipo === "troca");

  if (!recursos.gemini)
    return (
      <p className="text-[13px] text-ink-dim">
        {tx(
          "A troca de pessoa em foto precisa do Gemini configurado (GEMINI_API_KEY).",
        )}
      </p>
    );
  if (!recursos.armazenamento || !user)
    return (
      <p className="text-[13px] text-ink-dim">
        {tx("Entre na sua conta para trocar pessoas em fotos.")}
      </p>
    );

  async function escolherArquivo(file: File | undefined) {
    if (!file) return;
    setErro(null);
    setResultado(null);
    setEnviando(0);
    try {
      const blob = await prepararFoto(file);
      const key = await uploadFile(blob, "refs", (p) => setEnviando(p));
      setFoto({ key, src: URL.createObjectURL(blob) });
      setMarcas([]);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(null);
    }
  }

  /** Com `corrigir`, refaz só a pele das mãos do resultado atual. */
  async function gerar(corrigir = false) {
    if (!foto) return;
    if (corrigir ? !resultado : marcas.length ? marcasSemImagem : !imagem)
      return setErro(tx("Escolha a imagem do personagem."));
    setErro(null);
    setErroCode(null);
    setCorrigindo(corrigir);
    setGerando(true);
    try {
      const res = await fetch("/api/imagens/trocar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          corrigir
            ? {
                characterId: character.id,
                fotoKey: resultado,
                ...motorApi(motor),
                corrigir: true,
              }
            : {
                characterId: character.id,
                fotoKey: foto.key,
                ...motorApi(motor),
                roupa,
                imageKey: marcas.length ? undefined : imagem,
                pessoas: marcas.length
                  ? marcas.map((x) => ({
                      x: x.x,
                      y: x.y,
                      imageKey: x.imageKey,
                    }))
                  : undefined,
              },
        ),
      });
      const body = (await res.json().catch(() => ({}))) as {
        key?: string;
        size?: number;
        error?: string;
        code?: string;
      };
      avisarCreditos();
      if (!res.ok || !body.key) {
        setErroCode(body.code ?? null);
        return setErro(txErro(body.error ?? `Falha ao gerar (HTTP ${res.status}).`));
      }
      const nova: ImagemGerada = {
        id: nanoid(8),
        key: body.key,
        tipo: "troca",
        estilo: character.visual.estilo ?? "realista",
        qualidade,
        modelo: "nano-banana",
        size: body.size ?? 0,
        createdAt: Date.now(),
      };
      update(character.id, (c) => {
        c.geradas = [nova, ...(c.geradas ?? [])].slice(0, MAX_GALERIA);
      });
      setResultado(body.key);
      setVerResultado(true);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setGerando(false);
    }
  }

  async function remover(g: ImagemGerada) {
    const ok = await confirmar({
      titulo: tx("Remover esta imagem?"),
      mensagem: tx(
        "Ela sai da galeria de trocas e o arquivo é apagado em até 24h.",
      ),
      confirmar: tx("Remover"),
      tom: "perigo",
    });
    if (!ok) return;
    update(character.id, (c) => {
      c.geradas = (c.geradas ?? []).filter((x) => x.id !== g.id);
    });
    if (resultado === g.key) setResultado(null);
  }

  const semBarra = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  return (
    <div className="grid gap-6">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        className="hidden"
        onChange={(e) => {
          escolherArquivo(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {!foto ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            escolherArquivo(e.dataTransfer.files?.[0]);
          }}
          disabled={enviando !== null}
          className="rounded-2xl border-2 border-dashed border-line hover:border-accent/60 bg-panel px-6 py-12 grid justify-items-center gap-3 text-center transition"
        >
          {enviando !== null ? (
            <>
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
              <span className="text-[13px] text-ink-mute">
                {tx("Enviando…")} {Math.round(enviando * 100)}%
              </span>
            </>
          ) : (
            <>
              <span className="h-12 w-12 rounded-full bg-accent/15 text-accent grid place-items-center">
                <ImagePlus className="w-6 h-6" />
              </span>
              <span className="text-[15px] font-semibold text-ink">
                {tx("Envie a foto")}
              </span>
              <span className="text-[13px] text-ink-mute max-w-md">
                {tx(
                  "Clique ou arraste uma foto (JPEG, PNG ou WebP). Depois marque quem trocar e escolha qual influencer entra no lugar — cenário, luz e pose ficam iguais.",
                )}
              </span>
            </>
          )}
        </button>
      ) : (
        <section className="rounded-2xl border border-line bg-panel overflow-hidden grid lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Esquerda: a foto com as marcas (ou o resultado) */}
          <div className="relative p-4 sm:p-5 h-[60vh] lg:h-[620px] flex flex-col gap-2 min-h-0">
            <div className="flex items-center justify-between gap-2 shrink-0">
              <div className="flex gap-1 border border-line rounded-full p-0.5 bg-bg">
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
                      "px-3 h-7 rounded-full text-[12px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
                      (id === "resultado") === (verResultado && !!resultado)
                        ? "bg-card text-ink"
                        : "text-ink-mute hover:text-ink",
                    )}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={gerando}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-mute hover:text-ink"
              >
                <RefreshCw className="w-3.5 h-3.5" /> {tx("Outra foto")}
              </button>
            </div>
            <div className="flex-1 min-h-0">
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
                    const nova = novaMarca(x, y, 0, character);
                    setMarcas((all) => [...all, nova]);
                    void buscarMascara({ fotoKey: foto.key }, nova).then(
                      (mascara) =>
                        setMarcas((all) =>
                          all.map((z) =>
                            z.id === nova.id ? { ...z, mascara } : z,
                          ),
                        ),
                    );
                  }}
                  onRemover={(id) =>
                    setMarcas((all) => all.filter((z) => z.id !== id))
                  }
                />
              )}
            </div>
            {gerando && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] grid place-items-center">
                <div className="grid justify-items-center gap-2 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-accent" />
                  <span className="text-[13px] font-semibold text-white">
                    {corrigindo
                      ? tx("Corrigindo a pele das mãos… (até 1 min)")
                      : tx("Trocando a pessoa… (até 1 min)")}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Direita: opções + botão */}
          <aside className="flex flex-col min-h-0 border-t lg:border-t-0 lg:border-l border-line lg:h-[620px]">
            <div
              className={cn(
                "flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 grid content-start gap-5",
                semBarra,
              )}
            >
              {marcas.length === 0 ? (
                <div>
                  <div className="text-[13px] font-semibold text-ink mb-2">
                    {tx("Personagem")}
                  </div>
                  <EscolherImagemPersonagem
                    compacto
                    opcoes={opcoes}
                    valor={imagem}
                    onChange={setImagem}
                  />
                  <p className="text-[11px] text-ink-dim mt-1.5">
                    {tx(
                      "Mais de uma pessoa na foto? Clique em cada uma para escolher quem vira qual influencer.",
                    )}
                  </p>
                </div>
              ) : (
                <div className="grid gap-2">
                  <div className="text-[13px] font-semibold text-ink">
                    {marcas.length === 1
                      ? tx("Pessoa marcada")
                      : `${marcas.length} ${tx("pessoas marcadas")}`}
                  </div>
                  {marcas.map((x, i) => (
                    <LinhaMarca
                      key={x.id}
                      numero={i + 1}
                      marca={x}
                      origem={{ tipo: "foto", src: foto.src }}
                      personagens={listaPersonagens}
                      onChange={(mud) =>
                        setMarcas((all) =>
                          all.map((z) =>
                            z.id === x.id ? { ...z, ...mud } : z,
                          ),
                        )
                      }
                    />
                  ))}
                </div>
              )}

              <div>
                <div className="text-[13px] font-semibold text-ink mb-2">
                  {tx("Roupa")}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["foto", tx("Da foto"), tx("Mantém a roupa original")],
                      [
                        "personagem",
                        tx("Do personagem"),
                        tx("Veste o look do influencer"),
                      ],
                    ] as const
                  ).map(([id, titulo, sub]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setRoupa(id)}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left transition",
                        roupa === id
                          ? "border-accent bg-accent/10"
                          : "border-line hover:border-line-strong",
                      )}
                    >
                      <div className="text-[13px] font-bold text-ink">
                        {titulo}
                      </div>
                      <div className="text-[11px] text-ink-dim">{sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {disponiveis.length > 1 && (
                <div>
                  <div className="text-[13px] font-semibold text-ink mb-2">
                    {tx("Motor")}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {disponiveis.map((x) => (
                      <button
                        key={x.id}
                        type="button"
                        onClick={() => setMotor(x.id)}
                        title={tx(x.dica)}
                        className={cn(
                          "rounded-xl border px-2.5 py-2 text-left transition",
                          motor === x.id
                            ? "border-accent bg-accent/10"
                            : "border-line hover:border-line-strong",
                        )}
                      >
                        <div className="text-[13px] font-bold text-ink">
                          {tx(x.titulo)}
                        </div>
                        <div className="text-[11px] text-ink-dim leading-tight">
                          {x.sub}
                        </div>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-ink-dim mt-1.5">
                    {tx(MOTORES.find((x) => x.id === motor)!.dica)}
                  </p>
                </div>
              )}

              <p className="text-[11px] text-ink-dim flex gap-1.5">
                <UserRound className="w-3.5 h-3.5 shrink-0 mt-px" />
                {tx(
                  "Use só fotos que você tem direito de usar e sinalize que o personagem é sintético.",
                )}
              </p>
              {bloqueio ? (
                <ErroGeracao mensagem={bloqueio} code="PLANO" />
              ) : null}
              {erro ? <ErroGeracao mensagem={erro} code={erroCode} /> : null}
            </div>

            <footer className="shrink-0 border-t border-line p-4 sm:p-5 grid gap-2">
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
                disabled={
                  gerando ||
                  (marcas.length ? marcasSemImagem : !imagem) ||
                  !!bloqueio
                }
              >
                {gerando ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4" />
                )}
                {gerando
                  ? tx("Gerando…")
                  : resultado
                    ? tx("Gerar de novo")
                    : tx("Trocar pessoa")}
              </Button>
              {resultado && (
                <button
                  type="button"
                  onClick={() => gerar(true)}
                  disabled={gerando || !!bloqueio}
                  title={tx(
                    "Se as mãos saíram com a pele da pessoa original, refaz só a pele delas para combinar com o rosto.",
                  )}
                  className="inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold text-ink-mute hover:text-ink h-9 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Hand className="w-4 h-4" /> {tx("Corrigir pele das mãos")} ·{" "}
                  {creditos} {tx("créditos")}
                </button>
              )}
              {resultado && (
                <a
                  href={downloadUrl(resultado, `troca-${Date.now()}.jpg`)}
                  className="inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold text-ink-mute hover:text-ink h-9"
                >
                  <Download className="w-4 h-4" /> {tx("Baixar resultado")}
                </a>
              )}
            </footer>
          </aside>
        </section>
      )}

      {erro && !foto ? <ErroGeracao mensagem={erro} code={erroCode} /> : null}

      {trocas.length > 0 && (
        <section className="grid gap-3">
          <div className="text-[13px] font-semibold text-ink">
            {tx("Galeria de trocas")}{" "}
            <span className="text-ink-dim font-normal">· {trocas.length}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {trocas.map((g) => (
              <figure
                key={g.id}
                className="group relative aspect-[4/5] rounded-xl overflow-hidden border border-line bg-bg"
              >
                <button
                  type="button"
                  onClick={() => setAberta(g.key)}
                  className="absolute inset-0"
                  aria-label={tx("Ver imagem grande")}
                >
                  <CapaImagem
                    src={fileUrl(g.key)}
                    alt={tx("Imagem gerada")}
                    inteira
                  />
                </button>
                <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1.5 bg-gradient-to-t from-black/80 to-transparent pt-8 pb-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                  <button
                    type="button"
                    onClick={() => setAberta(g.key)}
                    title={tx("Ver grande")}
                    className="h-8 w-8 rounded-full bg-black/70 text-white grid place-items-center hover:bg-black"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                  <a
                    href={downloadUrl(g.key, `troca-${g.id}.jpg`)}
                    title={tx("Baixar")}
                    className="h-8 w-8 rounded-full bg-black/70 text-white grid place-items-center hover:bg-black"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => remover(g)}
                    title={tx("Remover")}
                    className="h-8 w-8 rounded-full bg-black/70 text-white grid place-items-center hover:bg-pink"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </figure>
            ))}
          </div>
        </section>
      )}

      {aberta && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm grid place-items-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setAberta(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileUrl(aberta)}
            alt=""
            className="max-h-[90vh] max-w-full rounded-xl object-contain"
          />
          <button
            type="button"
            onClick={() => setAberta(null)}
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-black/70 text-white grid place-items-center"
            aria-label={tx("Fechar")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}

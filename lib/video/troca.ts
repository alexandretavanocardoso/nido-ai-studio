import { pedidoDoEstilo, type EstiloTroca } from "./estilos";
import type { EdicaoTroca } from "./modos";
import {
  ehCoisa,
  nomeDoTipo,
  type RoupaTroca,
  type TipoAlvo,
} from "@/lib/prompts/trocar-imagem";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { FalClient } from "@fal-ai/client";
import type { S3Client } from "@aws-sdk/client-s3";
import { newKey, uploadFromFile } from "@/lib/storage/s3";
import {
  emendarTrechos,
  extrairAudio,
  juntarTrechos,
  prepararTrechoTroca,
  temAudio,
  trechosTroca,
  type VideoInfo,
} from "./ffmpeg";
import {
  baixarTrechos,
  estadoLote,
  type EstadoLote,
  type Segmento,
} from "./lote";
import { TOMADA_MIN, type QualidadeTroca } from "./precos";
import {
  baixarTrechosOmni,
  cancelarOmni,
  enviarTrechoOmni,
  estadoLoteOmni,
  getOmni,
  imagemParaOmni,
  MODELO_OMNI,
  OMNI_MAX_TRECHO,
  pedidoParaOmni,
} from "./omni";
import type { ReferenciaInline } from "@/lib/ai/gemini";
import { comPastaTemporaria } from "./server";
import { webhookUrl } from "./webhook";

/**
 * Troca de pessoa: troca só a pessoa pelo personagem e mantém cenário,
 * câmera, movimento e o áudio original. Três motores:
 *  - kling    → Kling O3 Edit (padrão, fal.ai). Aceita trechos de 3–15s, em três formatos:
 *               Standard (US$ 0,126/s), Pro (US$ 0,168/s, o padrão) e 4K (US$ 0,42/s).
 *  - seedance → Seedance 2.5 em modo edição (premium, fal.ai, US$ 0,568/s em 720p: o fal cobra entrada + saída).
 *               Aceita até 30s de uma vez: preserva melhor cenário, objetos e roupa.
 *  - omni     → Gemini Omni Flash (Google, ~US$ 0,10/s em 720p, ver ./omni.ts).
 *               Edita no máximo 10s por vez: trechos curtos, com o quadro-âncora como o Kling.
 * O vídeo vira trechos iguais do tamanho máximo do motor (lado menor ≥ 720px),
 * processados em paralelo; no fim eles são juntados e o áudio original
 * (música, fala) volta por baixo.
 *
 * A personagem vai SEM fundo (recortada e sobre branco) — com fundo, o modelo
 * copia o cenário da imagem em vez de manter o do vídeo.
 *
 * No Kling vão também (no Omni, menos o close do rosto):
 *  - um quadro-âncora (lib/video/ancora.ts): um quadro do vídeo com a troca já
 *    feita, igual para todos os trechos — sem ele o visual pula nas emendas;
 *  - um close do rosto de cada personagem (o rosto é pequeno na imagem de corpo inteiro);
 *  - a descrição das OUTRAS pessoas do vídeo — sem dizer quem são, o modelo as redesenha.
 */
export type MotorTroca = "kling" | "seedance" | "omni";

/** Kling O3 Edit: um endpoint do fal por formato. */
export const MODELOS_KLING: Record<QualidadeTroca, string> = {
  standard: "fal-ai/kling-video/o3/standard/video-to-video/edit",
  pro: "fal-ai/kling-video/o3/pro/video-to-video/edit",
  "4k": "fal-ai/kling-video/o3/4k/video-to-video/edit",
};

export const MOTORES_TROCA: Record<
  MotorTroca,
  { modelo: string; maxTrecho: number }
> = {
  kling: {
    modelo: MODELOS_KLING.pro,
    maxTrecho: 15,
  },
  seedance: {
    modelo: "bytedance/seedance-2.5/reference-to-video",
    maxTrecho: 30,
  },
  omni: {
    modelo: MODELO_OMNI,
    maxTrecho: OMNI_MAX_TRECHO,
  },
};
const MODELO_RECORTE = "fal-ai/birefnet/v2";

/** Modelos usados antes (jobs antigos ainda em andamento continuam sendo acompanhados neles). */
const MODELOS_ANTIGOS = [
  "fal-ai/kling-video/o1/standard/video-to-video/edit",
  "fal-ai/kling-video/o1/video-to-video/edit",
];

export function ehModeloTroca(modelo: string): boolean {
  return (
    MODELOS_ANTIGOS.includes(modelo) ||
    Object.values(MODELOS_KLING).includes(modelo) ||
    Object.values(MOTORES_TROCA).some((m) => m.modelo === modelo)
  );
}

export interface InputTroca {
  motor: MotorTroca;
  /** Modelo usado neste job (ausente em jobs antigos = Kling O1 standard). */
  modelo?: string;
  /** No Omni, `requestId` de cada segmento é o id da interação no Google. */
  segmentos: Segmento[];
  /** Áudio original (no storage do fal), se o vídeo tinha som. */
  audioUrl: string | null;
}

/** Quem sai do vídeo e quem entra. Sem `descricao`: a pessoa principal do vídeo. */
export interface AlvoTroca {
  personagemUrl: string;
  /** Close do rosto do personagem (referência extra no Kling). */
  rostoUrl?: string | null;
  descricao?: string;
  /** Ausente: pessoa. Animal ou objeto segue as regras de coisa (ver `montarPedido`). */
  tipo?: TipoAlvo;
}

/** O que o pedido precisa saber de cada alvo. */
type AlvoDoPedido = Pick<AlvoTroca, "descricao" | "tipo">;

/**
 * Pedido à IA: troca SÓ as pessoas indicadas (cada uma pelo seu personagem) e
 * exige que todo o resto — inclusive as outras pessoas — fique como no vídeo.
 * Sem descrição, o alvo é "a pessoa principal".
 * `ancora` (Kling e Omni): há um quadro do vídeo com a troca já feita — é ele
 * que mantém o mesmo visual em todos os trechos. No Kling vai como @Image1 (os
 * personagens são @Element); no Omni, depois dos personagens (ver `refAncora`).
 * `outras`: descrição das outras pessoas que aparecem (elas não podem mudar).
 */
export function promptTroca(
  motor: MotorTroca,
  alvos: AlvoDoPedido[],
  removerTexto: boolean,
  ancora = false,
  outras: string[] = [],
  /**
   * Alvos (índices) que aparecem trocados na âncora. Sem isso: todos. Quando
   * falta algum, o pedido avisa que esse também tem que ser trocado.
   */
  naAncora?: number[],
  /**
   * A âncora mostra também um personagem que NÃO aparece neste trecho (o
   * trecho só tem parte das pessoas marcadas): o motor não pode trazê-lo.
   */
  sobraNaAncora = false,
  /** Estilo visual do vídeo (ausente ou "realista": continua parecendo filmado). */
  estilo?: EstiloTroca,
  /**
   * O que acontece no trecho, em palavras (um golpe, uma queda, um abraço).
   * Só com "siga o movimento", gestos rápidos e borrados somem do resultado.
   */
  acao?: string,
  /**
   * De onde vem a roupa de quem é trocado: do personagem (padrão) ou do vídeo
   * ("foto": só a cabeça e a pele viram o personagem; a roupa original fica).
   */
  roupa?: RoupaTroca,
  /**
   * Pedido escrito pelo usuário (em inglês). No modo "personagem_cena" ele é o
   * lugar novo; no "personagem", um pedido a mais (tem prioridade sobre as regras).
   */
  edicao?: EdicaoTroca,
): string {
  const oQueAcontece = acao?.trim() || undefined;
  // O Kling recusa pedidos com mais de 2500 caracteres. As regras são fixas;
  // o que cresce são as descrições (pessoas a trocar e "outras pessoas").
  // Se não couber, elas encolhem — primeiro as das outras pessoas.
  for (const [maxAlvo, maxOutra, nOutras, maxAcao] of CORTES_DO_PEDIDO) {
    const texto = montarPedido(
      motor,
      alvos.map((a) => ({
        tipo: a.tipo,
        descricao: a.descricao && encurtar(a.descricao, maxAlvo),
      })),
      removerTexto,
      ancora,
      outras.slice(0, nOutras).map((x) => encurtar(x, maxOutra)),
      naAncora,
      sobraNaAncora,
      estilo,
      oQueAcontece && encurtar(oQueAcontece, maxAcao),
      roupa,
      edicao,
    );
    if (texto.length <= PEDIDO_MAX) return texto;
  }
  return montarPedido(
    motor,
    alvos.map((a) => ({
      tipo: a.tipo,
      descricao: a.descricao && encurtar(a.descricao, 60),
    })),
    removerTexto,
    ancora,
    [],
    naAncora,
    sobraNaAncora,
    estilo,
    oQueAcontece && encurtar(oQueAcontece, 120),
    roupa,
    edicao,
  ).slice(0, PEDIDO_MAX);
}

/**
 * Pedido à IA sem ninguém a trocar: só o que o usuário escreveu muda — o fundo
 * ("cena") ou um detalhe, como um acessório ("detalhe"). Pessoas, movimento e
 * câmera ficam como no vídeo. `ancora` (Kling e Omni): um quadro do vídeo com a
 * mudança já feita, enviado como @Image1, para todos os trechos saírem iguais.
 */
export function promptEdicao(
  motor: MotorTroca,
  edicao: EdicaoTroca,
  removerTexto: boolean,
  ancora = false,
  estilo?: EstiloTroca,
): string {
  const pedido = (edicao.pedido ?? "").trim().replace(/[.\s]+$/, "");
  const visual = pedidoDoEstilo(estilo);
  const cena = edicao.modo === "cena";
  return [
    cena
      ? `In @Video1, change ONLY the background and setting: ${pedido}.`
      : `In @Video1, change ONLY this: ${pedido}.`,
    ancora && motor !== "seedance"
      ? "@Image1 is a frame of this same video with the change already done: match it exactly in every frame."
      : "",
    cena
      ? "Every person, animal and object in the foreground stays exactly as in @Video1 (faces, hair, clothes, movements, what they hold), now in the new place. Keep the camera angle, framing and camera movement of @Video1; the new place's light falls naturally on everyone."
      : "Everything else stays exactly as in @Video1: every person (face, hair, clothes, movements), the background, the objects, the camera angle, framing and lighting. A changed item follows the original frame by frame (position, size, perspective) and keeps the same grip when someone holds or wears it.",
    "The change is the same in every frame, also when people move or the camera turns. Add or remove no person.",
    visual
      ? `Render the ENTIRE video as ${visual}. The same style in every frame, never a photo or a mix of photo and drawing.`
      : "Everything new must look really filmed by this camera: the scene's light and shadows, same sharpness, grain and motion blur. Never a pasted cutout.",
    removerTexto
      ? "Remove all on-screen text, captions and subtitles."
      : "Keep the on-screen text of @Video1.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Limite do Kling é 2500 caracteres; fica uma folga. */
export const PEDIDO_MAX = 2400;
/**
 * [máx. por pessoa a trocar, máx. por "outra pessoa", quantas "outras", máx. da
 * ação], do mais completo ao mais enxuto. A ação é a última a encolher: é ela
 * que faz o motor reproduzir um golpe ou uma queda.
 */
const CORTES_DO_PEDIDO: Array<[number, number, number, number]> = [
  [220, 240, 3, 320],
  [160, 140, 3, 320],
  [160, 110, 2, 320],
  [120, 90, 2, 280],
  [100, 80, 1, 240],
  [80, 0, 0, 200],
];

/** Corta no fim de uma palavra, sem passar de `max`. */
function encurtar(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max);
  return corte.slice(0, Math.max(corte.lastIndexOf(" "), max - 20)).trim();
}

function montarPedido(
  motor: MotorTroca,
  alvos: AlvoDoPedido[],
  removerTexto: boolean,
  ancora: boolean,
  outras: string[],
  naAncora: number[] | undefined,
  sobraNaAncora: boolean,
  estilo?: EstiloTroca,
  acao?: string,
  roupa?: RoupaTroca,
  edicao?: EdicaoTroca,
): string {
  // O pedido do usuário: no modo "personagem_cena" ele é o lugar novo (e
  // substitui a regra de manter o cenário); senão, um pedido a mais.
  const pedido = edicao?.pedido?.trim().replace(/[.\s]+$/, "");
  const novaCena = edicao?.modo === "personagem_cena" && !!pedido;
  // Animal ou objeto na lista: as regras de pessoa (cabeça, roupa, costas) só
  // valem para as pessoas, e as coisas têm as regras delas. Só com pessoas, o
  // pedido é o de sempre.
  const coisas = alvos.flatMap((a, i) => (ehCoisa(a.tipo) ? [i] : []));
  const pessoas = alvos.flatMap((a, i) => (ehCoisa(a.tipo) ? [] : [i]));
  const temCoisa = coisas.length > 0;
  const temPessoa = pessoas.length > 0;
  // Só a cabeça: rosto, cabelo e pele vêm do personagem; a roupa é a do vídeo.
  const soCabeca = roupa === "foto" && temPessoa;
  // Com estilo, o vídeo inteiro é redesenhado: quem não é trocado continua
  // sendo a mesma pessoa, só que desenhada; e o cenário mantém a composição.
  const visual = pedidoDoEstilo(estilo);
  const ref = (i: number) =>
    motor === "kling" ? `@Element${i + 1}` : `@Image${i + 1}`;
  // O Seedance não recebe quadro-âncora. No Omni ele vai depois dos personagens.
  const comAncora = ancora && motor !== "seedance";
  const refAncora = motor === "omni" ? `@Image${alvos.length + 1}` : "@Image1";
  const refsPessoas = pessoas.map(ref).join(", ");
  const quem = (a: AlvoDoPedido) =>
    a.descricao ?? `the main ${nomeDoTipo(a.tipo)}`;
  const foraDaAncora = naAncora
    ? alvos.map((_, i) => i).filter((i) => !naAncora.includes(i))
    : [];
  const igualAncora = `(${[
    temPessoa ? "face, hair, hat, outfit" : "",
    temCoisa ? "shape, colours, markings, details" : "",
    "proportions, lighting",
  ]
    .filter(Boolean)
    .join(", ")})`;
  // Legendas e textos da tela ficam, a não ser que o usuário peça para tirar
  // (sem dizer isso, o motor às vezes some com a legenda do vídeo).
  const legendas = removerTexto ? "" : "on-screen text, ";
  return [
    temCoisa
      ? "In @Video1, replace ONLY what is listed here:"
      : `In @Video1, replace ONLY ${alvos.length === 1 ? "this person" : "these people"}:`,
    ...alvos.map((a, i) =>
      ehCoisa(a.tipo)
        ? `- ${quem(a)} → replace with the ${nomeDoTipo(a.tipo)} shown in ${ref(i)}.`
        : soCabeca
          ? `- ${quem(a)} → replace ONLY their head (face, hair, headwear, skin tone) with the character ${ref(i)}; the body keeps its own build and clothes.`
          : `- ${quem(a)} → replace with the character ${ref(i)}.`,
    ),
    ...(comAncora
      ? foraDaAncora.length
        ? [
            `${refAncora} is a frame of this same scene with the replacement already done ONLY for ${naAncora!.map((i) => ref(i)).join(", ")}: match it exactly in every frame ${igualAncora}.`,
            `${refAncora} does NOT show the replacement of ${foraDaAncora.map((i) => `${quem(alvos[i])} (${ref(i)})`).join("; ")}: replace them too in every frame, taking ${foraDaAncora.some((i) => ehCoisa(alvos[i].tipo)) ? "their look" : soCabeca ? "face and hair" : "face, hair and outfit"} from ${foraDaAncora.map((i) => ref(i)).join(", ")}.`,
          ]
        : [
            `${refAncora} is a frame of this same scene with the replacement already done: ${temCoisa ? "everything replaced" : "the character(s)"} must look exactly like that in every frame ${igualAncora}.`,
          ]
      : [
          ...(temPessoa
            ? [
                soCabeca
                  ? `Take only the head of each character from ${refsPessoas}: face, hair, facial hair, hat or headwear, glasses, skin tone.`
                  : `Keep each character's face, hair, style and outfit exactly as in ${refsPessoas}.`,
              ]
            : []),
          ...(temCoisa
            ? [
                `Keep the shape, colours, markings and details of each replaced animal or object exactly as in ${coisas.map(ref).join(", ")}.`,
              ]
            : []),
        ]),
    ...(sobraNaAncora && comAncora
      ? [
          temCoisa
            ? `${refAncora} also shows another replacement that does NOT appear in @Video1: never add it.`
            : `${refAncora} also shows another replaced person who does NOT appear in @Video1: never add them.`,
        ]
      : []),
    ...(alvos.length > 1
      ? [
          temCoisa
            ? `All ${alvos.length} listed targets must be replaced, each only with its own reference: never merge two of them or leave one unchanged. A target may leave the frame: while it is not on screen its replacement does not appear.`
            : `All ${alvos.length} listed people must be replaced, each only with their own character: never merge two characters, leave one unchanged, or add a hat, hair or clothing as a loose object. A person may leave the frame: while they are not on screen their character does not appear; never give one character's look to a different person.`,
        ]
      : []),
    // Sem esta regra o motor copia a roupa da imagem de referência do personagem.
    ...(soCabeca
      ? [
          `CLOTHING: each replaced person keeps exactly the clothes, shoes and accessories they wear in @Video1 — same pieces, colours and patterns, in every frame. Never copy the outfit from ${refsPessoas}: only the head and the skin are the character's; the body keeps its own build. Headwear belongs to the head: the character's hat, glasses and earrings come with it, and the original person's own hat or cap is gone.`,
        ]
      : []),
    // O fim da frase ("nothing of their own head…") evita sobrar cabelo ou peruca
    // da pessoa original por baixo do chapéu do personagem.
    temPessoa
      ? "Each replaced person stays the SAME character in every frame, also turning around or seen from behind. A back view stays a back view: never a face or chest where the original shows a back. Nothing of their own head remains (hair, wig, hat, glasses, facial hair)."
      : "",
    `${temPessoa ? "Every other person" : "Every person"} in @Video1 ${
      visual
        ? "stays the same person (face, hair, clothes, movements), drawn in the same style"
        : "must stay exactly as they are (face, hair, clothes, movements)"
    }, ${temPessoa ? "also when crossing the replaced person" : "also when holding, touching or passing in front of what is replaced"}.`,
    outras.length
      ? `Other people who must NOT be changed in any way: ${outras.join("; ")}.`
      : "",
    visual
      ? `Render the ENTIRE video — the replaced characters, every other person, the background and the objects — as ${visual}. The same style in every frame, never a photo or a mix of photo and drawing.`
      : "",
    !visual && temPessoa
      ? "Replaced characters must look like real people filmed by this camera, even if the reference is a 3D render or drawing: real skin texture, the scene's light, same sharpness, grain and motion blur. Never a pasted cutout or plastic skin."
      : "",
    // Com pessoas na lista, a regra de cima já pede aparência de filmagem (e o
    // pedido tem limite de tamanho): esta só entra quando só há coisas.
    !visual && !temPessoa
      ? "Replaced animals and objects must look really filmed by this camera, even if the reference is a 3D render or drawing: real materials (fur, paint, glass, reflections), the scene's light and shadows, same sharpness, grain and motion blur. Never a pasted cutout."
      : "",
    temPessoa
      ? "Follow the replaced person's motion frame by frame: pose, arms, hands and finger gestures, head direction and expression."
      : "",
    temCoisa
      ? "Each replaced animal or object stays the SAME one in every frame, with nothing of the original left, and follows the original frame by frame: position, size, path, orientation, perspective, an animal's gait and pose; hands holding it keep their grip."
      : "",
    acao
      ? `What happens in @Video1 (same moments, speed and force): ${acao}`
      : "",
    pedido && !novaCena
      ? `Also do this (it takes priority over the rules above where they conflict): ${pedido}.`
      : "",
    novaCena
      ? `NEW SCENE: ${pedido}. Everyone is now in this new place, with the same positions, poses and movements, and its light falls naturally on them. Keep the ${legendas}camera angle, framing and camera movement of @Video1; add or remove no person.`
      : visual
        ? // "add or remove no…": sem isto aparecem figurantes e objetos que não existem no vídeo.
          `Keep the scene of @Video1: the same place, objects, ${legendas}camera angle and framing — only the rendering style changes; add or remove no person or object.`
        : `Keep the background, objects, ${legendas}camera angle, framing and lighting of @Video1 unchanged; add or remove no person or object.`,
    removerTexto ? "Remove all on-screen text, captions and subtitles." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** O que vai ao motor num trecho (além do vídeo dele). */
interface EntradaTrecho {
  alvos: AlvoTroca[];
  duracao: number;
  removerTexto: boolean;
  ancoraUrl?: string | null;
  outras?: string[];
  naAncora?: number[];
  sobraNaAncora?: boolean;
  estilo?: EstiloTroca;
  acao?: string;
  roupa?: RoupaTroca;
  edicao?: EdicaoTroca;
}

/**
 * Imagem de quem entra. Só a cabeça: o close do rosto — a imagem de corpo
 * inteiro traz a roupa do personagem, que o motor tende a copiar.
 */
const referenciaDoAlvo = (a: AlvoTroca, roupa?: RoupaTroca) =>
  roupa === "foto" ? (a.rostoUrl ?? a.personagemUrl) : a.personagemUrl;

/** Ninguém a trocar (só a cena, ou só um detalhe): vale só o pedido escrito. */
const soPedidoDe = (o: EntradaTrecho) =>
  !o.alvos.length && o.edicao ? o.edicao : null;

function inputMotor(
  motor: MotorTroca,
  o: EntradaTrecho & { videoUrl: string },
): Record<string, unknown> {
  const referencia = (a: AlvoTroca) => referenciaDoAlvo(a, o.roupa);
  const soPedido = soPedidoDe(o);
  if (motor === "kling")
    return {
      prompt: soPedido
        ? promptEdicao(motor, soPedido, o.removerTexto, !!o.ancoraUrl, o.estilo)
        : promptTroca(
            motor,
            o.alvos,
            o.removerTexto,
            !!o.ancoraUrl,
            o.outras,
            o.naAncora,
            o.sobraNaAncora,
            o.estilo,
            o.acao,
            o.roupa,
            o.edicao,
          ),
      video_url: o.videoUrl,
      keep_audio: false,
      // Quadro do vídeo com a troca já feita: guia o visual de todos os trechos (@Image1).
      ...(o.ancoraUrl ? { image_urls: [o.ancoraUrl] } : {}),
      // O Kling pede 1 a 3 imagens extras de cada personagem: o close do rosto
      // (melhora rosto, barba e chapéu); sem ele, a própria imagem principal.
      ...(soPedido
        ? {}
        : {
            elements: o.alvos.map((a) => ({
              frontal_image_url: referencia(a),
              reference_image_urls: [a.rostoUrl ?? a.personagemUrl],
            })),
          }),
    };
  return {
    task: "editing",
    prompt: soPedido
      ? promptEdicao(motor, soPedido, o.removerTexto, false, o.estilo)
      : promptTroca(
          motor,
          o.alvos,
          o.removerTexto,
          false,
          o.outras,
          undefined,
          false,
          o.estilo,
          o.acao,
          o.roupa,
          o.edicao,
        ),
    video_urls: [o.videoUrl],
    ...(soPedido ? {} : { image_urls: o.alvos.map(referencia) }),
    resolution: "720p",
    // Duração do trecho (o Seedance gera de 4 a 30s); o áudio original corta o excesso no final.
    duration: Math.min(30, Math.max(4, Math.round(o.duracao))),
    generate_audio: false,
  };
}

/**
 * Omni: o pedido (no formato dele, ver `pedidoParaOmni`) e as imagens na ordem
 * das referências — os personagens e, por último, o quadro-âncora.
 */
export function entradaOmni(o: EntradaTrecho): {
  pedido: string;
  imagens: string[];
} {
  const soPedido = soPedidoDe(o);
  const ancora = !!o.ancoraUrl;
  const pedido = soPedido
    ? promptEdicao("omni", soPedido, o.removerTexto, ancora, o.estilo)
    : promptTroca(
        "omni",
        o.alvos,
        o.removerTexto,
        ancora,
        o.outras,
        o.naAncora,
        o.sobraNaAncora,
        o.estilo,
        o.acao,
        o.roupa,
        o.edicao,
      );
  return {
    pedido: pedidoParaOmni(pedido),
    imagens: [
      ...(soPedido ? [] : o.alvos.map((a) => referenciaDoAlvo(a, o.roupa))),
      ...(o.ancoraUrl ? [o.ancoraUrl] : []),
    ],
  };
}

async function enviar(
  fal: FalClient,
  arquivo: string,
  tipo: string,
): Promise<string> {
  return comLimite(
    fal.storage.upload(
      new Blob([new Uint8Array(await readFile(arquivo))], { type: tipo }),
    ),
    "envio de arquivo",
  );
}

/**
 * Close da cabeça a partir da figura recortada sobre branco: o terço de cima
 * da figura (cabeça, chapéu, barba), ampliado. Null se não der para recortar.
 */
export async function closeDoRosto(
  figuraSobreBranco: Buffer,
): Promise<Buffer | null> {
  try {
    const figura = await sharp(figuraSobreBranco)
      .trim({ background: "#ffffff", threshold: 12 })
      .toBuffer({ resolveWithObject: true });
    const { width, height } = figura.info;
    // Só vale para figura em pé (corpo inteiro ou meio corpo); num close já não precisa.
    if (height < width * 1.3) return null;
    // O terço de cima — mas nunca uma tira mais larga que 2:1: o Kling recusa
    // imagem com proporção acima de 2,5 (figura larga, de braços abertos ou de capa).
    const alto = Math.min(
      height,
      Math.max(Math.round(height * 0.3), Math.ceil(width / 2)),
    );
    return await sharp(figura.data)
      .extract({ left: 0, top: 0, width, height: alto })
      .resize({ width: 1024 })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 92 })
      .toBuffer();
  } catch {
    return null;
  }
}

/** O Kling só aceita imagens com proporção (largura ÷ altura) entre 0,4 e 2,5. */
const PROPORCAO_KLING = { min: 0.45, max: 2.2 } as const;

/**
 * Deixa a imagem numa proporção que o motor aceita, completando com branco nas
 * laterais (imagem alta demais) ou em cima e embaixo (larga demais). A figura
 * não é cortada nem deformada. Dentro da faixa, devolve como veio.
 */
export async function caberNaProporcao(imagem: Buffer): Promise<Buffer> {
  const { width, height } = await sharp(imagem).metadata();
  if (!width || !height) return imagem;
  const proporcao = width / height;
  if (proporcao >= PROPORCAO_KLING.min && proporcao <= PROPORCAO_KLING.max)
    return imagem;
  const largura =
    proporcao < PROPORCAO_KLING.min
      ? Math.ceil(height * PROPORCAO_KLING.min)
      : width;
  const altura =
    proporcao > PROPORCAO_KLING.max
      ? Math.ceil(width / PROPORCAO_KLING.max)
      : height;
  const lados = largura - width;
  const cimaEBaixo = altura - height;
  return sharp(imagem)
    .flatten({ background: "#ffffff" })
    .extend({
      left: Math.floor(lados / 2),
      right: Math.ceil(lados / 2),
      top: Math.floor(cimaEBaixo / 2),
      bottom: Math.ceil(cimaEBaixo / 2),
      background: "#ffffff",
    })
    .png()
    .toBuffer();
}

/**
 * Personagem recortada sobre branco liso (+ close do rosto, quando dá).
 * Se o recorte falhar, segue com a imagem original.
 * `comRosto` false: a imagem é de um animal ou objeto — o terço de cima dela
 * não é um rosto.
 */
export async function personagemSemFundo(
  fal: FalClient,
  imagem: Buffer,
  comRosto = true,
): Promise<{ url: string; rostoUrl: string | null }> {
  const subir = (b: Buffer, tipo: string) =>
    fal.storage.upload(new Blob([new Uint8Array(b)], { type: tipo }));
  // Tudo o que vai ao motor passa por `caberNaProporcao`: uma imagem muito
  // alta ou muito larga faz o Kling recusar o pedido inteiro.
  const noLimite = await caberNaProporcao(imagem).catch(() => imagem);
  const original = await subir(
    noLimite,
    noLimite === imagem ? "image/jpeg" : "image/png",
  );
  try {
    const r = await fal.subscribe(MODELO_RECORTE, {
      input: {
        image_url: original,
        model: "General Use (Heavy)",
        output_format: "png",
      },
    });
    const url = (r.data as { image?: { url?: string } })?.image?.url;
    if (!url) return { url: original, rostoUrl: null };
    const recorte = Buffer.from(await (await fetch(url)).arrayBuffer());
    const branco = await sharp(recorte)
      .flatten({ background: "#ffffff" })
      .png()
      .toBuffer();
    const rosto = comRosto ? await closeDoRosto(branco) : null;
    const [figuraUrl, rostoUrl] = await Promise.all([
      subir(await caberNaProporcao(branco), "image/png"),
      rosto ? subir(await caberNaProporcao(rosto), "image/png") : null,
    ]);
    return { url: figuraUrl, rostoUrl };
  } catch (e) {
    console.warn(
      "[troca] recorte da personagem falhou, usando a imagem original:",
      (e as Error).message,
    );
    return { url: original, rostoUrl: null };
  }
}

/** Quem aparece em cada quadro amostrado (ver `linhaDoTempoDosAlvos` em ./ancora.ts). */
interface Presencas {
  instantes: number[];
  visiveis: number[][];
}

/**
 * Instantes em que uma pessoa a trocar entra em cena: aparece num quadro depois
 * de ter ficado fora nos dois anteriores (um quadro só de ausência pode ser
 * alguém passando na frente). Vale o instante do primeiro quadro COM ela: o
 * trecho novo tem que começar com a pessoa já na tela. Começando um pouco
 * antes (testado), o motor monta no primeiro quadro a cena do quadro-âncora,
 * com personagens que não estão ali. O primeiro quadro do vídeo não conta:
 * ali ninguém "entra".
 */
export function entradasDosAlvos(linha: Presencas, total: number): number[] {
  const entradas = new Set<number>();
  for (let alvo = 0; alvo < total; alvo++)
    for (let k = 1; k < linha.instantes.length; k++) {
      const em = (q: number) => linha.visiveis[q].includes(alvo);
      if (em(k) && !em(k - 1) && (k < 2 || !em(k - 2)))
        entradas.add(linha.instantes[k]);
    }
  return [...entradas].sort((a, b) => a - b);
}

/**
 * Para cada trecho, quem aparece nele (em qualquer quadro amostrado dentro do
 * trecho). Trecho sem quadro amostrado, ou sem ninguém visto: todos — na
 * dúvida ninguém fica sem trocar.
 */
export function alvosNosTrechos(
  trechos: Array<{ inicio: number; duracao: number }>,
  linha: Presencas,
  total: number,
): number[][] {
  const todos = Array.from({ length: total }, (_, i) => i);
  return trechos.map((t) => {
    const vistos = new Set<number>();
    linha.instantes.forEach((instante, k) => {
      // Folga de 1 ms: o trecho pode começar exatamente num quadro amostrado.
      if (instante >= t.inicio - 0.001 && instante < t.inicio + t.duracao)
        for (const a of linha.visiveis[k]) vistos.add(a);
    });
    return vistos.size ? [...vistos].sort((a, b) => a - b) : todos;
  });
}

/**
 * Alvos de um trecho: só os que aparecem nele (`presentes`, índices da lista
 * completa), com a âncora reindexada para essa lista menor. Lista vazia ou
 * ausente = todos (na dúvida, o trecho recebe todo mundo, como sempre foi).
 */
export function alvosDoTrecho(
  alvos: AlvoTroca[],
  presentes: number[] | undefined,
  naAncora: number[] | undefined,
): { alvos: AlvoTroca[]; naAncora?: number[]; sobraNaAncora: boolean } {
  const indices = presentes?.length
    ? [...new Set(presentes)]
        .filter((i) => i >= 0 && i < alvos.length)
        .sort((a, b) => a - b)
    : [];
  if (!indices.length || indices.length === alvos.length)
    return { alvos, naAncora, sobraNaAncora: false };
  return {
    alvos: indices.map((i) => alvos[i]),
    naAncora: naAncora
      ? indices.flatMap((i, novo) => (naAncora.includes(i) ? [novo] : []))
      : undefined,
    sobraNaAncora: !!naAncora?.some((i) => !indices.includes(i)),
  };
}

/**
 * A ação de um trecho vem escrita com as pessoas como [[1]], [[2]]… (a ordem
 * dos alvos). Aqui cada uma vira a referência que o motor entende — @Element
 * ou @Image, na numeração dos alvos DESTE trecho — e quem não está no trecho
 * vira "another person".
 */
export function acaoDoTrecho(
  acao: string | undefined,
  presentes: number[] | undefined,
  total: number,
  motor: MotorTroca,
): string | undefined {
  if (!acao?.trim()) return undefined;
  const indices = presentes?.length
    ? [...new Set(presentes)]
        .filter((i) => i >= 0 && i < total)
        .sort((a, b) => a - b)
    : Array.from({ length: total }, (_, i) => i);
  return acao.trim().replace(/\[\[(\d+)\]\]/g, (_, n: string) => {
    const pos = indices.indexOf(Number(n) - 1);
    if (pos < 0) return "another person";
    return motor === "kling" ? `@Element${pos + 1}` : `@Image${pos + 1}`;
  });
}

/** Uma tomada no modo tomada por tomada (ver `iniciarTroca`). */
export interface TomadaEnvio {
  inicio: number;
  duracao: number;
  /** Quem trocar nela, já com a descrição da própria tomada. Vazio: fica como no original. */
  alvos: AlvoTroca[];
  /** Quadro da tomada com a troca feita. */
  ancora: Buffer | null;
  /** Posições (em `alvos`) de quem aparece trocado na âncora. */
  naAncora: number[];
  /** O que acontece nela, já com as referências do motor (@Element1…). */
  acao?: string;
}

/** O preparo não coube no tempo da rota: nada fica no motor e os créditos voltam. */
export class PreparoDemorou extends Error {
  constructor() {
    super(
      "O preparo deste vídeo demorou demais e foi interrompido. Tente de novo; se repetir, use uma duração menor.",
    );
  }
}

/** Conversões de vídeo (ffmpeg) e envios ao mesmo tempo: um servidor pequeno engasga com todos de uma vez. */
const ENVIOS_POR_VEZ = 4;
/** Um upload ou pedido ao fal que não responde nesse tempo é dado como perdido (em vez de travar a rota). */
const LIMITE_CHAMADA_MS = 60_000;
const INTERROMPIDO = "Envio interrompido.";

function comLimite<T>(p: Promise<T>, oQue: string): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([
    p,
    new Promise<never>((_, falhar) => {
      t = setTimeout(
        () => falhar(new Error(`O fal não respondeu a tempo (${oQue}).`)),
        LIMITE_CHAMADA_MS,
      );
    }),
  ]).finally(() => clearTimeout(t));
}

/**
 * Envia as partes de um vídeo ao motor, poucas por vez e dentro do prazo. Se
 * uma falhar ou o prazo acabar, as outras param e os pedidos que já estavam
 * na fila do motor são cancelados — senão ele processa (e cobra) trechos de
 * um vídeo que nunca vai ser montado.
 */
async function enviarPartes<T>(
  o: {
    /** Tira um pedido da fila do motor (fal ou Google). */
    cancelar: (requestId: string) => Promise<unknown>;
    prazo?: number;
  },
  partes: T[],
  enviarParte: (
    parte: T,
    i: number,
    c: {
      /** Antes de cada etapa demorada: para se outra parte falhou ou o prazo acabou. */
      conferir: () => void;
      /** Pedido aceito pelo motor (para cancelar se o envio não terminar). */
      naFila: (requestId: string) => void;
    },
  ) => Promise<Segmento>,
): Promise<Segmento[]> {
  const pedidos: string[] = [];
  let parou = false;
  const c = {
    conferir() {
      if (parou) throw new Error(INTERROMPIDO);
      if (o.prazo && Date.now() > o.prazo) throw new PreparoDemorou();
    },
    naFila: (id: string) => void pedidos.push(id),
  };
  const saida = new Array<Segmento>(partes.length);
  let proxima = 0;
  // Espera todas as filas pararem antes de desfazer: uma parte no meio do
  // caminho ainda pode entrar na fila do motor (e precisa ser cancelada), e a
  // pasta temporária só pode ser apagada sem ffmpeg escrevendo nela.
  const filas = await Promise.allSettled(
    Array.from(
      { length: Math.min(ENVIOS_POR_VEZ, partes.length) },
      async () => {
        try {
          for (let i = proxima++; i < partes.length; i = proxima++) {
            c.conferir();
            saida[i] = await enviarParte(partes[i], i, c);
          }
        } catch (e) {
          parou = true;
          throw e;
        }
      },
    ),
  );
  const falhas = filas.filter((f) => f.status === "rejected");
  if (!falhas.length) return saida;
  await Promise.allSettled(pedidos.map((requestId) => o.cancelar(requestId)));
  // A causa é o primeiro erro de verdade, não o "interrompido" das outras filas.
  throw (
    falhas.find((f) => (f.reason as Error)?.message !== INTERROMPIDO) ??
    falhas[0]
  ).reason;
}

/**
 * Envia as tomadas uma a uma. As mais curtas que o mínimo do motor vão em
 * câmera lenta (a montagem devolve a velocidade); as mais longas que o máximo
 * são divididas em partes iguais; as sem ninguém a trocar não vão ao motor —
 * o próprio original entra na montagem.
 */
async function enviarTomadas(
  o: {
    fal: FalClient;
    motor: MotorTroca;
    arquivo: string;
    info: VideoInfo;
    removerTexto: boolean;
    estilo?: EstiloTroca;
    roupa?: RoupaTroca;
    jobId: string;
    tomadas: TomadaEnvio[];
    prazo?: number;
    edicao?: EdicaoTroca;
  },
  modelo: string,
  maxTrecho: number,
  dir: string,
): Promise<Segmento[]> {
  const partes = o.tomadas.flatMap((t) =>
    trechosTroca(t.duracao, maxTrecho).map((p) => ({
      tomada: t,
      inicio: Number((t.inicio + p.inicio).toFixed(3)),
      duracao: p.duracao,
    })),
  );
  const ancoras = new Map<TomadaEnvio, Promise<string | null>>();
  const ancoraDe = (t: TomadaEnvio) => {
    if (!ancoras.has(t))
      ancoras.set(
        t,
        t.ancora && o.motor === "kling"
          ? comLimite(
              o.fal.storage.upload(
                new Blob([new Uint8Array(t.ancora)], { type: "image/jpeg" }),
              ),
              "envio do quadro-guia",
            )
          : Promise.resolve(null),
      );
    return ancoras.get(t)!;
  };
  return enviarPartes(
    {
      cancelar: (requestId) => o.fal.queue.cancel(modelo, { requestId }),
      prazo: o.prazo,
    },
    partes,
    async (p, i, c) => {
      const lentidao = p.duracao < TOMADA_MIN ? TOMADA_MIN / p.duracao : 1;
      const seg = path.join(dir, `tomada-${i}.mp4`);
      await prepararTrechoTroca(
        o.arquivo,
        p.inicio,
        p.duracao,
        seg,
        o.info,
        p.tomada.alvos.length ? lentidao : 1,
      );
      c.conferir();
      const videoUrl = await enviar(o.fal, seg, "video/mp4");
      if (!p.tomada.alvos.length)
        return {
          requestId: "",
          inicio: p.inicio,
          duracao: p.duracao,
          urlPronta: videoUrl,
        };
      const ancoraUrl = await ancoraDe(p.tomada);
      c.conferir();
      const { request_id } = await comLimite(
        o.fal.queue.submit(modelo, {
          input: inputMotor(o.motor, {
            videoUrl,
            alvos: p.tomada.alvos,
            duracao: p.duracao * lentidao,
            removerTexto: o.removerTexto,
            estilo: o.estilo,
            roupa: o.roupa,
            edicao: o.edicao,
            acao: p.tomada.acao,
            ancoraUrl,
            naAncora: ancoraUrl ? p.tomada.naAncora : undefined,
          }),
          webhookUrl: webhookUrl(o.jobId),
        }),
        "pedido ao motor",
      );
      c.naFila(request_id);
      return { requestId: request_id, inicio: p.inicio, duracao: p.duracao };
    },
  );
}

/** Divide o vídeo (já baixado em `arquivo`), envia os trechos ao motor e guarda o áudio original. */
export async function iniciarTroca(o: {
  fal: FalClient;
  motor: MotorTroca;
  /** Formato do Kling O3 (Standard, Pro ou 4K). O Seedance ignora. */
  qualidade?: QualidadeTroca;
  arquivo: string;
  info: VideoInfo;
  alvos: AlvoTroca[];
  removerTexto: boolean;
  jobId: string;
  /** Quadro do vídeo com a troca já feita (lib/video/ancora.ts). O Seedance não usa. */
  ancora?: Buffer | null;
  /** Descrição das outras pessoas do vídeo (não podem mudar). */
  outras?: string[];
  /** Alvos que aparecem trocados na âncora (ver lib/video/ancora.ts). */
  naAncora?: number[];
  /** Estilo visual do vídeo (ver ./estilos.ts). */
  estilo?: EstiloTroca;
  /** Roupa de quem é trocado: do personagem (padrão) ou a do vídeo ("foto": só a cabeça muda). */
  roupa?: RoupaTroca;
  /**
   * Divisão do vídeo já calculada (nas viradas de cena). Sem isso: partes
   * iguais do tamanho máximo do motor.
   */
  trechos?: Array<{ inicio: number; duracao: number }>;
  /**
   * Para cada trecho (mesma ordem de `trechos`), os alvos que aparecem
   * nele. Sem isso, todo trecho recebe todos os alvos — e, num trecho em que
   * só uma das pessoas aparece, o motor "encaixa" o outro personagem nela.
   */
  alvosPorTrecho?: number[][];
  /**
   * Modo tomada por tomada (só Kling: vídeo de cortes rápidos, ver ./precos.ts): cada
   * tomada vai sozinha ao motor, com os alvos, a âncora e a ação DELA. Com
   * isto, `trechos`, `alvosPorTrecho`, `acoesPorTrecho`, `ancora` e `naAncora`
   * (os do vídeo inteiro) não são usados.
   */
  tomadas?: TomadaEnvio[];
  /**
   * Para cada trecho, o que acontece nele em palavras, com as pessoas escritas
   * como [[1]], [[2]]… (ver `acoesDosTrechos` em ./ancora.ts e `acaoDoTrecho`).
   */
  acoesPorTrecho?: Array<string | undefined>;
  /**
   * Instante (ms) em que o envio tem que ter acabado. Passado ele, o envio
   * para com `PreparoDemorou` e cancela o que já estava no motor — a rota
   * devolve os créditos em vez de ser cortada no meio pelo servidor.
   */
  prazo?: number;
  /**
   * O que mudar além (ou no lugar) da troca de pessoa, escrito pelo usuário
   * (ver ./modos.ts). Sem alvos, só ele vale.
   */
  edicao?: EdicaoTroca;
}): Promise<InputTroca> {
  const { maxTrecho } = MOTORES_TROCA[o.motor];
  const modelo =
    o.motor === "kling"
      ? MODELOS_KLING[o.qualidade ?? "pro"]
      : MOTORES_TROCA[o.motor].modelo;
  // Omni: os trechos vão para o Google; o fal guarda só o áudio e as imagens.
  const omni = o.motor === "omni" ? getOmni() : null;
  if (o.motor === "omni" && !omni)
    throw new Error("Gemini Omni não configurado no servidor (GEMINI_API_KEY).");
  return comPastaTemporaria(async (dir) => {
    let audioUrl: string | null = null;
    if (await temAudio(o.arquivo)) {
      const audio = path.join(dir, "audio.m4a");
      await extrairAudio(o.arquivo, audio);
      audioUrl = await enviar(o.fal, audio, "audio/mp4");
    }
    if (o.tomadas)
      return {
        motor: o.motor,
        modelo,
        segmentos: await enviarTomadas(
          { ...o, tomadas: o.tomadas },
          modelo,
          maxTrecho,
          dir,
        ),
        audioUrl,
      };
    const ancoraUrl =
      o.ancora && o.motor !== "seedance"
        ? await o.fal.storage.upload(
            new Blob([new Uint8Array(o.ancora)], { type: "image/jpeg" }),
          )
        : null;
    // A mesma imagem vai em vários trechos: baixa e reduz uma vez só.
    const imagensOmni = new Map<string, Promise<ReferenciaInline>>();
    const imagemOmni = (url: string) => {
      if (!imagensOmni.has(url)) imagensOmni.set(url, imagemParaOmni(url));
      return imagensOmni.get(url)!;
    };
    const segmentos = await enviarPartes(
      {
        cancelar: (requestId) =>
          omni
            ? cancelarOmni(omni, requestId)
            : o.fal.queue.cancel(modelo, { requestId }),
        prazo: o.prazo,
      },
      o.trechos ?? trechosTroca(o.info.duracao, maxTrecho),
      async (t, i, c) => {
        const seg = path.join(dir, `seg-${i}.mp4`);
        await prepararTrechoTroca(o.arquivo, t.inicio, t.duracao, seg, o.info);
        c.conferir();
        const entrada: EntradaTrecho = {
          duracao: t.duracao,
          removerTexto: o.removerTexto,
          estilo: o.estilo,
          roupa: o.roupa,
          edicao: o.edicao,
          acao: acaoDoTrecho(
            o.acoesPorTrecho?.[i],
            o.alvosPorTrecho?.[i],
            o.alvos.length,
            o.motor,
          ),
          ancoraUrl,
          outras: o.outras,
          ...alvosDoTrecho(
            o.alvos,
            o.alvosPorTrecho?.[i],
            ancoraUrl ? o.naAncora : undefined,
          ),
        };
        if (omni) {
          const { pedido, imagens } = entradaOmni(entrada);
          const id = await enviarTrechoOmni(omni, {
            arquivo: seg,
            imagens: await Promise.all(imagens.map(imagemOmni)),
            pedido,
            conferir: c.conferir,
          });
          c.naFila(id);
          return { requestId: id, inicio: t.inicio, duracao: t.duracao };
        }
        const videoUrl = await enviar(o.fal, seg, "video/mp4");
        c.conferir();
        const { request_id } = await o.fal.queue.submit(modelo, {
          input: inputMotor(o.motor, { ...entrada, videoUrl }),
          webhookUrl: webhookUrl(o.jobId),
        });
        c.naFila(request_id);
        return { requestId: request_id, inicio: t.inicio, duracao: t.duracao };
      },
    );
    return { motor: o.motor, modelo, segmentos, audioUrl };
  });
}

export function estadoTroca(
  fal: FalClient,
  input: InputTroca,
): Promise<EstadoLote> {
  // Acompanha no modelo em que o job foi enviado (jobs antigos do Kling, sem modelo: o O1 standard).
  const motor = input.motor ?? "kling";
  if (motor === "omni") {
    const omni = getOmni();
    return omni
      ? estadoLoteOmni(omni, input.segmentos)
      : Promise.resolve({
          estado: "erro",
          mensagem: "Gemini Omni não configurado no servidor (GEMINI_API_KEY).",
        });
  }
  const modelo =
    input.modelo ??
    (motor === "kling" ? MODELOS_ANTIGOS[0] : MOTORES_TROCA[motor].modelo);
  return estadoLote(fal, modelo, input.segmentos);
}

/** Junta os trechos gerados, devolve o áudio original e salva no S3. */
export async function comporTroca(o: {
  s3: S3Client;
  userId: string;
  input: InputTroca;
  urls: string[];
}): Promise<{ key: string; size: number }> {
  return comPastaTemporaria(async (dir) => {
    let audio: string | null = null;
    if (o.input.audioUrl) {
      const res = await fetch(o.input.audioUrl);
      if (res.ok) {
        audio = path.join(dir, "audio.m4a");
        await (
          await import("node:fs/promises")
        ).writeFile(audio, Buffer.from(await res.arrayBuffer()));
      } else
        console.warn(
          "[troca] áudio original indisponível (HTTP",
          res.status,
          ") — vídeo sai sem som",
        );
    }
    const saida = path.join(dir, "final.mp4");
    const duracoes = o.input.segmentos.map((g) => g.duracao);
    // Omni: os trechos só saem com a chave ("omni:…"), não por URL aberta.
    const omni = o.input.motor === "omni" ? getOmni() : null;
    if (o.input.motor === "omni" && !omni)
      throw new Error("Gemini Omni não configurado no servidor (GEMINI_API_KEY).");
    // Todos os trechos saíram do motor: tenta emendar sem recodificar (o 4K só
    // cabe assim). Com trechos do original no meio (`urlPronta`) o formato muda.
    const emendou =
      !omni &&
      !o.input.segmentos.some((g) => g.urlPronta) &&
      (await emendarTrechos({ urls: o.urls, duracoes, audio, saida }));
    if (!emendou)
      await juntarTrechos({
        trechos: omni
          ? await baixarTrechosOmni(omni, o.urls, dir)
          : await baixarTrechos(o.urls, dir, "troca"),
        duracoes,
        audio,
        saida,
      });
    const key = newKey(o.userId, "videos", "video/mp4");
    const size = await uploadFromFile(o.s3, key, saida, "video/mp4");
    return { key, size };
  });
}

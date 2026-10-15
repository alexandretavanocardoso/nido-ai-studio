import { pedidoDoEstilo, type EstiloTroca } from "./estilos";
import path from "node:path";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { GoogleGenAI, ThinkingLevel, type ContentListUnion } from "@google/genai";
import {
  generateImage,
  proporcaoMaisProxima,
  shrinkReferencia,
} from "@/lib/ai/gemini";
import {
  ehCoisa,
  nomeDoTipo,
  promptEditarQuadro,
  promptTrocaImagem,
  type RoupaTroca,
  type TipoAlvo,
} from "@/lib/prompts/trocar-imagem";
import {
  extrairQuadro,
  extrairQuadroMarcado,
  type VideoInfo,
} from "./ffmpeg";
import { marcarPonto } from "./pessoas";

/**
 * Quadro-âncora da troca de pessoa em vídeo.
 *
 * O Kling processa o vídeo em trechos de até 15s, cada um sozinho — sem um
 * guia comum, o rosto, o chapéu e a roupa do personagem mudam de um trecho
 * para o outro, e as OUTRAS pessoas do vídeo são redesenhadas (ou somem).
 * Aqui a troca é feita primeiro num único quadro do vídeo (Nano Banana, que
 * mexe só em quem deve) e esse quadro vai como referência para TODOS os
 * trechos: "é assim que o resultado tem que ficar".
 *
 * Tudo aqui é melhor-esforço: sem Gemini, ou se algo falhar, a troca segue
 * sem âncora (como era antes).
 */
/** Tempo máximo esperando o quadro-âncora (a rota tem 300s no total). */
const LIMITE_MS = 90_000;
/** Teto com várias pessoas (cada uma soma 45s): a rota tem 300s para tudo. */
const LIMITE_MAX_MS = 180_000;
/** Tempo máximo para os quadros-âncora de TODAS as tomadas de um vídeo de cortes. */
const LIMITE_TOMADAS_MS = 150_000;
const MODELO_VISAO =
  process.env.GEMINI_TEXT_MODEL?.trim() || "gemini-flash-latest";
/**
 * Decisões que, erradas, estragam o vídeo inteiro (qual quadro vira âncora, se
 * a passada trocou a pessoa certa) vão a um modelo mais forte. Igual ao
 * MODELO_VISAO desliga: tudo vai ao de visão, como era antes.
 */
const MODELO_JUIZ =
  process.env.GEMINI_TEXT_MODEL_PRO?.trim() || "gemini-4-argon";
/** Quanto esperar o modelo forte antes de fazer a mesma pergunta ao de visão. */
const LIMITE_JUIZ_MS = 30_000;
/** Com menos tempo que isso até o prazo, pergunta direto ao de visão. */
const MINIMO_JUIZ_MS = 8_000;
/** O que cada quadro marcado mostra: quem (ou o que) o usuário mandou trocar. */
const UM_ALVO = "one TARGET of a video (a person, an animal or an object)";

async function reduzido(quadro: Buffer): Promise<string> {
  return (
    await sharp(quadro)
      .resize(640, 640, { fit: "inside" })
      .jpeg({ quality: 80 })
      .toBuffer()
  ).toString("base64");
}

/**
 * Pergunta ao MODELO_JUIZ. Se ele falhar, responder vazio, demorar mais que
 * LIMITE_JUIZ_MS ou o `prazo` estiver perto, a mesma pergunta vai ao
 * MODELO_VISAO — a âncora nunca fica pior do que era só com ele.
 */
export async function perguntarAoJuiz(
  ai: GoogleGenAI,
  { contents, prazo = Infinity }: { contents: ContentListUnion; prazo?: number },
): Promise<string> {
  const limite = Math.min(LIMITE_JUIZ_MS, prazo - Date.now());
  if (MODELO_JUIZ !== MODELO_VISAO && limite >= MINIMO_JUIZ_MS) {
    const inicio = Date.now();
    try {
      const res = await ai.models.generateContent({
        model: MODELO_JUIZ,
        contents,
        config: {
          abortSignal: AbortSignal.timeout(limite),
          // Pensar pouco: a âncora tem prazo e a conferência pode se repetir.
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      if (res.text?.trim()) return res.text;
      console.warn(`[ancora] ${MODELO_JUIZ} respondeu vazio, perguntando ao ${MODELO_VISAO}`);
    } catch (e) {
      console.warn(
        `[ancora] ${MODELO_JUIZ} falhou em ${((Date.now() - inicio) / 1000).toFixed(1)}s, perguntando ao ${MODELO_VISAO}:`,
        (e as Error).message,
      );
    }
  }
  const res = await ai.models.generateContent({ model: MODELO_VISAO, contents });
  return res.text ?? "";
}

/**
 * Sem ninguém marcado: escolhe, entre alguns quadros, o que mostra melhor a
 * pessoa principal (rosto à mostra, sem ninguém na frente) e descreve essa
 * pessoa — a descrição evita que o modelo de vídeo troque a pessoa errada.
 */
export async function escolherQuadroPrincipal(
  quadros: Buffer[],
): Promise<{ indice: number; descricao: string | null }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || !quadros.length) return { indice: 0, descricao: null };
  try {
    const ai = new GoogleGenAI({ apiKey });
    const texto = await perguntarAoJuiz(ai, {
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                `These are ${quadros.length} frames of the same video, numbered 1 to ${quadros.length} in order. ` +
                "The MAIN person is the one who is the subject of the video (most central and present). " +
                "1) Pick the frame where the main person is shown most clearly: face fully visible and not covered by hands, " +
                "body visible, sharp, and NOT overlapped by anyone else. " +
                "2) Describe ONLY the main person so they can be told apart from anyone else who appears: clothing (colours and pieces), hair, build. " +
                'Answer with JSON only: {"frame": <number>, "person": "the ... (max 25 words, English)"}',
            },
            ...(await Promise.all(
              quadros.map(async (q) => ({
                inlineData: { mimeType: "image/jpeg", data: await reduzido(q) },
              })),
            )),
          ],
        },
      ],
    });
    const json = texto.match(/\{[\s\S]*\}/)?.[0];
    const r = json
      ? (JSON.parse(json) as { frame?: number; person?: string })
      : {};
    const indice =
      Number.isInteger(r.frame) && r.frame! >= 1 && r.frame! <= quadros.length
        ? r.frame! - 1
        : 0;
    const descricao =
      r.person
        ?.trim()
        .replace(/\s+/g, " ")
        .replace(/[."]+$/, "")
        .slice(0, 220) || null;
    return { indice, descricao };
  } catch (e) {
    console.warn(
      "[ancora] escolha do quadro falhou, usando o primeiro:",
      (e as Error).message,
    );
    return { indice: 0, descricao: null };
  }
}

/**
 * Mais de uma pessoa marcada: escolhe o quadro que serve de referência parada
 * (todo mundo nítido, ninguém na frente de ninguém) e diz quais alvos aparecem
 * bem nele. Um quadro com alguém passando borrado na frente faz a troca na
 * foto errar (personagens trocados entre si, gente sumindo) — e o erro é
 * copiado para o vídeo inteiro. Null se não der para decidir.
 */
export async function escolherQuadroDosAlvos(
  quadros: Buffer[],
  alvos: string[],
): Promise<{ indice: number; visiveis: number[] } | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || !quadros.length || !alvos.length) return null;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const texto = await perguntarAoJuiz(ai, {
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                `These are ${quadros.length} frames of the same video, numbered 1 to ${quadros.length}. ` +
                `Targets (people, animals or objects): ${alvos.map((a, i) => `${i + 1}) ${a}`).join("; ")}. ` +
                "Pick the ONE frame that works best as a clean still reference: every person and every target in it is sharp (no motion blur), " +
                "nobody overlaps, covers or is cut off by anybody else, and faces are visible. " +
                "Among clean frames, prefer the one that shows more of the targets. A clean frame with a single target is better than a frame with all targets where one is blurred or overlapping. " +
                'Answer with JSON only: {"frame": <number>, "targets": [<numbers of the targets that are sharp and fully recognisable in that frame>]}',
            },
            ...(await Promise.all(
              quadros.map(async (q) => ({
                inlineData: { mimeType: "image/jpeg", data: await reduzido(q) },
              })),
            )),
          ],
        },
      ],
    });
    const json = texto.match(/\{[\s\S]*\}/)?.[0];
    const r = json
      ? (JSON.parse(json) as { frame?: number; targets?: unknown })
      : {};
    if (
      !Number.isInteger(r.frame) ||
      r.frame! < 1 ||
      r.frame! > quadros.length
    )
      return null;
    const visiveis = [
      ...new Set(
        (Array.isArray(r.targets) ? r.targets : [])
          .filter(
            (n): n is number =>
              Number.isInteger(n) && n >= 1 && n <= alvos.length,
          )
          .map((n) => n - 1),
      ),
    ];
    return { indice: r.frame! - 1, visiveis };
  } catch (e) {
    console.warn(
      "[ancora] escolha do quadro dos alvos falhou:",
      (e as Error).message,
    );
    return null;
  }
}

/**
 * Descreve as OUTRAS pessoas que aparecem em destaque no vídeo (quem passa na
 * frente, quem divide a cena) — o modelo de vídeo só as preserva se o pedido
 * disser quem são. `alvos` são as pessoas que serão trocadas (ficam de fora).
 */
export async function descreverOutrasPessoas(
  quadros: Buffer[],
  alvos: string[],
  /** Quadros em que o usuário marcou quem trocar (alvo vermelho em cima da pessoa). */
  marcados: Buffer[] = [],
): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || !quadros.length) return [];
  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: MODELO_VISAO,
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                (marcados.length
                  ? `The first ${marcados.length} image(s) each show, with a red target, a person, animal or object that WILL be replaced. Never list those, even when they look different in other frames (another angle, closer to the camera, blurred, partly cut off). After them come ${quadros.length} frames sampled along the same video. `
                  : `These are ${quadros.length} frames sampled along one video. `) +
                (alvos.length
                  ? `IGNORE these (they will be replaced): ${alvos.join("; ")}. `
                  : "IGNORE the main person (the subject of the video). ") +
                "List every OTHER person who appears prominently in any frame: anyone who passes in front of the camera, stands next to or interacts with the main person. " +
                "Do NOT list small or distant background people. For each one, a short description to recognise them: gender, hair, accessories, clothing colours, and how they appear. " +
                'Answer with JSON only: {"others": ["a woman with ...", ...]} — use {"others": []} if there is nobody else. Max 3 people, max 28 words each, English.',
            },
            ...(await Promise.all(
              [...marcados, ...quadros].map(async (q) => ({
                inlineData: { mimeType: "image/jpeg", data: await reduzido(q) },
              })),
            )),
          ],
        },
      ],
    });
    const json = (res.text ?? "").match(/\{[\s\S]*\}/)?.[0];
    const r = json ? (JSON.parse(json) as { others?: unknown }) : {};
    return (Array.isArray(r.others) ? r.others : [])
      .filter((x): x is string => typeof x === "string" && x.trim().length > 8)
      .map((x) =>
        x
          .trim()
          .replace(/\s+/g, " ")
          .replace(/[."]+$/, "")
          .slice(0, 240),
      )
      .slice(0, 3);
  } catch (e) {
    console.warn(
      "[ancora] descrição das outras pessoas falhou:",
      (e as Error).message,
    );
    return [];
  }
}

/** Quem aparece em cada quadro amostrado do vídeo (índices da lista de alvos). */
export interface LinhaDoTempo {
  /** Instante (s) de cada quadro amostrado, em ordem. */
  instantes: number[];
  /** Para cada quadro, os alvos visíveis nele. */
  visiveis: number[][];
}

/**
 * Linha do tempo das pessoas marcadas: ~1 quadro por segundo, e em cada um
 * quais delas aparecem. Serve para (1) começar um trecho novo no momento em
 * que alguém ENTRA em cena — o motor só troca bem quem já está na tela quando
 * o trecho começa — e (2) mandar a cada trecho só os personagens de quem
 * aparece nele. Null se a leitura falhar (o vídeo segue dividido como antes).
 */
export async function linhaDoTempoDosAlvos(o: {
  arquivo: string;
  dir: string;
  duracao: number;
  marcadas: Array<{ t: number; x: number; y: number }>;
  descricoes: string[];
}): Promise<LinhaDoTempo | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || !o.descricoes.length || o.duracao < 4) return null;
  try {
    const quantos = Math.min(30, Math.max(4, Math.round(o.duracao)));
    const instantes = Array.from(
      { length: quantos },
      (_, k) =>
        Math.round(
          Math.min(o.duracao - 0.1, ((k + 0.5) * o.duracao) / quantos) * 100,
        ) / 100,
    );
    const [marcados, quadros] = await Promise.all([
      Promise.all(
        o.marcadas.map(async (m, i) => {
          const saida = path.join(o.dir, `linha-marcada-${i}.jpg`);
          await extrairQuadroMarcado(
            o.arquivo,
            Math.min(m.t, o.duracao - 0.1),
            saida,
          );
          return {
            inlineData: {
              mimeType: "image/jpeg",
              data: await reduzido(await marcarPonto(await readFile(saida), m)),
            },
          };
        }),
      ),
      Promise.all(
        instantes.map(async (t, k) => {
          const saida = path.join(o.dir, `linha-${k}.jpg`);
          await extrairQuadro(o.arquivo, t, saida);
          return {
            inlineData: {
              mimeType: "image/jpeg",
              data: await reduzido(await readFile(saida)),
            },
          };
        }),
      ),
    ]);
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: MODELO_VISAO,
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                `The first ${marcados.length} image(s) each show, with a red target, ${UM_ALVO}, numbered in order: ${o.descricoes.map((d, i) => `${i + 1}) ${d}`).join("; ")}. ` +
                `After them come ${quantos} frames of that video in chronological order, numbered 1 to ${quantos}. ` +
                "For EACH frame, list which targets are visible in it. Count a target as visible when seen from behind, lying down, partly cut off, blurred or far away, as long as it is that same person, animal or object. Do not count a different one that merely looks similar. " +
                `Answer with JSON only, one entry per frame: {"frames": [{"n": 1, "present": [<target numbers>]}, ...]}`,
            },
            ...marcados,
            ...quadros,
          ],
        },
      ],
    });
    const json = (res.text ?? "").match(/\{[\s\S]*\}/)?.[0];
    const r = json ? (JSON.parse(json) as { frames?: unknown }) : {};
    const lidos = new Map<number, number[]>();
    for (const f of Array.isArray(r.frames) ? r.frames : []) {
      const { n, present } = (f ?? {}) as { n?: unknown; present?: unknown };
      if (!Number.isInteger(n) || !Array.isArray(present)) continue;
      lidos.set(
        (n as number) - 1,
        [
          ...new Set(
            present
              .filter(
                (x): x is number =>
                  Number.isInteger(x) && x >= 1 && x <= o.descricoes.length,
              )
              .map((x) => x - 1),
          ),
        ].sort((a, b) => a - b),
      );
    }
    // Resposta pela metade não serve: um quadro sem leitura viraria "ninguém em cena".
    if (lidos.size < quantos) return null;
    return { instantes, visiveis: instantes.map((_, k) => lidos.get(k)!) };
  } catch (e) {
    console.warn(
      "[ancora] linha do tempo das pessoas falhou (vídeo dividido só pelas viradas):",
      (e as Error).message,
    );
    return null;
  }
}

/** Roda `fn` em todos os itens, no máximo `n` ao mesmo tempo (mantém a ordem). */
async function emLotes<T, R>(
  itens: T[],
  n: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const saida = new Array<R>(itens.length);
  let proximo = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, itens.length) }, async () => {
      for (let i = proximo++; i < itens.length; i = proximo++)
        saida[i] = await fn(itens[i], i);
    }),
  );
  return saida;
}

/** Uma tomada pronta para ir sozinha ao motor (ver `prepararTomadas`). */
export interface TomadaPreparada {
  inicio: number;
  duracao: number;
  /** Quem aparece nela (índices da lista de alvos). Vazio: ninguém — fica como no original. */
  presentes: number[];
  /** Como cada um aparece NESTA tomada (mesma ordem de `presentes`). */
  descricoes: string[];
  /** Quadro do meio da tomada com a troca feita (null se a geração falhou). */
  ancora: Buffer | null;
  /** Posições (em `presentes`) de quem aparece trocado na âncora. */
  naAncora: number[];
  /** O que acontece na tomada, com as pessoas como [[1]], [[2]]… (numeração geral). */
  acao?: string;
}

/**
 * Quem aparece num quadro de OUTRA tomada e como aparece ali. A descrição feita
 * no quadro em que o usuário marcou não serve para as outras tomadas: a pessoa
 * pode estar de costas, longe, sem a peruca — e o motor não a reconhece.
 * Null se a leitura falhar.
 */
async function alvosNoQuadro(
  ai: GoogleGenAI,
  quadro: Buffer,
  marcados: Array<{ inlineData: { mimeType: string; data: string } }>,
  alvos: Array<{ d: string; i: number }>,
): Promise<Array<{ i: number; descricao: string }> | null> {
  try {
    const res = await ai.models.generateContent({
      model: MODELO_VISAO,
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                (marcados.length
                  ? `The first ${marcados.length} image(s) each show, with a red target, ${UM_ALVO}. `
                  : "") +
                `Targets: ${alvos.map((a) => `${a.i + 1}) ${a.d}`).join("; ")}. ` +
                "The last image is a frame from a shot of the same video. The targets may look different there (seen from behind, far away, hair or accessories changed, motion blur). " +
                "For each target that appears in the last image, describe how to find them IN THAT FRAME: where they are (left/right/centre, foreground/background), how much of them is in the frame (only the back of the head, only the legs, full body), whether seen from the front, side or behind, and their clothing and hair as they look there (for an animal or object: what it is and its colours). " +
                'Answer with JSON only: {"targets": [{"n": <target number>, "description": "the ... (max 32 words, English)"}]} — leave out targets that are not in the last image.',
            },
            ...marcados,
            {
              inlineData: { mimeType: "image/jpeg", data: await reduzido(quadro) },
            },
          ],
        },
      ],
    });
    const json = (res.text ?? "").match(/\{[\s\S]*\}/)?.[0];
    if (!json) return null;
    const r = JSON.parse(json) as { targets?: unknown };
    const vistos = new Map<number, string>();
    for (const t of Array.isArray(r.targets) ? r.targets : []) {
      const { n, description } = (t ?? {}) as {
        n?: unknown;
        description?: unknown;
      };
      if (
        Number.isInteger(n) &&
        typeof description === "string" &&
        description.trim().length > 8 &&
        alvos.some((a) => a.i === (n as number) - 1)
      )
        vistos.set(
          (n as number) - 1,
          description.trim().replace(/\s+/g, " ").replace(/[."]+$/, "").slice(0, 220),
        );
    }
    return [...vistos]
      .sort((a, b) => a[0] - b[0])
      .map(([i, descricao]) => ({ i, descricao }));
  } catch (e) {
    console.warn("[ancora] leitura da tomada falhou:", (e as Error).message);
    return null;
  }
}

/**
 * Prepara cada tomada de um vídeo de cortes rápidos para ir sozinha ao motor:
 * quem aparece nela e como, o que acontece nela e um quadro-âncora próprio.
 * Mandar várias tomadas juntas faz o motor trocar a primeira e se perder nas
 * seguintes; com âncora e descrição da própria tomada, ele mantém o
 * enquadramento e acha as pessoas (testado no Kling).
 * Tomada cuja leitura falha segue com todos os alvos e a descrição geral.
 */
export async function prepararTomadas(o: {
  arquivo: string;
  dir: string;
  info: VideoInfo;
  tomadas: Array<{ inicio: number; duracao: number }>;
  marcadas?: Array<{ t: number; x?: number; y?: number }>;
  /** Descrição geral de cada alvo (a do quadro em que foi marcado). */
  descricoes: Array<string | undefined>;
  /** Pessoa, animal ou objeto, por alvo (ausente: pessoa). */
  tipos?: Array<TipoAlvo | undefined>;
  personagens: Buffer[];
  /** Quem entra no lugar de cada alvo (ver `trocarNoQuadro`). */
  quem?: string[];
  estilo?: Parameters<typeof pedidoDoEstilo>[0];
  roupa?: RoupaTroca;
}): Promise<TomadaPreparada[]> {
  const alvos = o.descricoes
    .map((d, i) => ({ d, i }))
    .filter((a): a is { d: string; i: number } => !!a.d);
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const semLeitura = (t: { inicio: number; duracao: number }): TomadaPreparada => ({
    ...t,
    presentes: alvos.map((a) => a.i),
    descricoes: alvos.map((a) => a.d),
    ancora: null,
    naAncora: [],
  });
  if (!apiKey || !alvos.length) return o.tomadas.map(semLeitura);
  const ai = new GoogleGenAI({ apiKey });
  const [marcados, acoes] = await Promise.all([
    Promise.all(
      (o.marcadas ?? [])
        .filter(
          (m): m is { t: number; x: number; y: number } =>
            m.x !== undefined && m.y !== undefined,
        )
        .map(async (m, i) => {
          const saida = path.join(o.dir, `tomada-marcada-${i}.jpg`);
          await extrairQuadroMarcado(
            o.arquivo,
            Math.min(m.t, o.info.duracao - 0.1),
            saida,
          );
          return {
            inlineData: {
              mimeType: "image/jpeg",
              data: await reduzido(await marcarPonto(await readFile(saida), m)),
            },
          };
        }),
    ).catch(() => []),
    acoesDosTrechos({
      arquivo: o.arquivo,
      dir: o.dir,
      duracao: o.info.duracao,
      trechos: o.tomadas,
      viradas: [],
      marcadas: o.marcadas,
      descricoes: o.descricoes,
    }),
  ]);
  // Poucas por vez: cada tomada faz até uma geração de imagem por pessoa.
  // Um prazo só para todas: passado ele, as tomadas que faltam seguem sem âncora
  // (a rota não pode estourar o tempo — aí o envio inteiro se perde).
  const prazo = Date.now() + LIMITE_TOMADAS_MS;
  return emLotes(o.tomadas, 6, async (t, k) => {
    try {
      const saida = path.join(o.dir, `tomada-${k}.jpg`);
      await extrairQuadro(
        o.arquivo,
        Math.min(o.info.duracao - 0.05, t.inicio + t.duracao / 2),
        saida,
      );
      const quadro = await readFile(saida);
      const vistos = await alvosNoQuadro(ai, quadro, marcados, alvos);
      if (!vistos) return { ...semLeitura(t), acao: acoes[k] };
      if (!vistos.length)
        return { ...t, presentes: [], descricoes: [], ancora: null, naAncora: [] };
      const presentes = vistos.map((v) => v.i);
      const porAlvo: Array<string | undefined> = o.descricoes.map(() => undefined);
      for (const v of vistos) porAlvo[v.i] = v.descricao;
      const { imagem, feitos } = await trocarNoQuadro({
        quadro,
        alvos: presentes,
        descricoes: porAlvo,
        tipos: o.tipos,
        personagens: o.personagens,
        quem: o.quem,
        info: o.info,
        estilo: o.estilo,
        roupa: o.roupa,
        prazo,
        tentativas: 2,
      });
      return {
        ...t,
        presentes,
        descricoes: vistos.map((v) => v.descricao),
        ancora: imagem,
        naAncora: imagem ? feitos.map((n) => presentes.indexOf(n)) : [],
        acao: acoes[k],
      };
    } catch (e) {
      console.warn(
        `[ancora] preparação da tomada ${k + 1} falhou (segue com a descrição geral):`,
        (e as Error).message,
      );
      return { ...semLeitura(t), acao: acoes[k] };
    }
  });
}

/**
 * O que as pessoas a trocar FAZEM em cada trecho, em uma ou duas frases — vai
 * no pedido ao motor. Só com "siga o movimento", gestos rápidos e borrados
 * (um tapa, um soco, uma queda) somem do resultado ou a pessoa volta a ser a
 * original depois deles; com a ação escrita, o motor a reproduz.
 * As pessoas saem como [[1]], [[2]]… (a ordem dos alvos). Trecho sem leitura
 * fica sem ação (`undefined`) e segue como antes.
 */
export async function acoesDosTrechos(o: {
  arquivo: string;
  dir: string;
  duracao: number;
  trechos: Array<{ inicio: number; duracao: number }>;
  /** Movimentos bruscos e cortes: ganham quadros extras em volta, pra IA ver o gesto. */
  viradas: Array<{ t: number; forca: number }>;
  marcadas?: Array<{ t: number; x?: number; y?: number }>;
  descricoes: Array<string | undefined>;
}): Promise<Array<string | undefined>> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const alvos = o.descricoes
    .map((d, i) => ({ d, i }))
    .filter((a): a is { d: string; i: number } => !!a.d);
  if (!apiKey || !alvos.length) return o.trechos.map(() => undefined);
  try {
    const marcados = await Promise.all(
      (o.marcadas ?? [])
        .filter(
          (m): m is { t: number; x: number; y: number } =>
            m.x !== undefined && m.y !== undefined,
        )
        .map(async (m, i) => {
          const saida = path.join(o.dir, `acao-marcada-${i}.jpg`);
          await extrairQuadroMarcado(
            o.arquivo,
            Math.min(m.t, o.duracao - 0.1),
            saida,
          );
          return {
            inlineData: {
              mimeType: "image/jpeg",
              data: await reduzido(await marcarPonto(await readFile(saida), m)),
            },
          };
        }),
    );
    const ai = new GoogleGenAI({ apiKey });
    return await Promise.all(
      o.trechos.map(async (t, n) => {
        try {
          const fim = t.inicio + t.duracao;
          // Quadros espalhados pelo trecho + três em volta de cada movimento
          // brusco (os 3 mais fortes): um gesto de 0,3 s não cai entre dois quadros.
          const espalhados = Array.from(
            { length: 6 },
            (_, k) => t.inicio + ((k + 0.5) * t.duracao) / 6,
          );
          const emVolta = o.viradas
            .filter((v) => v.t > t.inicio + 0.2 && v.t < fim - 0.2)
            .sort((a, b) => b.forca - a.forca)
            .slice(0, 3)
            .flatMap((v) => [v.t - 0.2, v.t, v.t + 0.25]);
          const instantes = [...new Set([...espalhados, ...emVolta])]
            .map((x) =>
              Math.round(Math.min(o.duracao - 0.1, Math.max(0.05, x)) * 100) /
              100,
            )
            .sort((a, b) => a - b);
          const quadros = await Promise.all(
            instantes.map(async (x, k) => {
              const saida = path.join(o.dir, `acao-${n}-${k}.jpg`);
              await extrairQuadro(o.arquivo, x, saida);
              return {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: await reduzido(await readFile(saida)),
                },
              };
            }),
          );
          const res = await ai.models.generateContent({
            model: MODELO_VISAO,
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text:
                      (marcados.length
                        ? `The first ${marcados.length} image(s) each show, with a red target, ${UM_ALVO}. `
                        : "") +
                      `Targets: ${alvos.map((a) => `[[${a.i + 1}]] = ${a.d}`).join("; ")}. ` +
                      `Then come ${instantes.length} frames of ONE part of that video, in order, taken at these seconds of the part: ${instantes.map((x) => (x - t.inicio).toFixed(1)).join(", ")} (the part lasts ${t.duracao.toFixed(1)} s). ` +
                      "Describe what the targets DO in this part, in order, in at most 45 words: body actions only (stands up, swings an arm and slaps, falls backwards, walks away, hugs, jumps), who does it to whom, and roughly when (at the start, about halfway, at the end). " +
                      "Give most of the words to fast or decisive actions — a hit, a fall, a throw — even when they last a fraction of a second. Write only what you can see in the frames; do not guess what happens between them, and do not describe clothes, faces or the place. " +
                      'Always call the targets [[1]], [[2]] (never by description). Answer with JSON only: {"action": "..."} — use {"action": ""} if the targets barely move.',
                  },
                  ...marcados,
                  ...quadros,
                ],
              },
            ],
          });
          const json = (res.text ?? "").match(/\{[\s\S]*\}/)?.[0];
          const r = json ? (JSON.parse(json) as { action?: unknown }) : {};
          const acao =
            typeof r.action === "string"
              ? r.action.trim().replace(/\s+/g, " ").slice(0, 320)
              : "";
          return acao.length > 12 ? acao : undefined;
        } catch (e) {
          console.warn(
            `[ancora] não deu para descrever a ação do trecho ${n + 1} (segue sem):`,
            (e as Error).message,
          );
          return undefined;
        }
      }),
    );
  } catch (e) {
    console.warn(
      "[ancora] descrição das ações falhou (seguem sem):",
      (e as Error).message,
    );
    return o.trechos.map(() => undefined);
  }
}

/** Instantes para procurar outras pessoas: ~1 quadro por segundo, no máximo 16. */
export function instantesVarredura(duracao: number): number[] {
  const n = Math.min(16, Math.max(4, Math.round(duracao)));
  return Array.from(
    { length: n },
    (_, i) =>
      Math.round(Math.min(duracao - 0.1, ((i + 0.5) * duracao) / n) * 100) /
      100,
  );
}

/** Instantes candidatos a quadro-âncora (evita o primeiríssimo quadro e o fim). */
export function instantesCandidatos(duracao: number): number[] {
  const t = [0.08, 0.25, 0.45, 0.65].map(
    (f) =>
      Math.round(Math.max(0.3, Math.min(duracao - 0.2, duracao * f)) * 100) /
      100,
  );
  return [...new Set(t)];
}

/**
 * Confere uma passada do quadro-âncora: a pessoa pedida virou o personagem e
 * ninguém mais mudou? O motor de vídeo copia a âncora em todos os quadros —
 * uma passada que troca a pessoa errada (ou mistura dois personagens) estraga
 * o vídeo inteiro. Sem chave, ou se a leitura falhar, aceita (como era antes).
 */
export async function passadaConfere(o: {
  antes: Buffer;
  depois: Buffer;
  personagem: Buffer;
  descricao: string;
  /** "foto": a roupa continua a do quadro original — não é sinal de troca falha. */
  roupa?: RoupaTroca;
  /** Ausente: pessoa. */
  tipo?: TipoAlvo;
  /**
   * Quantas vezes o personagem pode aparecer no resultado (padrão 1). Mais de
   * uma quando a mesma imagem entra no lugar de vários alvos e um deles já foi
   * trocado numa passada anterior.
   */
  esperados?: number;
  /** Instante (ms) em que a âncora tem que ter acabado: perto dele, vai direto ao modelo de visão. */
  prazo?: number;
}): Promise<boolean> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return true;
  const resposta =
    'Answer with JSON only: {"target_replaced": true|false, "others_changed": true|false, "character_count": <number>}. ';
  const nome = nomeDoTipo(o.tipo);
  try {
    const texto = await perguntarAoJuiz(new GoogleGenAI({ apiKey }), {
      prazo: o.prazo,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: ehCoisa(o.tipo)
                ? `Image 1 is a frame of a video. Image 2 is an edit of image 1 in which exactly ONE ${nome} should have been replaced by the ${nome} shown in image 3; ` +
                  `it is: ${o.descricao}. Every person and everything else must still be the same as in image 1 (small differences in pose or sharpness do not count). ` +
                  resposta +
                  `target_replaced: in image 2 it is gone and the ${nome} of image 3 (its shape, colours and details) stands in its place. ` +
                  "others_changed: some person, or some OTHER animal or object, is no longer the same as in image 1. A small change (pose, sharpness, one small detail) does not count. " +
                  `character_count: how many copies of the ${nome} of image 3 appear in image 2.`
                : "Image 1 is a frame of a video. Image 2 is an edit of image 1 in which exactly ONE person should have been replaced by the character shown in image 3; " +
                  `that person is: ${o.descricao}. Everyone else must still be the same people as in image 1 (small differences in pose or sharpness do not count). ` +
                  resposta +
                  (o.roupa === "foto"
                    ? "target_replaced: in image 2 that person now has the head of the character of image 3 (its face, hair or headwear, skin tone). They are expected to keep their own body and clothes from image 1 — that is correct, not a failure. "
                    : "target_replaced: in image 2 that person is gone and the character of image 3 (its face, hair or headwear and outfit) stands in their place. ") +
                  "others_changed: some OTHER person is no longer the same person or character as in image 1 — a different head, face, hair or headwear, or a different outfit. A small change (pose, sharpness, the colour of one small garment detail) does not count. " +
                  "character_count: how many people in image 2 look like, or wear distinctive items of, the character of image 3.",
            },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: await reduzido(o.antes),
              },
            },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: await reduzido(o.depois),
              },
            },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: await reduzido(o.personagem),
              },
            },
          ],
        },
      ],
    });
    const json = texto.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return true;
    const r = JSON.parse(json) as {
      target_replaced?: unknown;
      others_changed?: unknown;
      character_count?: unknown;
    };
    const ok =
      r.target_replaced !== false &&
      r.others_changed !== true &&
      (typeof r.character_count !== "number" ||
        (r.character_count >= 1 && r.character_count <= (o.esperados ?? 1)));
    if (!ok) console.warn("[ancora] conferência reprovou a passada:", json);
    return ok;
  } catch (e) {
    console.warn(
      "[ancora] conferência da passada falhou:",
      (e as Error).message,
    );
    return true;
  }
}

/**
 * O pedido escrito pelo usuário, em inglês: os motores e o resto do pedido
 * estão em inglês. Sem Gemini, ou se falhar, segue como foi escrito.
 */
export async function pedidoEmIngles(texto: string): Promise<string> {
  const limpo = texto.trim().replace(/\s+/g, " ");
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || !limpo) return limpo;
  try {
    const res = await new GoogleGenAI({ apiKey }).models.generateContent({
      model: MODELO_VISAO,
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "Translate this video-editing request into English. Keep its exact meaning, names and details; add nothing. Answer with the translation only, in one line.\n\n" +
                limpo,
            },
          ],
        },
      ],
    });
    const t = (res.text ?? "").trim().replace(/\s+/g, " ");
    return t.length > 2 ? t.slice(0, 450) : limpo;
  } catch (e) {
    console.warn(
      "[ancora] tradução do pedido falhou (vai como foi escrito):",
      (e as Error).message,
    );
    return limpo;
  }
}

/**
 * Aplica o pedido escrito num quadro (Nano Banana): o lugar novo (`cena`) ou
 * só um detalhe. Null se falhar ou demorar demais.
 */
export async function editarQuadro(o: {
  quadro: Buffer;
  info: VideoInfo;
  cena: boolean;
  /** Já em inglês. */
  pedido: string;
  estilo?: EstiloTroca;
}): Promise<Buffer | null> {
  const base = await sharp(o.quadro)
    .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  const geracao = generateImage({
    prompt: promptEditarQuadro({
      cena: o.cena,
      pedido: o.pedido,
      estilo: pedidoDoEstilo(o.estilo),
    }),
    referencias: [{ mimeType: "image/jpeg", data: base.toString("base64") }],
    aspectRatio: proporcaoMaisProxima(o.info.largura, o.info.altura),
    imageSize: "1K",
    qualidade: "padrao",
  }).catch((e) => {
    console.warn("[ancora] edição do quadro falhou:", (e as Error).message);
    return null;
  });
  return Promise.race([
    geracao,
    new Promise<null>((ok) => setTimeout(() => ok(null), LIMITE_MS)),
  ]);
}

/**
 * Quadro-guia quando ninguém é trocado (só a cena, ou só um detalhe): um
 * quadro do começo do vídeo com o pedido já aplicado. Sem ele cada trecho do
 * Kling inventa o seu fundo. Null se não der (a troca segue sem guia).
 */
export async function quadroDoPedido(o: {
  arquivo: string;
  dir: string;
  info: VideoInfo;
  cena: boolean;
  /** Já em inglês. */
  pedido: string;
  estilo?: EstiloTroca;
}): Promise<Buffer | null> {
  try {
    const candidatos = instantesCandidatos(o.info.duracao);
    const saida = path.join(o.dir, "pedido-quadro.jpg");
    await extrairQuadro(o.arquivo, candidatos[1] ?? candidatos[0], saida);
    return await editarQuadro({ ...o, quadro: await readFile(saida) });
  } catch (e) {
    console.warn(
      "[ancora] sem quadro-guia do pedido (segue sem ele):",
      (e as Error).message,
    );
    return null;
  }
}

/** Lado do quadro em que o usuário clicou (fração 0–1), em palavras. */
function ladoDoClique(x: number): string {
  return x < 0.36
    ? "on the left side of the frame"
    : x > 0.64
      ? "on the right side of the frame"
      : "in the centre of the frame";
}

/**
 * Faz a troca num quadro parado: uma pessoa por vez, cada passada em cima do
 * resultado da anterior. Com todas no mesmo pedido, a segunda costuma sair
 * "colada" (pose e luz da imagem de referência, de pé e de frente) — e o vídeo
 * inteiro copia isso. Devolve o quadro e quais alvos (índices) entraram nele.
 */
export async function trocarNoQuadro(o: {
  quadro: Buffer;
  /** Índices dos alvos a trocar neste quadro. */
  alvos: number[];
  descricoes: Array<string | undefined>;
  /** Pessoa, animal ou objeto, por alvo (ausente: pessoa). */
  tipos?: Array<TipoAlvo | undefined>;
  personagens: Buffer[];
  /**
   * Quem entra no lugar de cada alvo (id do personagem): dois alvos com o
   * mesmo valor viram o mesmo personagem. Ausente: compara as imagens.
   */
  quem?: string[];
  info: VideoInfo;
  estilo?: Parameters<typeof pedidoDoEstilo>[0];
  /** Roupa de quem é trocado: do personagem (padrão) ou a do vídeo ("foto"). */
  roupa?: RoupaTroca;
  /** Onde cada alvo está NESTE quadro ("on the left side of the frame"), quando se sabe. */
  posicoes?: Array<string | undefined>;
  /** Instante (ms) em que tudo tem que ter acabado — quem chama divide o tempo da rota. */
  prazo?: number;
  /** Quantas vezes refazer a passada de um alvo que a conferência reprovou (padrão 3). */
  tentativas?: number;
}): Promise<{ imagem: Buffer | null; feitos: number[] }> {
  const original = await sharp(o.quadro)
    .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  // Cada alvo é uma geração (~20s) mais a conferência; sobra para refazer as que erram.
  const prazo = Math.min(
    o.prazo ?? Infinity,
    Date.now() + Math.min(LIMITE_MAX_MS, LIMITE_MS + 45_000 * (o.alvos.length - 1)),
  );
  let imagem: Buffer | null = null;
  const feitos: number[] = [];
  for (const n of o.alvos) {
    const descricao = o.descricoes[n];
    const base: Buffer = imagem
      ? await sharp(imagem).jpeg({ quality: 92 }).toBuffer()
      : original;
    // Passada que troca a pessoa errada (ou mexe em quem já foi trocado) é
    // refeita; se continuar errando, esse alvo fica fora da âncora.
    for (let tentativa = 0; tentativa < (o.tentativas ?? 3); tentativa++) {
      const restante = prazo - Date.now();
      if (restante <= 0) break;
      const geracao: Promise<Buffer | null> = generateImage({
        prompt: promptTrocaImagem({
          alvos: [
            {
              descricao:
                descricao && o.posicoes?.[n]
                  ? `${descricao}, ${o.posicoes[n]}`
                  : descricao,
              imagem: 2,
              tipo: o.tipos?.[n],
            },
          ],
          // Por padrão o personagem entra com o próprio look; com "foto", só a
          // cabeça e a pele mudam e a roupa do vídeo fica.
          roupa: o.roupa ?? "personagem",
          soCabeca: o.roupa === "foto",
          estilo: pedidoDoEstilo(o.estilo),
        }),
        referencias: [
          { mimeType: "image/jpeg", data: base.toString("base64") },
          await shrinkReferencia(o.personagens[n]),
        ],
        aspectRatio: proporcaoMaisProxima(o.info.largura, o.info.altura),
        imageSize: "1K",
        qualidade: "padrao",
      }).catch((e) => {
        console.warn(
          "[ancora] passada da âncora falhou:",
          (e as Error).message,
        );
        return null;
      });
      // O Nano Banana às vezes demora: passado o limite, segue com o que já tem.
      const passada: Buffer | null = await Promise.race([
        geracao,
        new Promise<null>((ok) => setTimeout(() => ok(null), restante)),
      ]);
      if (!passada) break;
      if (
        descricao &&
        !(await passadaConfere({
          antes: base,
          depois: passada,
          personagem: o.personagens[n],
          descricao,
          roupa: o.roupa,
          tipo: o.tipos?.[n],
          prazo,
          // O mesmo personagem para dois alvos: o que já foi trocado também conta.
          esperados:
            1 +
            feitos.filter((m) =>
              o.quem
                ? o.quem[m] === o.quem[n]
                : o.personagens[m].equals(o.personagens[n]),
            ).length,
        }))
      ) {
        console.warn(
          `[ancora] passada do alvo ${n + 1} trocou a pessoa errada ou mexeu em outra (tentativa ${tentativa + 1})`,
        );
        continue;
      }
      imagem = passada;
      feitos.push(n);
      break;
    }
    if (Date.now() >= prazo) break;
  }
  if (feitos.length < o.alvos.length)
    console.warn(
      `[ancora] quadro-âncora com ${feitos.length} de ${o.alvos.length} alvos (tempo ou falha)`,
    );
  return { imagem, feitos };
}

export interface Ancora {
  /** JPEG do quadro com a troca já feita (null = seguir sem âncora). */
  imagem: Buffer | null;
  /** Descrição de quem trocar, por alvo (preenche a pessoa principal quando ninguém foi marcado). */
  descricoes: Array<string | undefined>;
  /** Outras pessoas em destaque no vídeo (não podem ser alteradas). */
  outras: string[];
  /**
   * Índices dos alvos que aparecem trocados na âncora. Quando faltar algum, o
   * pedido ao motor precisa dizer isso: senão ele entende que só os da âncora
   * devem ser trocados e deixa os outros como estavam.
   */
  naAncora: number[];
}

export async function prepararAncora(o: {
  arquivo: string;
  dir: string;
  info: VideoInfo;
  /** Pessoas marcadas pelo usuário (instante do quadro em que cada uma foi marcada). */
  marcadas?: Array<{ t: number; x?: number; y?: number }>;
  /** Descrições já feitas das pessoas marcadas (mesma ordem dos alvos). */
  descricoes: Array<string | undefined>;
  /** Pessoa, animal ou objeto, por alvo (ausente: pessoa). */
  tipos?: Array<TipoAlvo | undefined>;
  /** Imagem do personagem de cada alvo (mesma ordem). */
  personagens: Buffer[];
  /** Quem entra no lugar de cada alvo (ver `trocarNoQuadro`). */
  quem?: string[];
  /** Estilo visual do vídeo: o quadro-guia já sai nele. */
  estilo?: EstiloTroca;
  /** Roupa de quem é trocado: do personagem (padrão) ou a do vídeo ("foto"). */
  roupa?: RoupaTroca;
  /** Lugar novo pedido pelo usuário (em inglês): o quadro-guia já sai nele. */
  cena?: string;
}): Promise<Ancora> {
  let descricoes = o.descricoes;
  // Em paralelo com o resto: quem mais aparece no vídeo (varre ~1 quadro por segundo).
  const varredura = (async () => {
    try {
      const quadros = await Promise.all(
        instantesVarredura(o.info.duracao).map(async (t, i) => {
          const saida = path.join(o.dir, `varredura-${i}.jpg`);
          await extrairQuadro(o.arquivo, t, saida);
          return readFile(saida);
        }),
      );
      return quadros;
    } catch {
      return [] as Buffer[];
    }
  })();
  // Quem o usuário marcou, com o alvo em cima: a lista de "outras pessoas"
  // (que o motor é proibido de mexer) não pode incluir essas.
  const marcados = (async () => {
    try {
      return await Promise.all(
        (o.marcadas ?? [])
          .filter(
            (m): m is { t: number; x: number; y: number } =>
              m.x !== undefined && m.y !== undefined,
          )
          .map(async (m, i) => {
            const saida = path.join(o.dir, `marcada-${i}.jpg`);
            await extrairQuadroMarcado(
              o.arquivo,
              Math.min(m.t, o.info.duracao - 0.1),
              saida,
            );
            return marcarPonto(await readFile(saida), m);
          }),
      );
    } catch {
      return [] as Buffer[];
    }
  })();
  const outrasDe = async (alvos: Array<string | undefined>) =>
    descreverOutrasPessoas(
      await varredura,
      alvos.filter((a): a is string => !!a),
      await marcados,
    );
  try {
    let quadro: Buffer;
    /** Alvos que entram no quadro-âncora (todos, salvo quando só alguns aparecem bem nele). */
    let naAncora = o.personagens.map((_, i) => i);
    /** Lado do quadro de cada alvo — só vale quando o quadro é o do próprio clique. */
    const posicoesDoClique = () =>
      o.marcadas?.map((m) =>
        m.x === undefined ? undefined : ladoDoClique(m.x),
      );
    let posicoes: Array<string | undefined> | undefined;
    const comDescricao = descricoes.filter((d): d is string => !!d);
    if (
      o.marcadas &&
      o.marcadas.length > 1 &&
      comDescricao.length === o.marcadas.length
    ) {
      // Várias pessoas marcadas: o instante de um clique pode ter outra pessoa
      // passando na frente. Procura um quadro limpo entre os cliques e o resto do vídeo.
      const instantes = [
        ...new Set([
          ...o.marcadas.map(
            (m) =>
              Math.round(
                Math.max(0.05, Math.min(m.t, o.info.duracao - 0.1)) * 100,
              ) / 100,
          ),
          ...instantesCandidatos(o.info.duracao),
        ]),
      ];
      const quadros = await Promise.all(
        instantes.map(async (t, i) => {
          const saida = path.join(o.dir, `ancora-cand-${i}.jpg`);
          await extrairQuadro(o.arquivo, t, saida);
          return readFile(saida);
        }),
      );
      // Todos marcados no mesmo instante: o usuário pausou num quadro em que
      // todos aparecem — é esse o quadro, com todos os alvos (o primeiro da
      // lista de instantes é o do clique).
      const mesmoInstante = o.marcadas.every(
        (m) => Math.abs(m.t - o.marcadas![0].t) < 0.05,
      );
      const escolha = mesmoInstante
        ? null
        : await escolherQuadroDosAlvos(quadros, comDescricao);
      quadro = quadros[escolha?.indice ?? 0];
      if (escolha) naAncora = escolha.visiveis;
      else posicoes = posicoesDoClique();
      if (!naAncora.length) {
        console.warn(
          "[ancora] nenhum alvo aparece bem em um quadro limpo; a troca segue sem âncora",
        );
        return {
          imagem: null,
          descricoes,
          outras: await outrasDe(descricoes),
          naAncora: [],
        };
      }
    } else if (o.marcadas?.length) {
      // O usuário pausou onde a pessoa aparece bem: esse é o quadro.
      const saida = path.join(o.dir, "ancora-origem.jpg");
      await extrairQuadroMarcado(
        o.arquivo,
        Math.min(o.marcadas[0].t, o.info.duracao - 0.1),
        saida,
      );
      quadro = await readFile(saida);
      posicoes = posicoesDoClique();
    } else {
      const quadros = await Promise.all(
        instantesCandidatos(o.info.duracao).map(async (t, i) => {
          const saida = path.join(o.dir, `ancora-cand-${i}.jpg`);
          await extrairQuadro(o.arquivo, t, saida);
          return readFile(saida);
        }),
      );
      const escolha = await escolherQuadroPrincipal(quadros);
      quadro = quadros[escolha.indice];
      if (escolha.descricao) descricoes = [escolha.descricao];
    }
    if (!process.env.GEMINI_API_KEY?.trim())
      return { imagem: null, descricoes, outras: [], naAncora: [] };

    const outrasP = outrasDe(descricoes);
    let { imagem, feitos } = await trocarNoQuadro({
      quadro,
      alvos: naAncora,
      descricoes,
      tipos: o.tipos,
      personagens: o.personagens,
      quem: o.quem,
      info: o.info,
      estilo: o.estilo,
      roupa: o.roupa,
      posicoes,
    });
    // Personagem e cena: o quadro-guia também mostra o lugar novo. Se a cena
    // não sair, fica sem guia — com o lugar antigo ele contradiria o pedido.
    if (o.cena && imagem) {
      imagem = await editarQuadro({
        quadro: imagem,
        info: o.info,
        cena: true,
        pedido: o.cena,
        estilo: o.estilo,
      });
      if (!imagem) feitos = [];
    }
    return { imagem, descricoes, outras: await outrasP, naAncora: feitos };
  } catch (e) {
    console.warn(
      "[ancora] sem quadro-âncora (a troca segue sem ele):",
      (e as Error).message,
    );
    return {
      imagem: null,
      descricoes,
      outras: await outrasDe(descricoes).catch(() => []),
      naAncora: [],
    };
  }
}

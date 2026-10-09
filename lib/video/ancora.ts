import path from "node:path";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { GoogleGenAI } from "@google/genai";
import {
  generateImage,
  proporcaoMaisProxima,
  shrinkReferencia,
} from "@/lib/ai/gemini";
import { promptTrocaImagem } from "@/lib/prompts/trocar-imagem";
import { extrairQuadro, type VideoInfo } from "./ffmpeg";
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
const MODELO_VISAO =
  process.env.GEMINI_TEXT_MODEL?.trim() || "gemini-flash-latest";

async function reduzido(quadro: Buffer): Promise<string> {
  return (
    await sharp(quadro)
      .resize(640, 640, { fit: "inside" })
      .jpeg({ quality: 80 })
      .toBuffer()
  ).toString("base64");
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
    const res = await ai.models.generateContent({
      model: MODELO_VISAO,
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
    const json = (res.text ?? "").match(/\{[\s\S]*\}/)?.[0];
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
    const res = await ai.models.generateContent({
      model: MODELO_VISAO,
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                `These are ${quadros.length} frames of the same video, numbered 1 to ${quadros.length}. ` +
                `Target people: ${alvos.map((a, i) => `${i + 1}) ${a}`).join("; ")}. ` +
                "Pick the ONE frame that works best as a clean still reference: every person in it is sharp (no motion blur), " +
                "nobody overlaps, covers or is cut off by anybody else, and faces are visible. " +
                "Among clean frames, prefer the one that shows more of the target people. A clean frame with a single target is better than a frame with all targets where one is blurred or overlapping. " +
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
    const json = (res.text ?? "").match(/\{[\s\S]*\}/)?.[0];
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
                  ? `The first ${marcados.length} image(s) each show, with a red target, a person who WILL be replaced. Never list those people, even when they look different in other frames (another angle, closer to the camera, blurred, partly cut off). After them come ${quadros.length} frames sampled along the same video. `
                  : `These are ${quadros.length} frames sampled along one video. `) +
                (alvos.length
                  ? `IGNORE these people (they will be replaced): ${alvos.join("; ")}. `
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
  /** Imagem do personagem de cada alvo (mesma ordem). */
  personagens: Buffer[];
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
            await extrairQuadro(
              o.arquivo,
              Math.max(0.05, Math.min(m.t, o.info.duracao - 0.1)),
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
      await extrairQuadro(
        o.arquivo,
        Math.max(0.05, Math.min(o.marcadas[0].t, o.info.duracao - 0.1)),
        saida,
      );
      quadro = await readFile(saida);
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

    const original = await sharp(quadro)
      .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
    const outrasP = outrasDe(descricoes);
    // Uma pessoa por vez, cada passada em cima do resultado da anterior. Com
    // todas no mesmo pedido, a segunda costuma sair "colada" (pose e luz da
    // imagem de referência, de pé e de frente) — e o vídeo inteiro copia isso.
    const prazo = Date.now() + LIMITE_MS;
    let imagem: Buffer | null = null;
    const feitos: number[] = [];
    for (const n of naAncora) {
      const restante = prazo - Date.now();
      if (restante <= 0) break;
      const geracao: Promise<Buffer | null> = generateImage({
        prompt: promptTrocaImagem({
          alvos: [{ descricao: descricoes[n], imagem: 2 }],
          // No vídeo o personagem entra com o próprio look (como a troca em vídeo sempre fez).
          roupa: "personagem",
        }),
        referencias: [
          {
            mimeType: "image/jpeg",
            data: (imagem
              ? await sharp(imagem).jpeg({ quality: 92 }).toBuffer()
              : original
            ).toString("base64"),
          },
          await shrinkReferencia(o.personagens[n]),
        ],
        aspectRatio: proporcaoMaisProxima(o.info.largura, o.info.altura),
        imageSize: "1K",
        qualidade: "padrao",
      }).catch((e) => {
        console.warn("[ancora] passada da âncora falhou:", (e as Error).message);
        return null;
      });
      // O Nano Banana às vezes demora: passado o limite, segue com o que já tem.
      const passada: Buffer | null = await Promise.race([
        geracao,
        new Promise<null>((ok) => setTimeout(() => ok(null), restante)),
      ]);
      if (!passada) break;
      imagem = passada;
      feitos.push(n);
    }
    if (feitos.length < naAncora.length)
      console.warn(
        `[ancora] quadro-âncora com ${feitos.length} de ${naAncora.length} alvos (tempo ou falha)`,
      );
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

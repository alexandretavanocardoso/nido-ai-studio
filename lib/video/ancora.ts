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

/**
 * Quadro-âncora da troca de pessoa em vídeo.
 *
 * O Kling processa o vídeo em trechos de até 10s, cada um sozinho — sem um
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
 * Descreve as OUTRAS pessoas que aparecem em destaque no vídeo (quem passa na
 * frente, quem divide a cena) — o modelo de vídeo só as preserva se o pedido
 * disser quem são. `alvos` são as pessoas que serão trocadas (ficam de fora).
 */
export async function descreverOutrasPessoas(
  quadros: Buffer[],
  alvos: string[],
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
                `These are ${quadros.length} frames sampled along one video. ` +
                (alvos.length
                  ? `IGNORE these people (they will be replaced): ${alvos.join("; ")}. `
                  : "IGNORE the main person (the subject of the video). ") +
                "List every OTHER person who appears prominently in any frame: anyone who passes in front of the camera, stands next to or interacts with the main person. " +
                "Do NOT list small or distant background people. For each one, a short description to recognise them: gender, hair, accessories, clothing colours, and how they appear. " +
                'Answer with JSON only: {"others": ["a woman with ...", ...]} — use {"others": []} if there is nobody else. Max 3 people, max 28 words each, English.',
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
}

export async function prepararAncora(o: {
  arquivo: string;
  dir: string;
  info: VideoInfo;
  /** Pessoas marcadas pelo usuário (instante do quadro em que cada uma foi marcada). */
  marcadas?: Array<{ t: number }>;
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
  const outrasDe = async (alvos: Array<string | undefined>) =>
    descreverOutrasPessoas(
      await varredura,
      alvos.filter((a): a is string => !!a),
    );
  try {
    let quadro: Buffer;
    if (o.marcadas?.length) {
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
      return { imagem: null, descricoes, outras: [] };

    // Uma imagem por personagem (repetidos entram uma vez): IMAGE 2, 3…
    const unicos: Buffer[] = [];
    const indices = o.personagens.map((p) => {
      let i = unicos.findIndex((u) => u.equals(p));
      if (i < 0) i = unicos.push(p) - 1;
      return 2 + i;
    });
    const original = await sharp(quadro)
      .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
    const outrasP = outrasDe(descricoes);
    const geracao = generateImage({
      prompt: promptTrocaImagem({
        alvos: o.personagens.map((_, i) => ({
          descricao: descricoes[i],
          imagem: indices[i],
        })),
        // No vídeo o personagem entra com o próprio look (como a troca em vídeo sempre fez).
        roupa: "personagem",
      }),
      referencias: [
        { mimeType: "image/jpeg", data: original.toString("base64") },
        ...(await Promise.all(unicos.map((u) => shrinkReferencia(u)))),
      ],
      aspectRatio: proporcaoMaisProxima(o.info.largura, o.info.altura),
      imageSize: "1K",
      qualidade: "padrao",
    });
    // O Nano Banana às vezes demora: passado o limite, a troca segue sem âncora.
    const imagem = await Promise.race([
      geracao,
      new Promise<null>((ok) => setTimeout(() => ok(null), LIMITE_MS)),
    ]);
    geracao.catch(() => {}); // se perdeu a corrida e falhar depois, não vira erro solto
    if (!imagem)
      console.warn(
        "[ancora] o quadro-âncora passou do tempo; a troca segue sem ele",
      );
    return { imagem, descricoes, outras: await outrasP };
  } catch (e) {
    console.warn(
      "[ancora] sem quadro-âncora (a troca segue sem ele):",
      (e as Error).message,
    );
    return {
      imagem: null,
      descricoes,
      outras: await outrasDe(descricoes).catch(() => []),
    };
  }
}

import { createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { S3Client } from "@aws-sdk/client-s3";
import {
  downloadToFile,
  newKey,
  presignGet,
  uploadFromFile,
} from "@/lib/storage/s3";
import { emendarCenas, extrairUltimoQuadro } from "./ffmpeg";
import type { ModeloCriar } from "./precos";
import { enviarCriacao, getRunway, mensagemDeErroRunway } from "./runway";
import {
  enviarCriacaoSapiens,
  ErroSapiens,
  getSapiens,
  mensagemDeErroSapiens,
} from "./sapiens";
import { comPastaTemporaria } from "./server";

/**
 * "Criar vídeo" em cenas encadeadas. Os modelos geram poucos segundos por vez
 * (5–10s), então um vídeo de 15 ou 30s é feito em cenas seguidas: quando uma
 * termina, ela é guardada e a próxima é pedida usando o último quadro dela
 * como ponto de partida. Com a última pronta, todas são unidas num vídeo só.
 *
 * O estado fica no `input` do job (video_jobs): `cadeia.cenas` é o plano,
 * `cadeia.partes` são as cenas já prontas (arquivos no S3 da conta) e
 * `fal_request_id` é sempre a cena que está rodando. Quem faz a cadeia andar
 * é a consulta do job (tela aberta ou a tarefa diária): o Runway não avisa
 * (e o aviso do Sapiens não é usado).
 */
export interface Cadeia {
  /** Duração pedida pelo usuário: o vídeo final é cortado aqui. */
  alvo: number;
  /** Duração de cada cena, na ordem. */
  cenas: number[];
  /** Cenas prontas (keys no S3), na ordem. */
  partes: string[];
}

/** Erro que encerra o job (créditos devolvidos), em vez de tentar de novo. */
export class FalhaDaCadeia extends Error {}

export function cadeiaDoJob(input: Record<string, unknown>): Cadeia | null {
  const c = input.cadeia as Partial<Cadeia> | undefined;
  if (!c || !Array.isArray(c.cenas) || !Array.isArray(c.partes)) return null;
  // Uma cena só, do tamanho pedido, não precisa de emenda nem de corte.
  if (c.cenas.length === 1 && c.cenas[0] === c.alvo) return null;
  return { alvo: Number(c.alvo), cenas: c.cenas, partes: c.partes };
}

async function baixar(url: string, arquivo: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body)
    throw new Error(`download da cena falhou (HTTP ${res.status})`);
  await pipeline(
    Readable.fromWeb(res.body as import("node:stream/web").ReadableStream),
    createWriteStream(arquivo),
  );
}

/**
 * A cena atual terminou e ainda faltam outras: guarda o vídeo dela, tira o
 * último quadro e pede a próxima a partir dele. Devolve o id da nova cena e o
 * `input` atualizado do job.
 */
export async function proximaCena(o: {
  s3: S3Client;
  userId: string;
  /** Serviço que gera o job (coluna `provedor`): Runway ou Sapiens. */
  provedor: string;
  modelo: string;
  input: Record<string, unknown>;
  cadeia: Cadeia;
  videoUrl: string;
}): Promise<{ idExterno: string; input: Record<string, unknown> }> {
  const sapiens = o.provedor === "sapiens" ? getSapiens() : null;
  const runway = o.provedor === "sapiens" ? null : getRunway();
  if (!sapiens && !runway)
    throw new FalhaDaCadeia(
      o.provedor === "sapiens"
        ? "Sapiens não configurado no servidor."
        : "Runway não configurado no servidor.",
    );
  return comPastaTemporaria(async (dir) => {
    const cena = path.join(dir, "cena.mp4");
    const quadro = path.join(dir, "quadro.jpg");
    await baixar(o.videoUrl, cena);
    await extrairUltimoQuadro(cena, quadro);

    const parteKey = newKey(o.userId, "videos", "video/mp4");
    const quadroKey = newKey(o.userId, "refs", "image/jpeg");
    await uploadFromFile(o.s3, parteKey, cena, "video/mp4");
    await uploadFromFile(o.s3, quadroKey, quadro, "image/jpeg");

    const partes = [...o.cadeia.partes, parteKey];
    let idExterno: string;
    const pedido = {
      modelo: o.modelo as ModeloCriar,
      // O último quadro já está no formato do vídeo.
      imageUrl: await presignGet(o.s3, quadroKey, 86_400),
      promptText: String(o.input.promptText ?? ""),
      vertical: o.input.vertical !== false,
      duracao: o.cadeia.cenas[partes.length],
      audio: o.input.audio === true,
    };
    try {
      idExterno = sapiens
        ? await enviarCriacaoSapiens(sapiens, pedido)
        : await enviarCriacao(runway!, pedido);
    } catch (e) {
      // Sapiens ocupado (nada cobrado): a próxima consulta do job tenta de novo.
      if (e instanceof ErroSapiens && e.passageiro) throw e;
      // Recusa do serviço (moderação, saldo, entrada): não adianta repetir.
      throw new FalhaDaCadeia(
        sapiens ? mensagemDeErroSapiens(e) : mensagemDeErroRunway(e),
      );
    }
    return {
      idExterno,
      input: { ...o.input, cadeia: { ...o.cadeia, partes } },
    };
  });
}

/** Última cena pronta: une todas e sobe o vídeo final (cortado no tempo pedido). */
export async function unirCenas(o: {
  s3: S3Client;
  userId: string;
  cadeia: Cadeia;
  ultimaUrl: string;
}): Promise<{ key: string; size: number }> {
  return comPastaTemporaria(async (dir) => {
    const arquivos: string[] = [];
    for (const [i, key] of o.cadeia.partes.entries()) {
      const arquivo = path.join(dir, `cena-${i}.mp4`);
      await downloadToFile(o.s3, key, arquivo);
      arquivos.push(arquivo);
    }
    const ultima = path.join(dir, "cena-final.mp4");
    await baixar(o.ultimaUrl, ultima);
    arquivos.push(ultima);

    const saida = path.join(dir, "video.mp4");
    await emendarCenas(arquivos, o.cadeia.alvo, saida);
    const key = newKey(o.userId, "videos", "video/mp4");
    await uploadFromFile(o.s3, key, saida, "video/mp4");
    // As cenas soltas e os quadros ficam órfãos no S3: a limpeza diária apaga.
    return { key, size: (await stat(saida)).size };
  });
}

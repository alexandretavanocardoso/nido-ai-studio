/**
 * Processo do Motion (fica ligado no Railway, ver DEPLOY.md): pega os pedidos
 * da tabela `motions` e
 *  - gera: lê o site (Chrome), manda o pedido e as imagens ao modelo
 *    escolhido, confere se o HTML carrega sem erro (uma correção, se precisar)
 *    e guarda o HTML no S3;
 *  - grava: abre o HTML num Chrome do tamanho do vídeo e grava o MP4 quadro a
 *    quadro (ver renderizar.ts).
 * Um trabalho por vez. Desligado no meio, o trabalho volta para a fila (outro
 * processo retoma em 10 min).
 */
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Pool } from "@neondatabase/serverless";
import ffmpegStatic from "ffmpeg-static";
import { chromium, type Browser } from "playwright-core";
import sharp from "sharp";
import {
  andamento,
  concluirGeracao,
  concluirGravacao,
  falharGeracao,
  falharGravacao,
  pegarTrabalho,
  processoVivo,
  salvarInput,
  sinal,
  type TrabalhoMotion,
} from "./banco";
import { ErroIA, escrever } from "./ia";
import {
  custoMotion,
  ehModeloMotion,
  MODELO_MOTION_PADRAO,
  MODELOS_MOTION,
  type EsforcoMotion,
} from "./modelos";
import { pedidoCorrecao, pedidoMotion, sistemaMotion, type ParteMotion } from "./prompt";
import { gravar, testarHtml } from "./renderizar";
import { extrairHtml, montarHtml } from "./runtime";
import { armazenamento, type ArmazenamentoMotion } from "./s3";
import { lerSite } from "./site";
import { FORMATOS_MOTION, FPS_MOTION, keyDoMotion, type AssetMotion, type UsoMotion } from "./tipos";

const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[motion]", ...a);

const precisa = (nome: string) => {
  const v = process.env[nome]?.trim();
  if (!v) throw new Error(`Falta a variável ${nome}.`);
  return v;
};

interface Servicos {
  pool: Pool;
  s3: ArmazenamentoMotion;
  navegador: () => Promise<Browser>;
}

/** Imagem reduzida para o modelo (lado maior até 1600px; PNG recortado fica PNG). */
async function paraModelo(imagem: Buffer, asset: AssetMotion) {
  const png = asset.transparente || asset.papel === "logo";
  const lado = png ? 1280 : 1600;
  const base = sharp(imagem).rotate().resize(lado, lado, { fit: "inside", withoutEnlargement: true });
  const buf = png ? await base.png({ compressionLevel: 9 }).toBuffer() : await base.jpeg({ quality: 85 }).toBuffer();
  return { asset, mime: png ? ("image/png" as const) : ("image/jpeg" as const), base64: buf.toString("base64") };
}

async function enderecos(s3: ArmazenamentoMotion, assets: AssetMotion[]): Promise<Record<string, string>> {
  return Object.fromEntries(await Promise.all(assets.map(async (a) => [a.id, await s3.url(a.key)] as const)));
}

async function gerar(s: Servicos, job: TrabalhoMotion): Promise<void> {
  const { pool, s3 } = s;
  const input = job.input;
  const { largura, altura } = FORMATOS_MOTION[input.formato];
  const modelo = ehModeloMotion(job.modelo) ? job.modelo : MODELO_MOTION_PADRAO;
  const esforcos: readonly string[] = MODELOS_MOTION[modelo].esforcos;
  const esforco = (esforcos.includes(job.esforco ?? "") ? job.esforco : MODELOS_MOTION[modelo].padrao) as EsforcoMotion;
  const inicio = Date.now();
  const uso: UsoMotion = { entrada: 0, saida: 0, custo: 0, segundos: 0, modelo };
  try {
    const navegador = await s.navegador();
    // 1. O site, uma vez só (o ajuste reaproveita o que foi lido).
    if (input.site && !input.site.leitura && !input.site.erro) {
      await andamento(pool, job.id, { etapa: "site" });
      try {
        const { leitura, capturas } = await lerSite(navegador, input.site.url);
        for (const [i, c] of capturas.entries()) {
          const key = `users/${job.userId}/motion/${randomBytes(9).toString("base64url")}.${c.mime === "image/png" ? "png" : "jpg"}`;
          await s3.enviar(key, c.imagem, c.mime);
          input.assets.push({
            id: `s${i + 1}`,
            key,
            papel: c.papel,
            largura: c.largura,
            altura: c.altura,
            transparente: c.mime === "image/png",
          });
        }
        input.site.leitura = leitura;
      } catch (e) {
        log("site não lido:", input.site.url, (e as Error).message);
        input.site.erro = (e as Error).message.slice(0, 200);
      }
      await salvarInput(pool, job.id, input);
    }

    // 2. O pedido: o texto e as imagens (e o HTML de base, num ajuste).
    await andamento(pool, job.id, { etapa: "pensando" });
    const imagens = await Promise.all(input.assets.map(async (a) => paraModelo(await s3.baixar(a.key), a)));
    const base = input.ajuste ? (await s3.baixar(input.ajuste.baseHtmlKey)).toString("utf8") : undefined;
    const sistema = sistemaMotion({ largura, altura, duracao: input.duracao });
    let partes: ParteMotion[] = pedidoMotion(input, job.tipo, imagens, base);
    const mapa = await enderecos(s3, input.assets);

    // 3. Escreve, confere se carrega e, se quebrar, pede uma correção.
    let html: string | null = null;
    for (let tentativa = 0; tentativa < 2 && !html; tentativa++) {
      let aviso = 0;
      const vivo = setInterval(() => void sinal(pool, job.id).catch(() => {}), 60_000);
      const r = await escrever({
        modelo,
        esforco,
        sistema,
        partes,
        aoEscrever: (caracteres) => {
          if (Date.now() - aviso < 2500) return;
          aviso = Date.now();
          void andamento(pool, job.id, { etapa: "escrevendo", caracteres }).catch(() => {});
        },
      }).finally(() => clearInterval(vivo));
      uso.entrada += r.entrada;
      uso.saida += r.saida;
      uso.custo += custoMotion(ehModeloMotion(r.modelo) ? r.modelo : modelo, r.entrada, r.saida);
      uso.modelo = r.modelo;
      const escrito = extrairHtml(r.texto);
      if (!escrito) {
        log("resposta sem HTML completo:", job.id, r.texto.slice(0, 200));
        continue;
      }
      await andamento(pool, job.id, { etapa: "conferindo" });
      const erro = await testarHtml(
        navegador,
        montarHtml(escrito, { largura, altura, duracao: input.duracao, fps: FPS_MOTION, modo: "render", enderecos: mapa }),
        { largura, altura, duracao: input.duracao },
      );
      if (!erro || tentativa === 1) {
        if (erro) log("ficou com erro mesmo depois da correção:", job.id, erro);
        html = escrito;
      } else {
        log("HTML com erro, pedindo correção:", job.id, erro);
        uso.correcoes = (uso.correcoes ?? 0) + 1;
        partes = pedidoCorrecao(escrito, erro);
      }
    }
    if (!html) throw new ErroIA("O modelo não devolveu um HTML completo. Tente de novo.");

    const key = keyDoMotion(job.userId, job.id, "html");
    await s3.enviar(key, html, "text/html; charset=utf-8");
    uso.custo = Number(uso.custo.toFixed(4));
    uso.segundos = Math.round((Date.now() - inicio) / 1000);
    await concluirGeracao(pool, job.id, key, uso);
    log("pronto:", job.id, modelo, esforco, `${uso.segundos}s`, `US$ ${uso.custo}`);
  } catch (e) {
    log("geração falhou:", job.id, e);
    uso.segundos = Math.round((Date.now() - inicio) / 1000);
    await falharGeracao(
      pool,
      job.id,
      e instanceof ErroIA ? e.message : `A geração falhou: ${(e as Error).message.slice(0, 200)}`,
      uso.entrada ? uso : undefined,
    );
  }
}

async function gravarVideo(s: Servicos, job: TrabalhoMotion): Promise<void> {
  const { pool, s3 } = s;
  const { largura, altura } = FORMATOS_MOTION[job.input.formato];
  const dir = await mkdtemp(path.join(os.tmpdir(), "motion-"));
  try {
    if (!job.htmlKey) throw new Error("O motion não tem HTML.");
    const html = (await s3.baixar(job.htmlKey)).toString("utf8");
    const saida = path.join(dir, "motion.mp4");
    await gravar({
      navegador: await s.navegador(),
      ffmpeg: ffmpegStatic as unknown as string,
      html: montarHtml(html, {
        largura,
        altura,
        duracao: job.input.duracao,
        fps: FPS_MOTION,
        modo: "render",
        enderecos: await enderecos(s3, job.input.assets),
      }),
      largura,
      altura,
      duracao: job.input.duracao,
      fps: FPS_MOTION,
      saida,
      aoGravar: (quadro, total) => andamento(pool, job.id, { etapa: "gravando", quadro, total }),
    });
    await andamento(pool, job.id, { etapa: "enviando" });
    const key = keyDoMotion(job.userId, job.id, "mp4");
    await s3.enviarArquivo(key, saida, "video/mp4");
    await concluirGravacao(pool, job.id, key);
    log("vídeo pronto:", job.id);
  } catch (e) {
    log("gravação falhou:", job.id, e);
    await falharGravacao(pool, job.id, `A gravação falhou: ${(e as Error).message.split("\n")[0].slice(0, 200)}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

async function rodar() {
  const pool = new Pool({ connectionString: precisa("DATABASE_URL") });
  const s3 = armazenamento(precisa("AWS_REGION"), precisa("S3_BUCKET"));
  // Chrome do Playwright (na imagem Docker) ou o do sistema em MOTION_CHROME (rodando local).
  let chrome: Browser | null = null;
  const navegador = async () => {
    if (!chrome?.isConnected()) {
      chrome = await chromium.launch({
        executablePath: process.env.MOTION_CHROME?.trim() || undefined,
        args: ["--disable-dev-shm-usage", "--font-render-hinting=none"],
      });
      log("Chrome ligado:", chrome.version());
    }
    return chrome;
  };
  const s: Servicos = { pool, s3, navegador };

  const processo = `${os.hostname()}-${process.pid}`;
  let parar = false;
  const desligar = () => {
    log("desligando: o trabalho atual volta para a fila.");
    parar = true;
    setTimeout(() => process.exit(0), 2000);
  };
  process.on("SIGTERM", desligar);
  process.on("SIGINT", desligar);
  const vivo = () => processoVivo(pool, processo).catch((e) => log("sinal de vida falhou:", (e as Error).message));
  await vivo();
  setInterval(vivo, 30_000);
  log("ligado:", processo);

  while (!parar) {
    const job = await pegarTrabalho(pool).catch((e) => {
      log("fila:", (e as Error).message);
      return null;
    });
    if (!job) {
      await esperar(5000);
      continue;
    }
    log(job.acao === "gerar" ? "gerando:" : "gravando:", job.id, job.modelo, job.esforco ?? "");
    if (job.acao === "gerar") await gerar(s, job);
    else await gravarVideo(s, job);
  }
}

rodar().catch((e) => {
  log("parou:", e);
  process.exit(1);
});

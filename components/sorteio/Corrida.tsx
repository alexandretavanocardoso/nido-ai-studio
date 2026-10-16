"use client";

import { useEffect, useMemo, useRef } from "react";
import { tx } from "@/lib/i18n/tx";
import {
  classificacao,
  FIM_S,
  CONTAGEM_S,
  DURACAO_S,
  gerador,
  montarRoteiro,
  progresso,
  type Roteiro,
} from "@/lib/sorteio/corrida";
import type { SorteioPublico } from "@/lib/sorteio/tipos";
import { textoPremio } from "./comum";
import {
  AMARELO,
  caminhoChanfrado,
  desenharCorredor,
  desenharFigura,
  desenharGinasio,
  desenharNome,
  desenharPista,
  espacar,
  H,
  NEON,
  painelNeon,
  peleDe,
  PISTA_M,
  PX_M,
  raia,
  textoGlitch,
  textoNeon,
  W,
  type Figura,
} from "./desenho";

/**
 * A corrida de influencers do sorteio, ao vivo: monta a receita da corrida
 * (lib/sorteio/corrida.ts) com a semente e o ganhador que o servidor mandou e
 * desenha o instante certo pelo relógio do servidor (`desvio`), então todas
 * as telas — quem participa, o admin e o palco do OBS — veem a mesma corrida
 * ao mesmo tempo. Antes da largada, os corredores esperam na linha.
 */
export function Corrida({
  sorteio,
  desvio,
  destaque,
  className,
}: {
  sorteio: SorteioPublico;
  /** Relógio do servidor menos o daqui (ms). */
  desvio: number;
  /** O corredor de quem está vendo (plaquinha amarela). */
  destaque?: string | null;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Rostos e figuras dos corredores, pelo endereço. */
  const fotos = useRef(new Map<string, HTMLImageElement>());

  useEffect(() => {
    for (const url of sorteio.corredores.flatMap((c) => [c.foto, c.corpo])) {
      if (!url || fotos.current.has(url)) continue;
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      fotos.current.set(url, img);
    }
  }, [sorteio.corredores]);

  const roteiro = useMemo(
    () =>
      sorteio.semente !== null && sorteio.vencedor !== null && sorteio.vencedor >= 0
        ? montarRoteiro(sorteio.corredores.length, sorteio.vencedor, sorteio.semente)
        : null,
    [sorteio.semente, sorteio.vencedor, sorteio.corredores.length],
  );

  // O laço de desenho lê sempre o mais recente, sem recomeçar a cada resposta do servidor.
  const atual = useRef({ sorteio, desvio, destaque: destaque ?? null, roteiro });
  atual.current = { sorteio, desvio, destaque: destaque ?? null, roteiro };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ajustar = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const largura = Math.max(320, Math.round((canvas.clientWidth || W) * dpr));
      if (canvas.width !== largura) {
        canvas.width = largura;
        canvas.height = Math.round((largura * H) / W);
      }
    };
    const ro = new ResizeObserver(ajustar);
    ro.observe(canvas);
    ajustar();
    let raf = 0;
    const quadro = () => {
      desenhar(ctx, canvas, atual.current, fotos.current);
      raf = requestAnimationFrame(quadro);
    };
    raf = requestAnimationFrame(quadro);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} style={{ width: "100%", aspectRatio: "16 / 9", display: "block" }} />;
}

interface Estado {
  sorteio: SorteioPublico;
  desvio: number;
  destaque: string | null;
  roteiro: Roteiro | null;
}

function desenhar(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, e: Estado, fotos: Map<string, HTMLImageElement>) {
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  // O estado do canvas passa de um quadro para o outro: começa sempre do zero.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowBlur = 0;
  const { sorteio: s, roteiro } = e;
  const relogio = performance.now() / 1000;
  const n = s.corredores.length;
  const raias = Math.min(Math.max(n, 4), 10);
  const largou = s.largadaEm !== null && !!roteiro;
  const t = largou ? (Date.now() + e.desvio - s.largadaEm!) / 1000 - CONTAGEM_S : -Infinity;
  const tc = Math.max(0, t);
  const p = s.corredores.map((_, i) => (largou ? progresso(roteiro!, i, tc) : 0));
  const frente = p.length ? Math.max(...p) : 0;
  const camX = largou ? Math.min(PISTA_M - 15, Math.max(-4, frente * PISTA_M - 13)) : -4;
  const acabou = largou && (t >= DURACAO_S + 0.8 || s.status === "concluido");
  const empolgacao = !largou ? 0.15 : t < 0 ? 0.35 : t < DURACAO_S - 7 ? 0.55 : 1;

  desenharGinasio(ctx, camX, relogio, empolgacao, s.titulo);
  desenharPista(ctx, camX, raias, tx("CHEGADA"));

  const ordem = largou && t > 0 ? classificacao(roteiro!, tc) : [];
  const lugar = new Map(ordem.map((i, k) => [i, k + 1]));
  // Antes da largada, todos em fila na pista (apresentação); na contagem, andam até a linha.
  const indo = largou ? suave((t + CONTAGEM_S) / (CONTAGEM_S - 2.2)) : 0;
  // Nomes: na apresentação (até 24), e na corrida depois que o pelotão se espalha (todos até 16; senão, os 5 primeiros).
  const todos = s.corredores.map((_, i) => i);
  const comNome = new Set<number>(
    indo < 1 ? (n <= 24 ? todos : []) : t < 2.5 ? [] : n <= 16 ? todos : ordem.slice(0, 5),
  );
  const filasApresentacao = n <= 10 ? 1 : n <= 24 ? 2 : 3;
  const colunas = Math.ceil(n / filasApresentacao);
  const espaco = Math.min(2.4, 20 / Math.max(1, colunas));
  const itens = s.corredores.map((c, i) => {
    // Na linha: uma raia cada; mais gente que raias, os de trás largam um pouco atrás e alcançam na chegada.
    const pista = i % raias;
    const fila = Math.floor(i / raias);
    const naLinha = raia(pista, raias);
    const atras = fila * 0.8;
    const m = largou && t > 0 ? p[i] * PISTA_M - atras * (1 - Math.min(1, p[i])) : -0.5 - atras;
    if (indo >= 1) return { c, i, y: naLinha.y + (fila % 2) * 5, escala: naLinha.escala, m, andando: false };
    // Na apresentação: lado a lado, em 1 a 3 fileiras nas raias da frente.
    const fileira = i % filasApresentacao;
    const coluna = Math.floor(i / filasApresentacao);
    const ap = raia(Math.max(0, raias - 1 - fileira * 2), raias);
    const mAp = -3 + espaco * (coluna + 0.5) + (fileira % 2) * (espaco / 2);
    return {
      c,
      i,
      y: ap.y + (naLinha.y - ap.y) * indo,
      escala: ap.escala + (naLinha.escala - ap.escala) * indo,
      m: mAp + (m - mAp) * indo,
      andando: indo > 0,
    };
  });
  itens.sort((a, b) => a.y - b.y || a.m - b.m);
  for (const it of itens) {
    const x = (it.m - camX) * PX_M;
    if (x < -90 || x > W + 90) continue;
    const correndo = (largou && t > 0 && p[it.i] < 1.05) || it.andando;
    const fase = largou && t > 0 ? p[it.i] * PISTA_M * 4.5 : it.andando ? relogio * 9 + it.i : relogio * 2 + it.i;
    const venceu = acabou && it.i === s.vencedor;
    const meu = e.destaque === it.c.id;
    const figura: Figura = {
      cor: it.c.cor,
      foto: (it.c.foto && fotos.get(it.c.foto)) || null,
      inicial: it.c.nome.trim().charAt(0).toUpperCase() || "?",
      pele: peleDe(it.c.id),
    };
    const corpo = it.c.corpo ? fotos.get(it.c.corpo) : undefined;
    const aro = venceu || meu ? AMARELO : null;
    // O próprio influencer correndo; sem a figura (ainda carregando, ou sem influencer), o boneco com o rosto.
    const cabeca =
      corpo && corpo.complete && corpo.naturalWidth
        ? desenharFigura(ctx, x, it.y, it.escala * 1.05, fase, correndo, corpo, aro)
        : desenharCorredor(ctx, x, it.y, it.escala * 1.05, fase, correndo, figura, aro);
    if (comNome.has(it.i) || meu) {
      const l = lugar.get(it.i);
      desenharNome(ctx, x, cabeca, it.escala * 1.05, it.c.nome, l && l <= 3 ? l : null, meu);
    }
  }

  // Cantos escurecidos (a luz fica no meio da pista).
  const vinheta = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.72);
  vinheta.addColorStop(0, "rgba(0,0,0,0)");
  vinheta.addColorStop(1, "rgba(3,0,12,0.45)");
  ctx.fillStyle = vinheta;
  ctx.fillRect(0, 0, W, H);

  desenharPainel(ctx, s);
  if (largou && t > 0 && !acabou) desenharClassificacao(ctx, s, ordem, p, e.destaque, fotos);
  if (!largou) desenharEspera(ctx, s);
  if (largou && t < 0.9) desenharContagem(ctx, t);
  if (acabou && s.vencedor !== null) {
    // Pódio: os 3 primeiros na chegada (o sorteado é sempre o 1º).
    const podio = classificacao(roteiro!, FIM_S).slice(0, 3);
    desenharPodio(ctx, s, podio, fotos, Math.max(0, t - DURACAO_S));
  }
}

/** Título, presente e marca, no alto à esquerda. */
function desenharPainel(ctx: CanvasRenderingContext2D, s: SorteioPublico) {
  ctx.save();
  painelNeon(ctx, 18, 72, 420, 86, NEON.ciano);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.save();
  ctx.font = "800 13px ui-monospace, Consolas, monospace";
  espacar(ctx, "3px");
  textoNeon(ctx, `▮ ${tx("SORTEIO NIDO")}`, 36, 86, NEON.magenta, 8);
  ctx.restore();
  ctx.fillStyle = "#fff";
  ctx.font = "800 24px system-ui, sans-serif";
  ctx.fillText(cortar(ctx, s.titulo, 380), 36, 104);
  ctx.fillStyle = "#a6f7ff";
  ctx.font = "600 16px system-ui, sans-serif";
  ctx.fillText(`🎁 ${textoPremio(s.premio)}`, 36, 134);
  ctx.restore();
}

/** Os 5 primeiros agora, e a posição de quem está vendo. */
function desenharClassificacao(
  ctx: CanvasRenderingContext2D,
  s: SorteioPublico,
  ordem: number[],
  p: number[],
  destaque: string | null,
  fotos: Map<string, HTMLImageElement>,
) {
  const linhas = ordem.slice(0, 5);
  const meuI = destaque ? s.corredores.findIndex((c) => c.id === destaque) : -1;
  const meuLugar = meuI >= 0 ? ordem.indexOf(meuI) + 1 : 0;
  const altura = 22 + linhas.length * 34 + (meuLugar > 5 ? 30 : 0);
  ctx.save();
  painelNeon(ctx, W - 318, 72, 300, altura, NEON.magenta);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  linhas.forEach((i, k) => {
    const c = s.corredores[i];
    const y = 88 + k * 34;
    if (c.id === destaque) {
      ctx.fillStyle = "rgba(255,230,0,0.12)";
      ctx.fillRect(W - 312, y - 2, 288, 30);
    }
    ctx.font = "900 16px ui-monospace, Consolas, monospace";
    if (k === 0) textoNeon(ctx, `${k + 1}º`, W - 302, y + 13, AMARELO, 10);
    else {
      ctx.fillStyle = "#a6f7ff";
      ctx.fillText(`${k + 1}º`, W - 302, y + 13);
    }
    rostinho(ctx, W - 254, y + 13, 13, c.cor, (c.foto && fotos.get(c.foto)) || null, c.nome);
    ctx.strokeStyle = k === 0 ? AMARELO : NEON.ciano;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(W - 254, y + 13, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = c.id === destaque ? AMARELO : "#fff";
    ctx.font = "700 16px system-ui, sans-serif";
    ctx.fillText(cortar(ctx, c.nome, 150), W - 232, y + 13);
    ctx.fillStyle = "rgba(0,240,255,0.7)";
    ctx.font = "600 13px ui-monospace, Consolas, monospace";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.min(100, Math.round(p[i] * 100))}m`, W - 32, y + 13);
    ctx.textAlign = "left";
  });
  if (meuLugar > 5) {
    ctx.fillStyle = AMARELO;
    ctx.font = "800 15px system-ui, sans-serif";
    ctx.fillText(`${tx("Você")}: ${meuLugar}º`, W - 302, 88 + linhas.length * 34 + 14);
  }
  ctx.restore();
}

/** Antes da largada: quantos estão na linha e o que falta. */
function desenharEspera(ctx: CanvasRenderingContext2D, s: SorteioPublico) {
  const n = s.corredores.length;
  const linha1 = !n
    ? tx("Aguardando participantes")
    : `${n} ${n === 1 ? tx("participante na largada") : tx("participantes na largada")}`;
  const linha2 = s.status === "fechado" ? tx("Inscrições encerradas · a corrida já vai começar") : tx("Inscrições abertas · entre pelo app NIDO");
  ctx.save();
  painelNeon(ctx, W / 2 - 300, 176, 600, 92, NEON.ciano);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 30px system-ui, sans-serif";
  textoNeon(ctx, linha1, W / 2, 208, NEON.ciano, 16);
  ctx.fillStyle = AMARELO;
  ctx.font = "700 17px system-ui, sans-serif";
  ctx.fillText(linha2, W / 2, 245);
  ctx.restore();
}

/** 3, 2, 1… VAI! */
function desenharContagem(ctx: CanvasRenderingContext2D, t: number) {
  const texto = t >= 0 ? tx("VAI!") : t >= -3 ? String(Math.ceil(-t)) : tx("Preparar…");
  const frac = t >= 0 ? t / 0.9 : t >= -3 ? 1 - (Math.ceil(-t) + t) : 0.5;
  const escala = t >= -3 ? 1.4 - 0.4 * Math.min(1, frac * 2) : 1;
  ctx.save();
  ctx.globalAlpha = t >= 0 ? 1 - frac : 1;
  ctx.translate(W / 2, H * 0.36);
  ctx.scale(escala, escala);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${t >= -3 ? 150 : 64}px system-ui, sans-serif`;
  ctx.lineWidth = 12;
  ctx.strokeStyle = "rgba(5,3,15,0.8)";
  ctx.strokeText(texto, 0, 0);
  textoGlitch(ctx, texto, 0, 0, t >= 0 ? AMARELO : NEON.ciano, performance.now() / 1000);
  ctx.restore();
}

/** Neon e alturas dos degraus do pódio (1º ouro, 2º prata, 3º bronze). */
const DEGRAUS = [
  { cor: "#ffe600", altura: 150, figura: 270, rosto: 84 },
  { cor: "#9fe8ff", altura: 105, figura: 215, rosto: 68 },
  { cor: "#ff8a3d", altura: 72, figura: 195, rosto: 62 },
];

/**
 * O pódio: o 1º no meio e mais alto, o 2º à esquerda, o 3º à direita, cada um
 * de pé no seu degrau (a figura do influencer, ou o rosto), com o nome. Em
 * cima, "VENCEU!", o nome do ganhador e o prêmio; confete caindo.
 */
function desenharPodio(ctx: CanvasRenderingContext2D, s: SorteioPublico, podio: number[], fotos: Map<string, HTMLImageElement>, desde: number) {
  const c = s.corredores[podio[0]];
  const entrada = Math.min(1, desde / 0.6);
  ctx.save();
  ctx.fillStyle = `rgba(4,2,14,${0.86 * entrada})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = entrada;
  const base = H - 24;
  // Feixe de luz em cima do 1º e a grade do chão.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const feixe = ctx.createLinearGradient(0, 0, 0, base);
  feixe.addColorStop(0, "rgba(255,230,0,0)");
  feixe.addColorStop(1, "rgba(255,230,0,0.16)");
  ctx.fillStyle = feixe;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 40, 0);
  ctx.lineTo(W / 2 + 40, 0);
  ctx.lineTo(W / 2 + 170, base);
  ctx.lineTo(W / 2 - 170, base);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(139,92,246,0.22)";
  ctx.lineWidth = 1;
  for (let k = -12; k <= 12; k++) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + k * 30, base - 60);
    ctx.lineTo(W / 2 + k * 110, H);
    ctx.stroke();
  }
  ctx.restore();
  confete(ctx, s, desde);

  // Título: quem venceu e o prêmio.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 56px system-ui, sans-serif";
  textoGlitch(ctx, tx("VENCEU!"), W / 2, 62, AMARELO, desde);
  ctx.font = "800 30px system-ui, sans-serif";
  textoNeon(ctx, `${cortar(ctx, c.nome, 520)} · 🎁 ${textoPremio(s.premio)}`, W / 2, 112, NEON.ciano, 10);

  // Degraus: 2º à esquerda, 1º no meio, 3º à direita.
  const largura = 230;
  const posicoes = [W / 2, W / 2 - largura - 8, W / 2 + largura + 8];
  podio.forEach((i, lugar) => {
    const d = DEGRAUS[lugar];
    const x = posicoes[lugar];
    const topo = base - d.altura;
    // Degrau de vidro escuro com borda de neon.
    ctx.save();
    caminhoChanfrado(ctx, x - largura / 2, topo, largura, d.altura, 14);
    const vidro = ctx.createLinearGradient(0, topo, 0, base);
    vidro.addColorStop(0, `${d.cor}40`);
    vidro.addColorStop(1, "rgba(10,8,26,0.95)");
    ctx.fillStyle = vidro;
    ctx.fill();
    ctx.shadowColor = d.cor;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = d.cor;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = d.cor;
    ctx.fillRect(x - largura / 2 + 14, topo - 1, largura - 14, 4);
    ctx.restore();
    ctx.font = `900 ${lugar === 0 ? 64 : 50}px ui-monospace, Consolas, monospace`;
    textoNeon(ctx, String(lugar + 1), x, topo + 14 + (d.altura - 14) * 0.42, d.cor, 18);
    // Nome no degrau.
    const corredor = s.corredores[i];
    ctx.font = "800 18px system-ui, sans-serif";
    ctx.fillStyle = "#fff";
    ctx.fillText(cortar(ctx, corredor.nome, largura - 20), x, d.altura > 90 ? base - 18 : topo - 12);
    // Quem ficou nessa posição, de pé no degrau (o 1º com brilho e pulando).
    const corpo = corredor.corpo ? fotos.get(corredor.corpo) : undefined;
    const pulo = lugar === 0 ? Math.abs(Math.sin(desde * 3)) * 12 : 0;
    const pe = topo - (d.altura > 90 ? 6 : 34);
    ctx.save();
    ctx.shadowColor = d.cor;
    ctx.shadowBlur = lugar === 0 ? 36 : 16;
    if (corpo && corpo.complete && corpo.naturalWidth) {
      const h = d.figura;
      const w = (h * corpo.naturalWidth) / corpo.naturalHeight;
      ctx.drawImage(corpo, x - w / 2, pe - h - pulo, w, h);
    } else {
      const r = d.rosto;
      rostinho(ctx, x, pe - r - 6 - pulo, r, corredor.cor, (corredor.foto && fotos.get(corredor.foto)) || null, corredor.nome);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = d.cor;
      ctx.lineWidth = lugar === 0 ? 7 : 4;
      ctx.beginPath();
      ctx.arc(x, pe - r - 6 - pulo, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  });
  ctx.restore();
}

/** Confete de neon caindo (o mesmo em todas as telas: sai da semente). */
function confete(ctx: CanvasRenderingContext2D, s: SorteioPublico, desde: number) {
  const r = gerador((s.semente ?? 1) + 7);
  const cores = [AMARELO, NEON.magenta, NEON.ciano, NEON.roxo, "#7dffb2", "#ffffff"];
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let k = 0; k < 140; k++) {
    const x0 = r() * W;
    const vel = 90 + r() * 140;
    const y = ((-40 + desde * vel + r() * H) % (H + 60)) - 30;
    const x = x0 + Math.sin(desde * 2 + k) * 18;
    ctx.fillStyle = cores[k % cores.length];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(desde * 3 + k);
    ctx.fillRect(-6, -1.5, 12, 3);
    ctx.restore();
  }
  ctx.restore();
}

/** Rosto redondo (foto, ou a inicial na cor da camiseta). */
function rostinho(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, cor: string, foto: HTMLImageElement | null, nome: string) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = cor;
  ctx.fill();
  if (foto && foto.complete && foto.naturalWidth) {
    ctx.clip();
    ctx.drawImage(foto, x - r, y - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = "#fff";
    ctx.font = `900 ${Math.round(r * 1.05)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(nome.trim().charAt(0).toUpperCase() || "?", x, y + r * 0.06);
  }
  ctx.restore();
}

/** 0 → 1 com começo e fim suaves (fora de 0..1, fica nas pontas). */
function suave(v: number): number {
  const x = Math.min(1, Math.max(0, v));
  return x * x * (3 - 2 * x);
}

/** Corta o texto com reticências para caber na largura. */
function cortar(ctx: CanvasRenderingContext2D, texto: string, max: number): string {
  if (ctx.measureText(texto).width <= max) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

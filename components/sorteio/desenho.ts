import { gerador } from "@/lib/sorteio/corrida";

/**
 * Desenho da corrida (canvas 2D, coordenadas de 1280×720), em visual
 * cyberpunk: a arena à noite com a cidade ao fundo, a torcida em silhueta com
 * bastões de luz, placas de LED, a pista escura com raias de neon, o pórtico
 * holográfico de chegada e os corredores — o próprio influencer correndo (ou
 * o boneco com o rosto), indo para a direita.
 */

export const W = 1280;
export const H = 720;
/** Comprimento da pista (metros) e quantos metros cabem na tela. */
export const PISTA_M = 100;
const VISIVEL_M = 22;
export const PX_M = W / VISIVEL_M;

/** Faixa da pista na tela (de cima, longe, para baixo, perto). */
const PISTA_TOPO = 0.47 * H;
const PISTA_PE = 0.95 * H;

export const AMARELO = "#ffe600";

/** Onde fica a raia (y do pé) e o tamanho do corredor nela (0 = mais longe). */
export function raia(i: number, raias: number): { y: number; escala: number } {
  const d = raias > 1 ? i / (raias - 1) : 1;
  return { y: PISTA_TOPO + 30 + d * (PISTA_PE - PISTA_TOPO - 42), escala: 0.62 + 0.38 * d };
}

/* ------------------------------------------------------------------ */
/* Visual cyberpunk: neon, cidade à noite e hologramas                  */
/* ------------------------------------------------------------------ */

/** Cores de neon da arena. */
export const NEON = {
  ciano: "#00f0ff",
  magenta: "#ff2bd6",
  roxo: "#8b5cf6",
  amarelo: AMARELO,
  laranja: "#ff8a3d",
  fundo: "#07060f",
} as const;

/** Caminho de painel com cantos cortados (o "chanfro" cyberpunk). */
export function caminhoChanfrado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c = 12) {
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

/** Espaço entre as letras (onde o navegador suporta). */
export function espacar(ctx: CanvasRenderingContext2D, valor: string) {
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = valor;
}

/** Painel de vidro escuro com borda neon brilhando e cantos cortados. */
export function painelNeon(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cor: string = NEON.ciano) {
  ctx.save();
  caminhoChanfrado(ctx, x, y, w, h);
  ctx.fillStyle = "rgba(8,6,20,0.82)";
  ctx.fill();
  ctx.shadowColor = cor;
  ctx.shadowBlur = 14;
  ctx.strokeStyle = cor;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Risco de luz no canto de cima.
  ctx.fillStyle = cor;
  ctx.fillRect(x + 14, y - 1, Math.min(70, w * 0.3), 3);
  ctx.restore();
}

/** Texto de neon: brilho da cor em volta e o miolo claro. */
export function textoNeon(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, cor: string, brilho = 14) {
  ctx.save();
  ctx.shadowColor = cor;
  ctx.shadowBlur = brilho;
  ctx.fillStyle = cor;
  ctx.fillText(texto, x, y);
  ctx.shadowBlur = 0;
  ctx.globalAlpha *= 0.85;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(texto, x, y);
  ctx.restore();
}

/** Texto com "glitch": cópias deslocadas em magenta e ciano atrás do texto. */
export function textoGlitch(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, cor: string, t: number) {
  const tremor = Math.sin(t * 37) > 0.93 ? 6 : 2.5;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "rgba(255,43,214,0.75)";
  ctx.fillText(texto, x - tremor, y);
  ctx.fillStyle = "rgba(0,240,255,0.75)";
  ctx.fillText(texto, x + tremor, y);
  ctx.restore();
  textoNeon(ctx, texto, x, y, cor, 22);
}

/* ------------------------------------------------------------------ */
/* Arena                                                                */
/* ------------------------------------------------------------------ */

interface Torcedor {
  x: number;
  fila: number;
  fase: number;
  /** Cor do bastão de luz (ou null: sem bastão). */
  luz: string | null;
}

const LUZES = [NEON.ciano, NEON.magenta, NEON.amarelo, NEON.roxo, "#7dffb2"];
const LARGURA_TORCIDA = 1700;
const FILAS = 7;
const LARGURA_CIDADE = 2400;

let torcida: Torcedor[] | null = null;
function aTorcida(): Torcedor[] {
  if (torcida) return torcida;
  const r = gerador(20261016);
  const lista: Torcedor[] = [];
  for (let fila = 0; fila < FILAS; fila++)
    for (let x = (fila % 2) * 11; x < LARGURA_TORCIDA; x += 19 + r() * 8)
      if (r() > 0.1)
        lista.push({ x, fila, fase: r() * Math.PI * 2, luz: r() > 0.45 ? LUZES[Math.floor(r() * LUZES.length)] : null });
  torcida = lista;
  return lista;
}

/** A cidade ao fundo (prédios com janelas acesas), desenhada uma vez. */
let cidade: HTMLCanvasElement | null = null;
function aCidade(): HTMLCanvasElement | null {
  if (cidade || typeof document === "undefined") return cidade;
  const c = document.createElement("canvas");
  c.width = LARGURA_CIDADE;
  c.height = 230;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const r = gerador(77);
  for (let x = 0; x < LARGURA_CIDADE; ) {
    const w = 40 + r() * 90;
    const h = 60 + r() * 165;
    ctx.fillStyle = r() > 0.5 ? "#0d0a1f" : "#120d2a";
    ctx.fillRect(x, 230 - h, w, h);
    // Janelas acesas.
    for (let wy = 230 - h + 8; wy < 222; wy += 9)
      for (let wx = x + 5; wx < x + w - 5; wx += 8)
        if (r() > 0.72) {
          ctx.fillStyle = r() > 0.6 ? "rgba(0,240,255,0.55)" : r() > 0.5 ? "rgba(255,43,214,0.5)" : "rgba(255,230,120,0.45)";
          ctx.fillRect(wx, wy, 3, 4);
        }
    // Antena com luz no topo de alguns.
    if (r() > 0.75) {
      ctx.fillStyle = "#2a1f4a";
      ctx.fillRect(x + w / 2 - 1, 230 - h - 18, 2, 18);
      ctx.fillStyle = NEON.magenta;
      ctx.fillRect(x + w / 2 - 2, 230 - h - 20, 4, 3);
    }
    x += w + r() * 6;
  }
  cidade = c;
  return c;
}

/**
 * O fundo: céu noturno, cidade com janelas acesas, feixes de holofote em
 * neon, faixas holográficas, arquibancada com a torcida em silhueta e bastões
 * de luz (sobem e balançam mais com a `empolgacao`) e as placas de LED na
 * frente. `camX` em metros.
 */
export function desenharGinasio(ctx: CanvasRenderingContext2D, camX: number, t: number, empolgacao: number, titulo: string) {
  // Céu.
  const ceu = ctx.createLinearGradient(0, 0, 0, PISTA_TOPO);
  ceu.addColorStop(0, "#05040d");
  ceu.addColorStop(0.55, "#1a0b2e");
  ceu.addColorStop(1, "#2d0f45");
  ctx.fillStyle = ceu;
  ctx.fillRect(0, 0, W, PISTA_TOPO);

  // Cidade ao fundo (bem devagar).
  const c = aCidade();
  if (c) {
    const dx = (camX * PX_M * 0.08) % LARGURA_CIDADE;
    for (let k = -1; k < 2; k++) ctx.drawImage(c, k * LARGURA_CIDADE - dx, 70);
  }

  // Feixes de holofote em neon, girando.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 4; i++) {
    const base = 160 + i * 320;
    const ang = Math.sin(t * 0.6 + i * 1.7) * 0.45;
    const cor = i % 2 ? "rgba(0,240,255," : "rgba(255,43,214,";
    const g = ctx.createLinearGradient(base, PISTA_TOPO, base + Math.sin(ang) * 400, 0);
    g.addColorStop(0, `${cor}0.28)`);
    g.addColorStop(1, `${cor}0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(base - 8, PISTA_TOPO);
    ctx.lineTo(base + 8, PISTA_TOPO);
    ctx.lineTo(base + Math.sin(ang) * 420 + 70, -20);
    ctx.lineTo(base + Math.sin(ang) * 420 - 70, -20);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Faixas holográficas no alto.
  const desloc = camX * PX_M * 0.25;
  ctx.save();
  ctx.font = "800 20px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  espacar(ctx, "3px");
  for (let i = -1; i < 6; i++) {
    const bx = i * 300 - (desloc % 300);
    const cor = i % 2 ? NEON.ciano : NEON.magenta;
    caminhoChanfrado(ctx, bx + 24, 16, 252, 40, 10);
    ctx.fillStyle = "rgba(10,6,24,0.75)";
    ctx.fill();
    ctx.shadowColor = cor;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = cor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.shadowBlur = 0;
    textoNeon(ctx, i % 2 ? "NIDO AI STUDIO" : titulo.length <= 18 ? titulo.toUpperCase() : "SORTEIO NIDO", bx + 150, 37, cor, 10);
  }
  ctx.restore();

  // Arquibancada: degraus escuros com fio de luz e a torcida em silhueta.
  const topo = 0.13 * H;
  const fundoArq = PISTA_TOPO - 34;
  const altFila = (fundoArq - topo) / FILAS;
  const deslocArq = camX * PX_M * 0.35;
  for (let f = 0; f < FILAS; f++) {
    ctx.fillStyle = f % 2 ? "rgba(17,13,34,0.92)" : "rgba(22,15,44,0.92)";
    ctx.fillRect(0, topo + f * altFila, W, altFila);
    ctx.fillStyle = f % 2 ? "rgba(0,240,255,0.18)" : "rgba(255,43,214,0.16)";
    ctx.fillRect(0, topo + (f + 1) * altFila - 1, W, 1);
  }
  const pulo = 1.2 + empolgacao * 5;
  const lista = aTorcida();
  // Silhuetas.
  ctx.fillStyle = "#0a0716";
  for (const p of lista) {
    let x = (p.x - (deslocArq % LARGURA_TORCIDA) + LARGURA_TORCIDA) % LARGURA_TORCIDA;
    if (x > W + 20) continue;
    x -= 10;
    const esc = 0.75 + (p.fila / FILAS) * 0.4;
    const y = topo + (p.fila + 1) * altFila - 3 - Math.max(0, Math.sin(t * (4 + empolgacao * 5) + p.fase)) * pulo * esc;
    ctx.beginPath();
    ctx.roundRect(x - 7 * esc, y - 14 * esc, 14 * esc, 14 * esc, 4 * esc);
    ctx.arc(x, y - 20 * esc, 6 * esc, 0, Math.PI * 2);
    ctx.fill();
  }
  // Bastões de luz (somados: brilham por cima).
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of lista) {
    if (!p.luz) continue;
    let x = (p.x - (deslocArq % LARGURA_TORCIDA) + LARGURA_TORCIDA) % LARGURA_TORCIDA;
    if (x > W + 20) continue;
    x -= 10;
    const esc = 0.75 + (p.fila / FILAS) * 0.4;
    const y = topo + (p.fila + 1) * altFila - 3 - Math.max(0, Math.sin(t * (4 + empolgacao * 5) + p.fase)) * pulo * esc;
    const balanco = Math.sin(t * (3 + empolgacao * 4) + p.fase) * (4 + empolgacao * 6) * esc;
    const lx = x + 6 * esc + balanco;
    const ly = y - (24 + empolgacao * 8) * esc;
    ctx.strokeStyle = p.luz;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 2.2 * esc;
    ctx.beginPath();
    ctx.moveTo(x + 5 * esc, y - 12 * esc);
    ctx.lineTo(lx, ly);
    ctx.stroke();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = p.luz;
    ctx.beginPath();
    ctx.arc(lx, ly, 6 * esc, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Placas de LED na frente da arquibancada (com linhas de varredura).
  const deslocPlaca = camX * PX_M * 0.8;
  ctx.fillStyle = "#04030a";
  ctx.fillRect(0, PISTA_TOPO - 34, W, 34);
  ctx.save();
  ctx.font = "900 19px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  espacar(ctx, "4px");
  for (let i = -1; i < 7; i++) {
    const px = i * 240 - (deslocPlaca % 240);
    const cor = i % 3 === 0 ? NEON.amarelo : i % 3 === 1 ? NEON.magenta : NEON.ciano;
    textoNeon(ctx, i % 3 === 0 ? "NIDO" : i % 3 === 1 ? "SORTEIO" : "AI STUDIO", px + 120, PISTA_TOPO - 17, cor, 12);
  }
  ctx.restore();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  for (let y = PISTA_TOPO - 34; y < PISTA_TOPO; y += 3) ctx.fillRect(0, y, W, 1);
  ctx.fillStyle = NEON.ciano;
  ctx.fillRect(0, PISTA_TOPO - 1, W, 1);
}

/**
 * A pista: piso escuro com grade, raias de neon ciano, marcas de distância em
 * magenta, largada e o pórtico holográfico de chegada (colunas de luz, laser
 * e a placa).
 */
export function desenharPista(ctx: CanvasRenderingContext2D, camX: number, raias: number, textoChegada: string) {
  const g = ctx.createLinearGradient(0, PISTA_TOPO, 0, PISTA_PE);
  g.addColorStop(0, "#0d0b1a");
  g.addColorStop(1, "#1b1233");
  ctx.fillStyle = g;
  ctx.fillRect(0, PISTA_TOPO, W, PISTA_PE - PISTA_TOPO);
  // Grade do piso (a cada 2 m), bem fraca.
  ctx.fillStyle = "rgba(139,92,246,0.14)";
  for (let x = -((camX * PX_M) % (PX_M * 2)); x < W; x += PX_M * 2) ctx.fillRect(x, PISTA_TOPO, 1, PISTA_PE - PISTA_TOPO);
  // Base da arena, embaixo.
  const base = ctx.createLinearGradient(0, PISTA_PE, 0, H);
  base.addColorStop(0, "#120c24");
  base.addColorStop(1, "#06040d");
  ctx.fillStyle = base;
  ctx.fillRect(0, PISTA_PE, W, H - PISTA_PE);
  ctx.fillStyle = NEON.magenta;
  ctx.fillRect(0, PISTA_PE, W, 2);
  // Raias de neon.
  ctx.save();
  ctx.strokeStyle = NEON.ciano;
  ctx.shadowColor = NEON.ciano;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 1.6;
  for (let i = 0; i <= raias; i++) {
    const y = i === 0 ? PISTA_TOPO + 6 : i === raias ? PISTA_PE - 4 : (raia(i - 1, raias).y + raia(i, raias).y) / 2;
    ctx.globalAlpha = i === 0 || i === raias ? 0.95 : 0.55;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();
  const naTela = (m: number) => (m - camX) * PX_M;
  // Marcas a cada 10 m.
  ctx.save();
  ctx.font = "700 15px ui-monospace, Consolas, monospace";
  ctx.textAlign = "center";
  for (let m = 10; m < PISTA_M; m += 10) {
    const x = naTela(m);
    if (x < -40 || x > W + 40) continue;
    ctx.fillStyle = "rgba(255,43,214,0.4)";
    ctx.fillRect(x - 1, PISTA_TOPO + 6, 2, PISTA_PE - PISTA_TOPO - 10);
    textoNeon(ctx, `${m}M`, x, PISTA_PE + 22, NEON.ciano, 8);
  }
  ctx.restore();
  // Largada.
  const xl = naTela(0);
  if (xl > -10 && xl < W + 10) {
    ctx.save();
    ctx.shadowColor = NEON.ciano;
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#e8feff";
    ctx.fillRect(xl - 2, PISTA_TOPO + 6, 4, PISTA_PE - PISTA_TOPO - 10);
    ctx.restore();
  }
  // Chegada: faixa quadriculada em neon e o pórtico holográfico.
  const xc = naTela(PISTA_M);
  if (xc > -200 && xc < W + 200) {
    const q = 10;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let y = PISTA_TOPO + 6, k = 0; y < PISTA_PE - 4; y += q, k++)
      for (let c = 0; c < 2; c++) {
        ctx.fillStyle = (k + c) % 2 ? "rgba(255,43,214,0.55)" : "rgba(0,240,255,0.55)";
        ctx.fillRect(xc - q + c * q, y, q, Math.min(q, PISTA_PE - 4 - y));
      }
    ctx.restore();
    ctx.save();
    // Colunas de luz.
    ctx.shadowColor = NEON.ciano;
    ctx.shadowBlur = 18;
    ctx.fillStyle = NEON.ciano;
    ctx.fillRect(xc - 12, 0.2 * H, 5, PISTA_TOPO + 10 - 0.2 * H);
    ctx.fillRect(xc + 17, 0.2 * H, 5, PISTA_TOPO + 10 - 0.2 * H);
    // Laser no alto.
    ctx.shadowColor = NEON.magenta;
    ctx.fillStyle = NEON.magenta;
    ctx.fillRect(xc - 120, 0.2 * H + 2, 260, 2);
    ctx.restore();
    painelNeon(ctx, xc - 110, 0.2 * H - 50, 240, 46, NEON.magenta);
    ctx.save();
    ctx.font = "900 26px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    espacar(ctx, "4px");
    textoNeon(ctx, textoChegada, xc + 10, 0.2 * H - 26, NEON.magenta, 16);
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* Corredor                                                             */
/* ------------------------------------------------------------------ */

/** A sombra do corredor no piso, com um aro de luz (amarelo para o destaque). */
function baseNeon(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, aro: string | null) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = aro ? "rgba(255,230,0,0.8)" : "rgba(0,240,255,0.55)";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = aro ? "rgba(255,230,0,0.12)" : "rgba(0,240,255,0.08)";
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 1.35, ry * 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export interface Figura {
  cor: string;
  foto: HTMLImageElement | null;
  inicial: string;
  pele: string;
}

/**
 * Um corredor com o pé em (x, y), no tamanho `s`. `fase` anda com a passada;
 * `correndo` = falso deixa parado (respirando) na largada. Para quem não tem
 * influencer (ou o desenho dele falhou). Devolve onde fica o topo da cabeça.
 */
export function desenharCorredor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  fase: number,
  correndo: boolean,
  f: Figura,
  aro: string | null,
): number {
  const pulo = correndo ? Math.abs(Math.sin(fase)) * 6 * s : Math.sin(fase * 0.5) * 1.5 * s;
  baseNeon(ctx, x, y, 26 * s, 6 * s, aro);
  const quadril = { x, y: y - 50 * s - pulo };
  const perna = (a: number, escura: boolean) => {
    const coxa = 25 * s;
    const canela = 25 * s;
    const joelho = { x: quadril.x + Math.sin(a) * coxa, y: quadril.y + Math.cos(a) * coxa };
    const dobra = correndo ? Math.max(0, -Math.sin(a + 0.6)) * 1.4 + 0.15 : 0.05;
    const b = a - dobra;
    const pe = { x: joelho.x + Math.sin(b) * canela, y: joelho.y + Math.cos(b) * canela };
    ctx.strokeStyle = escura ? "#1a1a22" : "#262633";
    ctx.lineWidth = 10 * s;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(quadril.x, quadril.y);
    ctx.lineTo(joelho.x, joelho.y);
    ctx.stroke();
    ctx.strokeStyle = escura ? shade(f.pele, 0.82) : f.pele;
    ctx.lineWidth = 8 * s;
    ctx.beginPath();
    ctx.moveTo(joelho.x, joelho.y);
    ctx.lineTo(pe.x, pe.y);
    ctx.stroke();
    ctx.fillStyle = escura ? "#cfcfcf" : "#ffffff";
    ctx.beginPath();
    ctx.ellipse(pe.x + 5 * s, pe.y + 2 * s, 9 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const ombro = { x: x + 2 * s, y: quadril.y - 40 * s };
  const braco = (a: number, escura: boolean) => {
    const cotovelo = { x: ombro.x + Math.sin(a) * 19 * s, y: ombro.y + Math.cos(a) * 19 * s };
    const mao = { x: cotovelo.x + Math.sin(a + (correndo ? 1.6 : 0.2)) * 17 * s, y: cotovelo.y + Math.cos(a + (correndo ? 1.6 : 0.2)) * 17 * s };
    ctx.strokeStyle = escura ? shade(f.pele, 0.8) : f.pele;
    ctx.lineWidth = 7 * s;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ombro.x, ombro.y);
    ctx.lineTo(cotovelo.x, cotovelo.y);
    ctx.lineTo(mao.x, mao.y);
    ctx.stroke();
  };
  const passo = correndo ? Math.sin(fase) * 0.95 : 0.08;
  perna(-passo, true);
  braco(passo * 1.1, true);
  // Tronco (camiseta).
  ctx.fillStyle = f.cor;
  ctx.beginPath();
  ctx.roundRect(x - 15 * s, quadril.y - 44 * s, 30 * s, 46 * s, 10 * s);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(x - 15 * s, quadril.y - 30 * s, 30 * s, 5 * s);
  perna(passo, false);
  braco(-passo * 1.1, false);
  // Cabeça com o rosto do influencer.
  const r = 30 * s;
  const cx = x + 3 * s;
  const cy = quadril.y - 44 * s - r * 0.85;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = f.cor;
  ctx.fill();
  if (f.foto && f.foto.complete && f.foto.naturalWidth) {
    ctx.clip();
    ctx.drawImage(f.foto, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = "#fff";
    ctx.font = `900 ${Math.round(r * 1.1)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(f.inicial, cx, cy + r * 0.06);
  }
  ctx.restore();
  ctx.strokeStyle = aro ?? "#ffffff";
  ctx.lineWidth = (aro ? 5 : 3) * s;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  return cy - r;
}

/** Altura do corredor que é o próprio influencer (no tamanho 1). */
export const ALTURA_FIGURA = 175;

/**
 * O próprio influencer correndo (a figura desenhada ao entrar no sorteio),
 * com o pé em (x, y): pula a cada passada, inclina e encolhe um pouco ao
 * pisar. Parado, só respira. Devolve onde fica o topo da cabeça.
 */
export function desenharFigura(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  fase: number,
  correndo: boolean,
  img: HTMLImageElement,
  aro: string | null,
): number {
  const h = ALTURA_FIGURA * s;
  const w = (h * img.naturalWidth) / img.naturalHeight;
  const pulo = correndo ? Math.abs(Math.sin(fase)) * 9 * s : Math.max(0, Math.sin(fase * 0.5)) * 1.5 * s;
  const pisada = correndo ? 1 - 0.05 * Math.max(0, Math.cos(fase * 2)) : 1;
  const inclina = correndo ? 0.04 + Math.sin(fase * 2) * 0.03 : 0;
  // Sombra com aro de luz (menor quando está no ar).
  baseNeon(ctx, x, y, w * 0.38 * (1 - pulo / (40 * s)), 6 * s, aro);
  ctx.save();
  ctx.translate(x, y - pulo);
  ctx.rotate(inclina);
  ctx.scale(1, pisada);
  if (aro) {
    ctx.shadowColor = aro;
    ctx.shadowBlur = 18 * s;
  }
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.restore();
  return y - pulo - h * pisada;
}

/** Plaquinha com o nome em cima do corredor (e a posição, para os 3 primeiros). `cabeca`: o topo do corredor. */
export function desenharNome(ctx: CanvasRenderingContext2D, x: number, cabeca: number, s: number, nome: string, lugar: number | null, destaque: boolean) {
  const topo = cabeca - 6 * s;
  ctx.save();
  ctx.font = `800 ${Math.round(15 * Math.max(0.8, s))}px system-ui, sans-serif`;
  const texto = lugar ? `${lugar}º ${nome}` : nome;
  const w = ctx.measureText(texto).width + 18;
  // Plaquinha de vidro com borda de luz; a de quem está vendo é amarela cheia.
  const cor = destaque || lugar === 1 ? NEON.amarelo : NEON.ciano;
  caminhoChanfrado(ctx, x - w / 2, topo - 24, w, 24, 6);
  ctx.fillStyle = destaque ? AMARELO : "rgba(8,6,20,0.8)";
  ctx.fill();
  ctx.strokeStyle = cor;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = destaque ? "#111" : lugar === 1 ? AMARELO : "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(texto, x, topo - 12);
  ctx.restore();
}

/** Clareia (f > 1) ou escurece (f < 1) uma cor #rrggbb. */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

const PELES = ["#f1c7a5", "#d9a37c", "#b97a56", "#8d5a3b", "#5e3a26", "#f6d9c2"];

/** Pele do corredor genérico (sem influencer), sempre a mesma para o mesmo id. */
export function peleDe(id: string): string {
  let h = 7;
  for (const c of id) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  return PELES[h % PELES.length];
}

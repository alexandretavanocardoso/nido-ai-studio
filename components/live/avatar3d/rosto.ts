import * as THREE from "three";
import type { Expressao } from "./rastreio";
import {
  BASE_NARIZ,
  CANTO_BOCA_D,
  CANTO_BOCA_E,
  distancia,
  LABIO_INF_INTERNO,
  LABIO_SUP_INTERNO,
  lerp,
  media,
  OLHO_D,
  OLHO_E,
  QUEIXO,
  reamostrar,
  SOBRANCELHA_D,
  SOBRANCELHA_E,
  suave,
  yEm,
  type P2,
} from "./pontos";

/**
 * O rosto que mexe. O modelo 3D vem com o rosto pintado na textura (olhos
 * abertos, boca fechada); esta camada é uma imagem do rosto visto de frente
 * que o material da cabeça projeta por cima, só nos olhos, sobrancelhas e
 * boca. A cada quadro ela é redesenhada a partir da própria textura:
 *  - boca: a parte de baixo desce (e a de cima sobe um pouco), e o vão vira o
 *    interior da boca (dentes em cima, língua embaixo); sorriso e bico puxam
 *    os cantos;
 *  - olhos: a pálpebra desce, da cor da pele em volta, com a linha dos cílios;
 *  - sobrancelhas: sobem ou descem.
 * Parada (expressão neutra), a camada é igual à textura: não aparece emenda.
 *
 * Coordenadas: o "espaço do rosto" é o quadrado da câmera de frente, de 0 a 1,
 * com y para cima.
 */

const N = 64; // grade que deforma a imagem
const K_BOCA = 18;
const K_OLHO = 12;

const linear = (hex: string) => new THREE.Color(hex);
const COR = {
  dentes: linear("#d8d0c4"),
  boca: linear("#5a1c22"),
  fundo: linear("#250b0e"),
  lingua: linear("#b04d57"),
  cilios: linear("#241917"),
};

interface Olho {
  cima: P2[];
  baixo: P2[];
  largura: number;
  /** Abertura máxima (do canto ao meio): olho quase fechado (ou óculos escuros) não pisca. */
  pisca: boolean;
  pele: THREE.Color;
  palpebra: THREE.Mesh;
  cilios: THREE.Mesh;
}

interface Sobrancelha {
  centro: P2;
  largura: number;
}

const VERT_GRADE = /* glsl */ `
varying vec2 vUv;
varying vec2 vPos;
void main() {
  vUv = uv;
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG_GRADE = /* glsl */ `
uniform sampler2D base;
uniform sampler2D mascara;
varying vec2 vUv;
varying vec2 vPos;
void main() {
  gl_FragColor = vec4(texture2D(base, vUv).rgb, texture2D(mascara, vPos).r);
}`;

const VERT_BOCA = /* glsl */ `
attribute float aS;
attribute float aD;
attribute float aAb;
varying float vS;
varying float vD;
varying float vAb;
void main() {
  vS = aS; vD = aD; vAb = aAb;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG_BOCA = /* glsl */ `
uniform vec3 cDentes;
uniform vec3 cBoca;
uniform vec3 cFundo;
uniform vec3 cLingua;
uniform float dentes;
varying float vS;
varying float vD;
varying float vAb;
void main() {
  float centro = 1.0 - pow(abs(vS * 2.0 - 1.0), 3.0);
  float fundo = vD / max(vAb, 1e-5);
  vec3 c = mix(cBoca, cFundo, smoothstep(0.0, 0.55, fundo));
  c = mix(c, cLingua, smoothstep(0.6, 0.95, fundo) * centro * 0.85);
  float h = dentes * centro;
  c = mix(c, cDentes, (1.0 - smoothstep(h * 0.75, h, vD)) * step(0.001, h));
  gl_FragColor = vec4(c, 1.0);
}`;

const VERT_COR = /* glsl */ `
attribute vec4 aCor;
varying vec4 vCor;
void main() {
  vCor = aCor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG_COR = /* glsl */ `
uniform float opacidade;
varying vec4 vCor;
void main() {
  gl_FragColor = vec4(vCor.rgb, vCor.a * opacidade);
}`;

/** Malha em faixa: `linhas` linhas de `k` pontos, com triângulos entre linhas vizinhas. */
function faixa(linhas: number, k: number, atributos: Record<string, number>): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(linhas * k * 3), 3));
  for (const [nome, tam] of Object.entries(atributos))
    g.setAttribute(nome, new THREE.BufferAttribute(new Float32Array(linhas * k * tam), tam));
  const idx: number[] = [];
  for (let l = 0; l < linhas - 1; l++)
    for (let i = 0; i < k - 1; i++) {
      const a = l * k + i;
      const b = a + k;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  g.setIndex(idx);
  return g;
}

function porPonto(g: THREE.BufferGeometry, nome: string, i: number, ...v: number[]) {
  const a = g.getAttribute(nome) as THREE.BufferAttribute;
  for (let j = 0; j < v.length; j++) a.array[i * a.itemSize + j] = v[j];
}

export class CamadaDoRosto {
  /** O que o material da cabeça lê (linear, com alfa = onde a camada vale). */
  readonly alvo: THREE.WebGLRenderTarget;
  private cena = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  private grade: THREE.Mesh;
  private bocaMalha: THREE.Mesh;
  private mascara: THREE.CanvasTexture;
  private olhos: Olho[];
  private sobrancelhas: Sobrancelha[];
  private sup: P2[];
  private inf: P2[];
  private larguraBoca: number;
  private cantos: [P2, P2];
  private queixoY: number;
  private narizY: number;
  private linhaBoca: P2[];

  /**
   * @param base a textura vista de frente (cor pura, sem luz), linear
   * @param pts os 468 pontos achados nela, no espaço do rosto
   * @param pixel lê a cor (sRGB 0..255) num ponto do espaço do rosto
   */
  constructor(
    private renderer: THREE.WebGLRenderer,
    base: THREE.Texture,
    pts: P2[],
    pixel: (p: P2) => [number, number, number],
  ) {
    this.alvo = new THREE.WebGLRenderTarget(1024, 1024, { type: THREE.HalfFloatType, depthBuffer: false });
    const ponto = (i: number) => pts[i];

    // Boca: os lábios por dentro (de canto a canto), refeitos com pontos casados.
    this.sup = reamostrar(LABIO_SUP_INTERNO.map(ponto), K_BOCA);
    this.inf = reamostrar(LABIO_INF_INTERNO.map(ponto), K_BOCA);
    this.linhaBoca = this.sup.map((p, i) => ({ x: p.x, y: (p.y + this.inf[i].y) / 2 }));
    this.cantos = [ponto(CANTO_BOCA_D), ponto(CANTO_BOCA_E)];
    this.larguraBoca = distancia(this.cantos[0], this.cantos[1]);
    this.queixoY = ponto(QUEIXO).y;
    this.narizY = ponto(BASE_NARIZ).y;

    this.sobrancelhas = [SOBRANCELHA_D, SOBRANCELHA_E].map((s) => {
      const ps = s.map(ponto);
      return { centro: media(ps), largura: distancia(ps[0], ps[ps.length - 1]) };
    });

    // Grade: a imagem do rosto inteira, que deforma.
    const grade = new THREE.BufferGeometry();
    const pos = new Float32Array(N * N * 3);
    const uv = new Float32Array(N * N * 2);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        uv[k * 2] = pos[k * 3] = i / (N - 1);
        uv[k * 2 + 1] = pos[k * 3 + 1] = j / (N - 1);
      }
    grade.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    grade.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    const idx: number[] = [];
    for (let j = 0; j < N - 1; j++)
      for (let i = 0; i < N - 1; i++) {
        const a = j * N + i;
        idx.push(a, a + 1, a + N, a + 1, a + N + 1, a + N);
      }
    grade.setIndex(idx);
    this.mascara = this.criarMascara(pts);
    this.grade = new THREE.Mesh(
      grade,
      new THREE.ShaderMaterial({
        uniforms: { base: { value: base }, mascara: { value: this.mascara } },
        vertexShader: VERT_GRADE,
        fragmentShader: FRAG_GRADE,
        blending: THREE.NoBlending,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.grade.frustumCulled = false;
    this.cena.add(this.grade);

    // Interior da boca: faixa do lábio de cima ao de baixo.
    this.bocaMalha = new THREE.Mesh(
      faixa(2, K_BOCA, { aS: 1, aD: 1, aAb: 1 }),
      new THREE.ShaderMaterial({
        uniforms: {
          cDentes: { value: COR.dentes },
          cBoca: { value: COR.boca },
          cFundo: { value: COR.fundo },
          cLingua: { value: COR.lingua },
          dentes: { value: 0 },
        },
        vertexShader: VERT_BOCA,
        fragmentShader: FRAG_BOCA,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.bocaMalha.frustumCulled = false;
    this.bocaMalha.renderOrder = 1;
    this.cena.add(this.bocaMalha);

    this.olhos = [OLHO_D, OLHO_E].map((o) => this.criarOlho(o.cima.map(ponto), o.baixo.map(ponto), pixel));
  }

  /** Onde a camada vale: elipses suaves nos olhos (com as sobrancelhas) e na boca (até o queixo). */
  private criarMascara(pts: P2[]): THREE.CanvasTexture {
    const L = 512;
    const c = document.createElement("canvas");
    c.width = c.height = L;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, L, L);
    ctx.globalCompositeOperation = "lighten";
    const elipse = (cx: number, cy: number, rx: number, ry: number, miolo = 0.72) => {
      ctx.save();
      ctx.translate(cx * L, (1 - cy) * L);
      ctx.scale(rx * L, ry * L);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, "#fff");
      g.addColorStop(miolo, "#fff");
      g.addColorStop(1, "#000");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    for (const [olho, sobr] of [
      [OLHO_D, SOBRANCELHA_D],
      [OLHO_E, SOBRANCELHA_E],
    ] as const) {
      const cantos = [pts[olho.cima[0]], pts[olho.cima[olho.cima.length - 1]]];
      const largura = distancia(cantos[0], cantos[1]);
      const baixo = Math.min(...olho.baixo.map((i) => pts[i].y)) - 0.25 * largura;
      const topo = Math.max(...sobr.map((i) => pts[i].y)) + 0.3 * largura;
      const cx = (cantos[0].x + cantos[1].x) / 2;
      const meioS = media(sobr.map((i) => pts[i]));
      elipse((cx + meioS.x) / 2, (baixo + topo) / 2, 0.95 * largura, (topo - baixo) / 2 + 0.1 * largura);
    }
    const bd = pts[CANTO_BOCA_D];
    const be = pts[CANTO_BOCA_E];
    const larg = distancia(bd, be);
    const topo = pts[BASE_NARIZ].y;
    const pe = pts[QUEIXO].y;
    elipse((bd.x + be.x) / 2, (topo + pe) / 2, 0.95 * larg, (topo - pe) / 2 + 0.06 * larg, 0.68);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    return t;
  }

  private criarOlho(cimaPts: P2[], baixoPts: P2[], pixel: (p: P2) => [number, number, number]): Olho {
    const cima = reamostrar(cimaPts, K_OLHO);
    const baixo = reamostrar(baixoPts, K_OLHO);
    const largura = distancia(cima[0], cima[K_OLHO - 1]);
    const abertura = Math.max(...cima.map((p, i) => p.y - baixo[i].y));
    // Cor da pálpebra: a pele logo acima e logo abaixo do olho. Fica a do meio
    // (mediana pelo brilho): sobrancelha clara ou cílio escuro não puxam a cor.
    const amostras: [number, number, number][] = [];
    for (let i = 2; i < K_OLHO - 2; i++) {
      const ab = Math.max(0, cima[i].y - baixo[i].y);
      amostras.push(pixel({ x: cima[i].x, y: cima[i].y + 0.3 * ab + 0.04 * largura }));
      amostras.push(pixel({ x: baixo[i].x, y: baixo[i].y - 0.18 * largura }));
    }
    amostras.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
    const meio = amostras.slice(Math.floor(amostras.length * 0.3), Math.ceil(amostras.length * 0.7));
    const m = [0, 1, 2].map((c) => meio.reduce((s, a) => s + a[c], 0) / meio.length / 255);
    const pele = new THREE.Color().setRGB(m[0], m[1], m[2], THREE.SRGBColorSpace);
    const material = () =>
      new THREE.ShaderMaterial({
        uniforms: { opacidade: { value: 0 } },
        vertexShader: VERT_COR,
        fragmentShader: FRAG_COR,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    const palpebra = new THREE.Mesh(faixa(3, K_OLHO, { aCor: 4 }), material());
    const cilios = new THREE.Mesh(faixa(2, K_OLHO, { aCor: 4 }), material());
    for (const [malha, ordem] of [
      [palpebra, 2],
      [cilios, 3],
    ] as const) {
      malha.frustumCulled = false;
      malha.renderOrder = ordem;
      malha.visible = false;
      this.cena.add(malha);
    }
    return { cima, baixo, largura, pisca: abertura > 0.12 * largura, pele, palpebra, cilios };
  }

  /**
   * Quanto um ponto do rosto anda nesta expressão. `abaixoDaBoca`: o ponto
   * está do lado de baixo do vão da boca (lábio de baixo, queixo).
   */
  private deslocamento(p: P2, e: Expressao, abaixoDaBoca: boolean | null): P2 {
    let dx = 0;
    let dy = 0;
    const L = this.larguraBoca;
    const xa = this.sup[0].x;
    const xb = this.sup[K_BOCA - 1].x;
    const abertura = e.boca * 0.34 * L;
    if (abertura > 0 && p.x > xa && p.x < xb) {
      const perfil = Math.pow(Math.sin((Math.PI * (p.x - xa)) / (xb - xa)), 0.8);
      const ym = yEm(this.linhaBoca, p.x);
      const baixo = abaixoDaBoca ?? p.y < ym;
      if (baixo) dy -= abertura * 0.85 * perfil * suave(this.queixoY, ym, p.y);
      else dy += abertura * 0.15 * perfil * (1 - suave(ym, this.narizY, p.y));
    }
    // Sorriso e bico: os cantos da boca vão para fora (e para cima) ou para dentro.
    const s2 = 2 * (0.35 * L) ** 2;
    this.cantos.forEach((c, i) => {
      const g = Math.exp(-((p.x - c.x) ** 2 + (p.y - c.y) ** 2) / s2);
      const lado = i === 0 ? -1 : 1;
      dx += lado * (e.sorriso * 0.1 - e.bico * 0.14) * L * g;
      dy += e.sorriso * 0.05 * L * g;
    });
    // Sobrancelhas.
    for (const s of this.sobrancelhas) {
      const g = Math.exp(-((p.x - s.centro.x) ** 2 / (2 * (0.6 * s.largura) ** 2) + (p.y - s.centro.y) ** 2 / (2 * (0.45 * s.largura) ** 2)));
      dy += (e.sobrancelha > 0 ? 0.13 : 0.09) * e.sobrancelha * s.largura * g;
    }
    return { x: dx, y: dy };
  }

  /** Redesenha a camada para esta expressão. */
  desenhar(e: Expressao) {
    // Grade deformada.
    const pos = this.grade.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const p = { x: i / (N - 1), y: j / (N - 1) };
        const d = this.deslocamento(p, e, null);
        pos.setXY(j * N + i, p.x + d.x, p.y + d.y);
      }
    pos.needsUpdate = true;

    // Boca: da linha onde os lábios se encostam, o de cima sobe um pouco e o de
    // baixo desce; parada, não há vão (a textura já tem a boca fechada).
    const g = this.bocaMalha.geometry;
    let maior = 0;
    for (let i = 0; i < K_BOCA; i++) {
      const s = this.linhaBoca[i];
      const b = this.linhaBoca[i];
      const ds = this.deslocamento(s, e, false);
      const db = this.deslocamento(b, e, true);
      const cima = { x: s.x + ds.x, y: s.y + ds.y };
      const baixo = { x: b.x + db.x, y: b.y + db.y };
      const ab = Math.max(0, cima.y - baixo.y);
      maior = Math.max(maior, ab);
      porPonto(g, "position", i, cima.x, cima.y, 0);
      porPonto(g, "position", K_BOCA + i, baixo.x, baixo.y, 0);
      porPonto(g, "aS", i, i / (K_BOCA - 1));
      porPonto(g, "aS", K_BOCA + i, i / (K_BOCA - 1));
      porPonto(g, "aD", i, 0);
      porPonto(g, "aD", K_BOCA + i, ab);
      porPonto(g, "aAb", i, ab);
      porPonto(g, "aAb", K_BOCA + i, ab);
    }
    for (const n of ["position", "aS", "aD", "aAb"]) g.getAttribute(n).needsUpdate = true;
    (this.bocaMalha.material as THREE.ShaderMaterial).uniforms.dentes.value = Math.min(0.05 * this.larguraBoca, 0.3 * maior);
    this.bocaMalha.visible = maior > 0.002;

    this.olhos.forEach((o, i) => this.desenharOlho(o, i === 0 ? e.piscarD : e.piscarE, e));

    const r = this.renderer;
    const antes = r.getRenderTarget();
    const cor = r.getClearColor(new THREE.Color());
    const alfa = r.getClearAlpha();
    r.setRenderTarget(this.alvo);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.cena, this.camera);
    r.setRenderTarget(antes);
    r.setClearColor(cor, alfa);
  }

  private desenharOlho(o: Olho, fechado: number, e: Expressao) {
    const opac = o.pisca ? suave(0.02, 0.12, fechado) : 0;
    o.palpebra.visible = o.cilios.visible = opac > 0;
    if (!opac) return;
    const b = fechado * fechado * (3 - 2 * fechado);
    const gp = o.palpebra.geometry;
    const gc = o.cilios.geometry;
    const esp = 0.05 * o.largura; // espessura dos cílios
    for (let i = 0; i < K_OLHO; i++) {
      // A pálpebra acompanha a sobrancelha (a grade também desloca o olho todo).
      const d = this.deslocamento(o.cima[i], e, null);
      const c = { x: o.cima[i].x + d.x, y: o.cima[i].y + d.y };
      const bx = o.baixo[i];
      const ab = Math.max(0, c.y - bx.y);
      const borda = { x: lerp(c.x, bx.x, b), y: lerp(c.y, bx.y, b) };
      const topo = c.y + 0.35 * ab + 0.02 * o.largura;
      porPonto(gp, "position", i, c.x, topo, 0);
      porPonto(gp, "position", K_OLHO + i, c.x, c.y, 0);
      porPonto(gp, "position", 2 * K_OLHO + i, borda.x, borda.y, 0);
      const { r, g, b: az } = o.pele;
      porPonto(gp, "aCor", i, r, g, az, 0);
      porPonto(gp, "aCor", K_OLHO + i, r * 0.94, g * 0.92, az * 0.92, 1);
      porPonto(gp, "aCor", 2 * K_OLHO + i, r * 0.8, g * 0.77, az * 0.77, 1);
      const cl = COR.cilios;
      porPonto(gc, "position", i, borda.x, borda.y + esp * 0.3, 0);
      porPonto(gc, "position", K_OLHO + i, borda.x, borda.y - esp * 0.7, 0);
      // Os cílios afinam nos cantos.
      const ponta = Math.sin((Math.PI * i) / (K_OLHO - 1)) ** 0.5;
      porPonto(gc, "aCor", i, cl.r, cl.g, cl.b, ponta);
      porPonto(gc, "aCor", K_OLHO + i, cl.r, cl.g, cl.b, ponta);
    }
    for (const g of [gp, gc]) {
      g.getAttribute("position").needsUpdate = true;
      g.getAttribute("aCor").needsUpdate = true;
    }
    (o.palpebra.material as THREE.ShaderMaterial).uniforms.opacidade.value = opac;
    (o.cilios.material as THREE.ShaderMaterial).uniforms.opacidade.value = opac;
  }

  dispose() {
    this.alvo.dispose();
    this.mascara.dispose();
    this.cena.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}

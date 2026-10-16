import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { NEUTRA, type Expressao } from "./rastreio";
import { calcularJuntas, OSSOS, pesos, type Juntas, type V3 } from "./rig";
import { CamadaDoRosto } from "./rosto";
import { LATERAL_D, LATERAL_E, QUEIXO, TESTA, type P2 } from "./pontos";

/**
 * O avatar 3D na tela: carrega o modelo do fal (.glb), acha o rosto nele,
 * monta o esqueleto e a camada do rosto, e desenha a cena (luz, fundo e
 * câmera do peito para cima) num canvas 1280×720 que vira o vídeo da live.
 */

export const LARGURA = 1280;
export const ALTURA = 720;
/** Imagem que o MediaPipe procura no modelo (quadrada). */
const LADO_BUSCA = 1024;

/** Quanto do giro da cabeça fica no pescoço (o resto é da cabeça). */
const PARTE_PESCOCO = 0.35;

interface Malha {
  geometria: THREE.BufferGeometry;
  mapa: THREE.Texture | null;
  cor: THREE.Color;
}

export interface OpcoesAvatar {
  /** Endereço do .glb. */
  modelo: string;
  /** Imagem do fundo (16:9 de preferência); sem ela, um fundo de estúdio. */
  fundo?: string | null;
  /** Acha os 468 pontos do rosto numa imagem (fração, y para baixo). */
  acharRosto: (img: HTMLCanvasElement) => Promise<P2[] | null>;
}

export class Avatar3D {
  readonly canvas: HTMLCanvasElement;
  /** Sem rosto achado no modelo, ele só mexe a cabeça (não pisca nem fala). */
  readonly temRosto: boolean;
  private renderer: THREE.WebGLRenderer;
  private cena = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private ossos: Record<(typeof OSSOS)[number], THREE.Bone>;
  private repousoPeito: THREE.Vector3;
  private rosto: CamadaDoRosto | null;
  private descartaveis: { dispose(): void }[] = [];

  private constructor(o: {
    canvas: HTMLCanvasElement;
    renderer: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
    ossos: Record<(typeof OSSOS)[number], THREE.Bone>;
    rosto: CamadaDoRosto | null;
  }) {
    this.canvas = o.canvas;
    this.renderer = o.renderer;
    this.camera = o.camera;
    this.ossos = o.ossos;
    this.repousoPeito = o.ossos.peito.position.clone();
    this.rosto = o.rosto;
    this.temRosto = !!o.rosto;
  }

  static async carregar(o: OpcoesAvatar): Promise<Avatar3D> {
    const gltf = await new GLTFLoader().loadAsync(o.modelo);
    // Cada malha com a transformação do nó já aplicada: tudo no espaço do modelo.
    gltf.scene.updateMatrixWorld(true);
    const malhas: Malha[] = [];
    gltf.scene.traverse((n) => {
      if (!(n instanceof THREE.Mesh)) return;
      const geometria = (n.geometry as THREE.BufferGeometry).clone().applyMatrix4(n.matrixWorld);
      if (!geometria.getAttribute("normal")) geometria.computeVertexNormals();
      const m = (Array.isArray(n.material) ? n.material[0] : n.material) as THREE.MeshStandardMaterial;
      malhas.push({ geometria, mapa: m?.map ?? null, cor: m?.color?.clone() ?? new THREE.Color(0xcccccc) });
    });
    if (!malhas.length) throw new Error("O modelo 3D veio vazio.");
    const caixa = new THREE.Box3();
    for (const m of malhas) {
      m.geometria.computeBoundingBox();
      caixa.union(m.geometria.boundingBox!);
    }

    const busca = await acharRostoNoModelo(malhas, caixa, o.acharRosto);
    const juntas = busca ? busca.juntas : juntasSemRosto(malhas, caixa);

    const canvas = document.createElement("canvas");
    canvas.width = LARGURA;
    canvas.height = ALTURA;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(1);
    renderer.setSize(LARGURA, ALTURA, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;

    // Esqueleto: raiz → peito → pescoço → cabeça, nas juntas achadas.
    const ossos = Object.fromEntries(OSSOS.map((n) => [n, new THREE.Bone()])) as Record<(typeof OSSOS)[number], THREE.Bone>;
    const em = (v: V3) => new THREE.Vector3(v.x, v.y, v.z);
    ossos.raiz.position.copy(em(juntas.raiz));
    ossos.peito.position.copy(em(juntas.peito).sub(em(juntas.raiz)));
    ossos.pescoco.position.copy(em(juntas.pescoco).sub(em(juntas.peito)));
    ossos.cabeca.position.copy(em(juntas.cabeca).sub(em(juntas.pescoco)));
    ossos.raiz.add(ossos.peito);
    ossos.peito.add(ossos.pescoco);
    ossos.pescoco.add(ossos.cabeca);
    for (const b of Object.values(ossos)) b.rotation.order = "YXZ";
    ossos.raiz.updateMatrixWorld(true);
    const esqueleto = new THREE.Skeleton(OSSOS.map((n) => ossos[n]));

    // Câmera de frente do rosto (a mesma em que os pontos foram achados).
    const rostoCam = busca?.camera ?? null;
    const corpo: THREE.SkinnedMesh[] = [];
    const materiais: { padrao: THREE.MeshStandardMaterial; cor: THREE.MeshBasicMaterial }[] = [];
    const uniformRosto = { value: null as THREE.Texture | null };
    for (const m of malhas) {
      const g = m.geometria;
      const p = g.getAttribute("position");
      const idx = new Uint16Array(p.count * 4);
      const w = new Float32Array(p.count * 4);
      for (let i = 0; i < p.count; i++) {
        idx.set([0, 1, 2, 3], i * 4);
        w.set(pesos(p.getX(i), p.getY(i), juntas), i * 4);
      }
      g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(idx, 4));
      g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(w, 4));
      const padrao = new THREE.MeshStandardMaterial({ map: m.mapa, color: m.mapa ? 0xffffff : m.cor, metalness: 0, roughness: 0.82 });
      if (rostoCam) projetarRosto(padrao, rostoCam, uniformRosto);
      const cor = new THREE.MeshBasicMaterial({ map: m.mapa, color: m.mapa ? 0xffffff : m.cor });
      materiais.push({ padrao, cor });
      const s = new THREE.SkinnedMesh(g, padrao);
      s.frustumCulled = false;
      corpo.push(s);
    }
    const raizCena = new THREE.Group();
    raizCena.add(ossos.raiz);
    for (const s of corpo) {
      raizCena.add(s);
      s.bind(esqueleto, new THREE.Matrix4());
    }

    // A camada do rosto lê a textura vista de frente (cor pura), desenhada aqui uma vez.
    let rosto: CamadaDoRosto | null = null;
    if (busca && rostoCam) {
      const base = new THREE.WebGLRenderTarget(1024, 1024, { type: THREE.HalfFloatType });
      const cenaCor = new THREE.Scene();
      cenaCor.add(raizCena);
      corpo.forEach((s, i) => (s.material = materiais[i].cor));
      renderer.setRenderTarget(base);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(cenaCor, rostoCam);
      renderer.setRenderTarget(null);
      corpo.forEach((s, i) => (s.material = materiais[i].padrao));
      rosto = new CamadaDoRosto(renderer, base.texture, busca.pontos, busca.pixel);
      uniformRosto.value = rosto.alvo.texture;
    }

    const avatar = new Avatar3D({
      canvas,
      renderer,
      camera: enquadrar(juntas, caixa),
      ossos,
      rosto,
    });
    avatar.cena.add(raizCena);
    avatar.iluminar(juntas);
    await avatar.trocarFundo(o.fundo ?? null);
    avatar.descartaveis.push(...malhas.map((m) => m.geometria), ...materiais.flatMap((m) => [m.padrao, m.cor]));
    avatar.desenhar(NEUTRA, 0);
    return avatar;
  }

  private iluminar(j: Juntas) {
    const h = j.alturaRosto;
    const alvo = new THREE.Object3D();
    alvo.position.set(j.cx, j.queixoY, j.cabeca.z);
    this.cena.add(alvo);
    // A textura já vem com sombra pintada (do desenho): luz suave, sem contraste forte.
    this.cena.add(new THREE.HemisphereLight(0xffffff, 0x9a8f88, 1.7));
    const luz = (cor: number, forca: number, x: number, y: number, z: number) => {
      const l = new THREE.DirectionalLight(cor, forca);
      l.position.set(j.cx + x * h, j.queixoY + y * h, j.cabeca.z + z * h);
      l.target = alvo;
      this.cena.add(l);
    };
    luz(0xfff4e8, 1.1, -3, 4, 6); // principal, do alto à esquerda
    luz(0xe8f0ff, 0.5, 4, 1, 4); // preenchimento
    luz(0xffffff, 0.8, 0, 4, -6); // contorno, por trás
  }

  /** Troca o fundo: uma imagem (cobrindo o quadro) ou o fundo de estúdio. */
  async trocarFundo(url: string | null) {
    const antigo = this.cena.background;
    if (url) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // ImageBitmap não é virado pela placa: já vem virado daqui.
        const bmp = await createImageBitmap(await res.blob(), { imageOrientation: "flipY" });
        const t = new THREE.Texture(bmp);
        t.flipY = false;
        t.colorSpace = THREE.SRGBColorSpace;
        t.needsUpdate = true;
        // Cobre o quadro 16:9 sem distorcer (corta as sobras).
        const ai = bmp.width / bmp.height;
        const ac = LARGURA / ALTURA;
        if (ai > ac) {
          t.repeat.set(ac / ai, 1);
          t.offset.set((1 - ac / ai) / 2, 0);
        } else {
          t.repeat.set(1, ai / ac);
          t.offset.set(0, (1 - ai / ac) / 2);
        }
        this.cena.background = t;
      } catch (e) {
        console.warn("[avatar3d] fundo", (e as Error).message);
        this.cena.background = fundoDeEstudio();
      }
    } else this.cena.background = fundoDeEstudio();
    if (antigo instanceof THREE.Texture) antigo.dispose();
  }

  /** Desenha um quadro com esta expressão (`t` em segundos, para a respiração). */
  desenhar(e: Expressao, t: number) {
    const { cabeca, pescoco, peito } = this.ossos;
    const parte = (f: number) => [e.pitch * f, e.yaw * f, e.roll * f] as const;
    pescoco.rotation.set(...parte(PARTE_PESCOCO));
    cabeca.rotation.set(...parte(1 - PARTE_PESCOCO));
    // O peito acompanha um pouco o giro e a inclinação, e respira.
    const resp = Math.sin((t * Math.PI * 2) / 4.2);
    peito.rotation.set(-0.012 * resp, e.yaw * 0.12, e.roll * 0.06 - e.inclinacao * 0.05);
    peito.position.copy(this.repousoPeito);
    peito.position.y += resp * 0.0025;
    this.rosto?.desenhar(e);
    this.renderer.render(this.cena, this.camera);
  }

  /** O vídeo do canvas (cada quadro desenhado vai junto). */
  stream(fps = 30): MediaStream {
    return this.canvas.captureStream(fps);
  }

  dispose() {
    this.rosto?.dispose();
    for (const d of this.descartaveis) d.dispose();
    if (this.cena.background instanceof THREE.Texture) this.cena.background.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/* ------------------------------------------------------------------ */
/* Preparação: achar o rosto no modelo                                  */
/* ------------------------------------------------------------------ */

interface Busca {
  juntas: Juntas;
  camera: THREE.OrthographicCamera;
  /** Os 468 pontos no espaço do rosto (0..1, y para cima). */
  pontos: P2[];
  pixel: (p: P2) => [number, number, number];
}

/**
 * Desenha o modelo de frente (só a cor da textura, sem luz) e procura o rosto
 * com o MediaPipe: primeiro o modelo inteiro, depois de perto, no rosto. Com
 * os pontos, mede o rosto em 3D (raios na malha) e calcula as juntas.
 */
async function acharRostoNoModelo(
  malhas: Malha[],
  caixa: THREE.Box3,
  acharRosto: OpcoesAvatar["acharRosto"],
): Promise<Busca | null> {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = LADO_BUSCA;
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(LADO_BUSCA, LADO_BUSCA, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  const cena = new THREE.Scene();
  cena.background = new THREE.Color(0x8a8a8a);
  const objetos = malhas.map(
    (m) => new THREE.Mesh(m.geometria, new THREE.MeshBasicMaterial({ map: m.mapa, color: m.mapa ? 0xffffff : m.cor })),
  );
  cena.add(...objetos);
  try {
    const centro = caixa.getCenter(new THREE.Vector3());
    const tam = caixa.getSize(new THREE.Vector3());
    const frente = (cx: number, cy: number, lado: number) => {
      const c = new THREE.OrthographicCamera(cx - lado / 2, cx + lado / 2, cy + lado / 2, cy - lado / 2, 0.001, tam.z * 4 + 10);
      c.position.set(0, 0, caixa.max.z + 1);
      c.lookAt(0, 0, -1e6);
      c.updateProjectionMatrix();
      c.updateMatrixWorld(true);
      return c;
    };
    // 1) O modelo inteiro.
    const ladoTodo = Math.max(tam.x, tam.y) * 1.05;
    const camTodo = frente(centro.x, centro.y, ladoTodo);
    r.render(cena, camTodo);
    const p1 = await acharRosto(canvas);
    if (!p1) return null;
    const noModelo = (p: P2, cam: THREE.OrthographicCamera) => ({
      x: cam.left + p.x * (cam.right - cam.left),
      y: cam.top - p.y * (cam.top - cam.bottom),
    });
    const ps1 = p1.map((p) => noModelo(p, camTodo));
    const xs = ps1.map((p) => p.x);
    const ys = ps1.map((p) => p.y);
    const lado = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.45;
    // 2) De perto: o rosto ocupa a imagem (os pontos saem mais precisos).
    const camRosto = frente((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, lado);
    r.render(cena, camRosto);
    const p2 = (await acharRosto(canvas)) ?? p1.map((p) => {
      const m = noModelo(p, camTodo);
      return { x: (m.x - camRosto.left) / lado, y: (camRosto.top - m.y) / lado };
    });
    const pixels = new Uint8ClampedArray(LADO_BUSCA * LADO_BUSCA * 4);
    const gl = r.getContext();
    gl.readPixels(0, 0, LADO_BUSCA, LADO_BUSCA, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const pixel = (p: P2): [number, number, number] => {
      // readPixels começa embaixo: a linha 0 é y = 0 do espaço do rosto.
      const x = Math.round(Math.min(1, Math.max(0, p.x)) * (LADO_BUSCA - 1));
      const y = Math.round(Math.min(1, Math.max(0, p.y)) * (LADO_BUSCA - 1));
      const i = (y * LADO_BUSCA + x) * 4;
      return [pixels[i], pixels[i + 1], pixels[i + 2]];
    };
    const pontos = p2.map((p) => ({ x: p.x, y: 1 - p.y }));

    // Os pontos em 3D: um raio de frente em cada um.
    const raio = new THREE.Raycaster();
    const em3d = (i: number): V3 => {
      const m = noModelo(p2[i], camRosto);
      raio.set(new THREE.Vector3(m.x, m.y, caixa.max.z + 1), new THREE.Vector3(0, 0, -1));
      const hit = raio.intersectObjects(objetos, false)[0];
      return { x: m.x, y: m.y, z: hit ? hit.point.z : centro.z };
    };
    const posicoes = juntarPosicoes(malhas);
    const juntas = calcularJuntas({
      posicoes,
      queixo: em3d(QUEIXO),
      testa: em3d(TESTA),
      lateralD: em3d(LATERAL_D),
      lateralE: em3d(LATERAL_E),
      minY: caixa.min.y,
    });
    return { juntas, camera: camRosto, pontos, pixel };
  } finally {
    for (const o of objetos) (o.material as THREE.Material).dispose();
    r.dispose();
    r.forceContextLoss();
  }
}

function juntarPosicoes(malhas: Malha[]): Float32Array {
  const total = malhas.reduce((s, m) => s + m.geometria.getAttribute("position").count * 3, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const m of malhas) {
    const p = m.geometria.getAttribute("position");
    for (let i = 0; i < p.count; i++, o += 3) {
      out[o] = p.getX(i);
      out[o + 1] = p.getY(i);
      out[o + 2] = p.getZ(i);
    }
  }
  return out;
}

/** Sem rosto achado: a cabeça no alto do modelo (um quarto da altura), pelas proporções. */
function juntasSemRosto(malhas: Malha[], caixa: THREE.Box3): Juntas {
  const tam = caixa.getSize(new THREE.Vector3());
  const c = caixa.getCenter(new THREE.Vector3());
  const h = tam.y * 0.18;
  const queixoY = caixa.max.y - tam.y * 0.26;
  return calcularJuntas({
    posicoes: juntarPosicoes(malhas),
    queixo: { x: c.x, y: queixoY, z: caixa.max.z },
    testa: { x: c.x, y: queixoY + h, z: caixa.max.z },
    lateralD: { x: c.x - h * 0.4, y: queixoY + h / 2, z: c.z },
    lateralE: { x: c.x + h * 0.4, y: queixoY + h / 2, z: c.z },
    minY: caixa.min.y,
  });
}

/* ------------------------------------------------------------------ */
/* Material, câmera e fundo                                             */
/* ------------------------------------------------------------------ */

/**
 * Injeta a camada do rosto no material: cada ponto da malha (na pose de
 * repouso, antes dos ossos) cai num ponto da imagem de frente; onde a camada
 * tem alfa e a superfície olha para a frente, a cor dela vale.
 */
function projetarRosto(
  m: THREE.MeshStandardMaterial,
  cam: THREE.OrthographicCamera,
  rosto: { value: THREE.Texture | null },
) {
  const lado = cam.right - cam.left;
  const mat = new THREE.Matrix3().set(1 / lado, 0, -cam.left / lado, 0, 1 / lado, -cam.bottom / lado, 0, 0, 1);
  m.onBeforeCompile = (s) => {
    s.uniforms.uRosto = rosto;
    s.uniforms.uRostoMat = { value: mat };
    s.vertexShader = s.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform mat3 uRostoMat;\nvarying vec2 vRostoUv;\nvarying float vRostoFrente;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvRostoUv = (uRostoMat * vec3(position.xy, 1.0)).xy;\nvRostoFrente = normalize(normal).z;",
      );
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform sampler2D uRosto;\nvarying vec2 vRostoUv;\nvarying float vRostoFrente;",
      )
      .replace(
        "#include <map_fragment>",
        [
          "#include <map_fragment>",
          "if (vRostoUv.x > 0.0 && vRostoUv.x < 1.0 && vRostoUv.y > 0.0 && vRostoUv.y < 1.0) {",
          "  vec4 camada = texture2D(uRosto, vRostoUv);",
          "  diffuseColor.rgb = mix(diffuseColor.rgb, camada.rgb, camada.a * smoothstep(0.2, 0.45, vRostoFrente));",
          "}",
        ].join("\n"),
      );
  };
  m.customProgramCacheKey = () => "rosto-avatar3d";
}

/** Câmera do peito para cima, com folga acima do cabelo. */
function enquadrar(j: Juntas, caixa: THREE.Box3): THREE.PerspectiveCamera {
  const fov = 24;
  const cam = new THREE.PerspectiveCamera(fov, LARGURA / ALTURA, 0.01, 100);
  const h = j.alturaRosto;
  const topo = caixa.max.y + 0.25 * h;
  const pe = Math.max(caixa.min.y, j.queixoY - 1.9 * h);
  const meio = (topo + pe) / 2;
  const dist = (topo - pe) / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2));
  cam.position.set(j.cx, meio, j.cabeca.z + dist);
  cam.lookAt(j.cx, meio, j.cabeca.z);
  return cam;
}

/** Fundo de estúdio: um degradê escuro com uma luz suave atrás da cabeça. */
function fundoDeEstudio(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 360;
  const ctx = c.getContext("2d")!;
  const v = ctx.createLinearGradient(0, 0, 0, 360);
  v.addColorStop(0, "#2a2f47");
  v.addColorStop(1, "#12131c");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 640, 360);
  const r = ctx.createRadialGradient(320, 130, 10, 320, 150, 300);
  r.addColorStop(0, "rgba(140,150,220,0.35)");
  r.addColorStop(1, "rgba(140,150,220,0)");
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, 640, 360);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

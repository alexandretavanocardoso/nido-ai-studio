import { describe, expect, it } from "vitest";
import { reamostrar, suave, yEm } from "@/components/live/avatar3d/pontos";
import {
  angulos,
  calibrada,
  calibrar,
  expressaoDaLeitura,
  NEUTRA,
  suavizar,
  type Leitura,
} from "@/components/live/avatar3d/rastreio";
import { calcularJuntas, meioDaFatia, pesos, type Juntas } from "@/components/live/avatar3d/rig";

/** Matriz 4×4 (coluna a coluna) de um giro em y, depois x, depois z — a ordem YXZ do three. */
function matriz(yaw: number, pitch: number, roll: number): number[] {
  const [cy, sy, cx, sx, cz, sz] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch), Math.cos(roll), Math.sin(roll)];
  // R = Ry · Rx · Rz (linhas)
  const r = [
    [cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx],
    [cx * sz, cx * cz, -sx],
    [-sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx],
  ];
  return [r[0][0], r[1][0], r[2][0], 0, r[0][1], r[1][1], r[2][1], 0, r[0][2], r[1][2], r[2][2], 0, 0, 0, 0, 1];
}

const leitura = (o: Partial<{ yaw: number; pitch: number; roll: number; formas: Record<string, number>; x: number }>): Leitura => ({
  matriz: matriz(o.yaw ?? 0, o.pitch ?? 0, o.roll ?? 0),
  formas: o.formas ?? {},
  nariz: { x: o.x ?? 0.5, y: 0.5 },
});

describe("rastreio → expressão do avatar (espelho)", () => {
  it("lê os ângulos da matriz", () => {
    const a = angulos(matriz(0.3, -0.2, 0.1));
    expect(a.yaw).toBeCloseTo(0.3);
    expect(a.pitch).toBeCloseTo(-0.2);
    expect(a.roll).toBeCloseTo(0.1);
  });

  it("vira e tomba para o lado oposto (espelho), olha para baixo igual; o olho direito fecha o esquerdo do avatar", () => {
    const e = expressaoDaLeitura(leitura({ yaw: 0.3, pitch: 0.2, roll: 0.1, formas: { eyeBlinkRight: 0.9, eyeBlinkLeft: 0.1 } }));
    expect(e.yaw).toBeCloseTo(-0.3);
    expect(e.roll).toBeCloseTo(-0.1);
    expect(e.pitch).toBeCloseTo(0.2);
    expect(e.piscarE).toBe(1);
    expect(e.piscarD).toBe(0);
  });

  it("olho aberto no MediaPipe (até ~0,3) não pisca; boca, sorriso e bico com folga no zero", () => {
    const e = expressaoDaLeitura(leitura({ formas: { eyeBlinkLeft: 0.25, jawOpen: 0.03, mouthSmileLeft: 0.05, mouthSmileRight: 0.05, mouthPucker: 0.1 } }));
    expect([e.piscarD, e.boca, e.sorriso, e.bico]).toEqual([0, 0, 0, 0]);
    const aberta = expressaoDaLeitura(leitura({ formas: { jawOpen: 0.5, mouthFunnel: 0.8 } }));
    expect(aberta.boca).toBe(1);
    expect(aberta.bico).toBeGreaterThan(0.9);
  });

  it("o rosto à direita no quadro (espelho: esquerda da tela) inclina o corpo para a esquerda", () => {
    expect(expressaoDaLeitura(leitura({ x: 0.8 })).inclinacao).toBeLessThan(0);
    expect(expressaoDaLeitura(leitura({ x: 0.2 })).inclinacao).toBeGreaterThan(0);
  });

  it("limita o giro (a cabeça não dá a volta)", () => {
    expect(expressaoDaLeitura(leitura({ yaw: -1.4 })).yaw).toBeLessThanOrEqual(0.75);
  });

  it("calibração: o jeito natural da pessoa (câmera em cima, cabeça de lado) vira o centro, com limite", () => {
    const parada = { ...NEUTRA, yaw: 0.1, pitch: 0.25, roll: 0.05, sobrancelha: -0.2 };
    const c = calibrar([parada, { ...parada, pitch: 0.27 }, { ...parada, pitch: 0.23 }]);
    expect(c.pitch).toBeCloseTo(0.25);
    const centro = calibrada(parada, c);
    expect(centro.yaw).toBeCloseTo(0);
    expect(centro.pitch).toBeCloseTo(0);
    expect(centro.sobrancelha).toBe(0);
    expect(calibrar([{ ...NEUTRA, yaw: 0.9 }]).yaw).toBe(0.35);
    // Sobrancelha bem levantada continua levantada.
    expect(calibrada({ ...parada, sobrancelha: 0.6 }, c).sobrancelha).toBeGreaterThan(0.5);
  });

  it("suaviza: piscar acompanha rápido, a inclinação do corpo devagar", () => {
    const s = suavizar(NEUTRA, { ...NEUTRA, piscarD: 1, inclinacao: 1 });
    expect(s.piscarD).toBeGreaterThan(0.7);
    expect(s.inclinacao).toBeLessThan(0.2);
  });
});

describe("esqueleto do avatar", () => {
  const j: Juntas = {
    cx: 0,
    queixoY: 0.2,
    alturaRosto: 0.2,
    larguraRosto: 0.16,
    raiz: { x: 0, y: -0.5, z: 0 },
    peito: { x: 0, y: -0.2, z: 0 },
    pescoco: { x: 0, y: 0.13, z: 0 },
    cabeca: { x: 0, y: 0.24, z: 0 },
  };
  const soma = (p: number[]) => p.reduce((a, b) => a + b, 0);

  it("pesos somam 1; o rosto é todo da cabeça, a barriga é da raiz", () => {
    for (const [x, y] of [[0, 0.35], [0.05, 0.15], [0.3, 0.1], [0, -0.1], [0, -0.45]]) expect(soma(pesos(x, y, j))).toBeCloseTo(1);
    expect(pesos(0, 0.35, j)[3]).toBeCloseTo(1);
    expect(pesos(0, -0.48, j)[0]).toBeGreaterThan(0.9);
  });

  it("na altura do pescoço, o ombro (longe do eixo) fica com o peito, não gira com a cabeça", () => {
    const ombro = pesos(0.25, 0.12, j);
    expect(ombro[2] + ombro[3]).toBeLessThan(0.05);
    const pescoco = pesos(0.02, 0.165, j);
    expect(pescoco[2] + pescoco[3]).toBeGreaterThan(0.9);
  });

  it("juntas a partir do rosto: cabeça acima do queixo, pescoço abaixo, no meio da fatia do modelo", () => {
    // Um "cilindro" de pontos de z -0.1 a 0.1 em todas as alturas.
    const pos: number[] = [];
    for (let y = -0.5; y <= 0.5; y += 0.01) for (const z of [-0.1, 0.1]) pos.push(0, y, z);
    expect(meioDaFatia(pos, 0.1, 0, 0.1, 0.02)).toBeCloseTo(0);
    const r = calcularJuntas({
      posicoes: pos,
      queixo: { x: 0, y: 0.2, z: 0.1 },
      testa: { x: 0, y: 0.4, z: 0.1 },
      lateralD: { x: -0.08, y: 0.3, z: 0 },
      lateralE: { x: 0.08, y: 0.3, z: 0 },
      minY: -0.5,
    });
    expect(r.cabeca.y).toBeGreaterThan(0.2);
    expect(r.pescoco.y).toBeLessThan(0.2);
    expect(r.peito.y).toBeLessThan(r.pescoco.y);
    expect(r.cabeca.z).toBeCloseTo(0);
    expect(r.larguraRosto).toBeCloseTo(0.16);
  });
});

describe("contas do rosto", () => {
  it("refaz uma linha em pontos casados e lê a altura no meio", () => {
    const linha = [{ x: 0, y: 0 }, { x: 0.5, y: 1 }, { x: 1, y: 0 }];
    const r = reamostrar(linha, 5);
    expect(r.map((p) => p.x)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(r[2].y).toBeCloseTo(1);
    expect(yEm(linha, 0.25)).toBeCloseTo(0.5);
    expect(suave(0, 1, 0.5)).toBeCloseTo(0.5);
    expect(suave(0, 1, 2)).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { alinharFala, envelopeDeAmostras, inicioEFimDaFala, montagemDaCena } from "./sincronia";

/** Envelope com fala (volume 5000) entre `de` e `ate` segundos, em `total` segundos, a 30/s. */
const fala = (de: number, ate: number, total: number) =>
  Array.from({ length: Math.round(total * 30) }, (_, i) => (i / 30 >= de && i / 30 < ate ? 5000 : 40));

describe("sincronia da fala com a boca", () => {
  it("acha onde a fala começa e termina", () => {
    const r = inicioEFimDaFala(fala(0.7, 13.5, 14))!;
    expect(r.inicio).toBeCloseTo(0.7, 1);
    expect(r.fim).toBeCloseTo(13.5, 1);
    expect(inicioEFimDaFala(fala(0, 0, 5))).toBeNull(); // silêncio
  });

  it("o caso do Wan: fala 0,67s atrasada e um pouco esticada", () => {
    const r = alinharFala(fala(0.7, 13.57, 14), fala(0.03, 12.5, 13))!;
    expect(r.atraso).toBeGreaterThan(0.6);
    expect(r.atraso).toBeLessThan(0.75);
    expect(r.ritmo).toBeGreaterThan(1.02);
    expect(r.ritmo).toBeLessThan(1.05);
    // A suavização espalha um quadro para cada lado.
    expect(Math.abs(r.fimNoVideo - 13.57)).toBeLessThan(0.1);
  });

  it("já alinhado: não mexe", () => {
    expect(alinharFala(fala(0.03, 12.5, 13), fala(0.03, 12.5, 13))).toBeNull();
  });

  it("fala diferente demais (outro ritmo ou sem fala no modelo): não mexe", () => {
    expect(alinharFala(fala(0.5, 5, 14), fala(0, 12.5, 13))).toBeNull();
    expect(alinharFala(fala(0, 0, 14), fala(0, 12.5, 13))).toBeNull();
  });

  it("volume a partir das amostras", () => {
    const amostras = new Int16Array(8000).map((_, i) => (i < 4000 ? 0 : i % 2 ? 1000 : -1000));
    const v = envelopeDeAmostras(amostras, 8000);
    expect(v).toHaveLength(30);
    expect(v[0]).toBe(0);
    expect(v[29]).toBeCloseTo(1000, 0);
  });

  it("montagem: corta a espera do modelo, atrasa e estica o MP3, completa o fim", () => {
    const m = montagemDaCena({ alinhamento: { atraso: 0.666, ritmo: 1.032 }, duracaoFala: 12.98, duracaoClipe: 14 });
    expect(m.inicio).toBeCloseTo(0.416, 3); // fica 0,25s de pausa antes da fala
    expect(m.atraso).toBeCloseTo(0.25, 3);
    expect(m.fim).toBe(14);
    expect(m.pad).toBeCloseTo(0.666 + 12.98 * 1.032 - 14, 3);
    expect(m.duracao).toBeCloseTo(m.atraso + 12.98 * 1.032, 2);
  });

  it("montagem: modelo falou antes do MP3 → corta o começo do MP3", () => {
    const m = montagemDaCena({ alinhamento: { atraso: -0.2, ritmo: 1 }, duracaoFala: 10, duracaoClipe: 12 });
    expect(m.inicio).toBe(0);
    expect(m.atraso).toBe(-0.2);
    expect(m.fim).toBeCloseTo(9.8, 3);
    expect(m.pad).toBe(0);
    expect(m.duracao).toBeCloseTo(9.8, 3);
  });
});

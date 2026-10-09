import { describe, expect, it } from "vitest";
import { avaliarReembolso, PRAZO_REEMBOLSO_DIAS } from "./reembolso";

const pagoEm = new Date("2026-10-01T12:00:00Z");
const dias = (n: number) => new Date(pagoEm.getTime() + n * 86_400_000);

describe("regra de reembolso", () => {
  it("dentro do prazo e sem usar nada: pode", () => {
    const r = avaliarReembolso({ status: "pago", pagoEm, usados: 0, agora: dias(3) });
    expect(r.pode).toBe(true);
    expect(r.motivo).toBeNull();
    expect(r.ate).toBe(dias(PRAZO_REEMBOLSO_DIAS).toISOString());
  });

  it("usou 1 crédito: não pode, mesmo no primeiro dia", () => {
    const r = avaliarReembolso({ status: "pago", pagoEm, usados: 1, agora: dias(0.1) });
    expect(r.pode).toBe(false);
    expect(r.motivo).toMatch(/1 crédito desta compra já foi usado/);
    const muitos = avaliarReembolso({ status: "pago", pagoEm, usados: 480, agora: dias(2) });
    expect(muitos.motivo).toMatch(/480 créditos desta compra já foram usados/);
  });

  it("passou de 7 dias: não pode, mesmo sem usar", () => {
    expect(avaliarReembolso({ status: "pago", pagoEm, usados: 0, agora: dias(7.01) }).pode).toBe(false);
    expect(avaliarReembolso({ status: "pago", pagoEm, usados: 0, agora: dias(6.99) }).pode).toBe(true);
  });

  it("só compra paga, e uma vez só", () => {
    expect(avaliarReembolso({ status: "pendente", pagoEm: null, usados: 0 }).pode).toBe(false);
    const ja = avaliarReembolso({ status: "estornado", pagoEm, usados: 0, agora: dias(1) });
    expect(ja.pode).toBe(false);
    expect(ja.motivo).toMatch(/já foi reembolsada/);
  });
});

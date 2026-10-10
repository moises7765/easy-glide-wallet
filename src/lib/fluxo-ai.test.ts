import { afterEach, describe, expect, it, vi } from "vitest";

import { brasiliaToday, completeLaunch, parseLaunchCommand, resolveNaturalDate, type FluxoAiContext } from "./fluxo-ai";

// 02:14 UTC on Oct 10 is still 23:14 on Oct 9 (Friday) in Brasília.
const LATE_NIGHT = new Date("2026-10-10T02:14:00Z");
const ctx = {
  transactions: [], purchases: [], goals: [], assets: [],
  categories: [{ id: "c1", name: "Transporte", kind: "expense" }],
  cards: [{ id: "n1", name: "Nubank" }],
} as unknown as FluxoAiContext;
const date = (text: string) => {
  const r = resolveNaturalDate(text, LATE_NIGHT);
  return r && "date" in r ? r.date : r;
};

describe("datas naturais em Brasília", () => {
  afterEach(() => vi.useRealTimers());

  it("usa o dia de Brasília, não o de UTC", () => {
    expect(brasiliaToday(LATE_NIGHT)).toEqual({ y: 2026, m: 10, d: 9 });
    expect(date("hoje")).toBe("2026-10-09");
  });
  it("entende ontem, anteontem, amanhã e depois de amanhã", () => {
    expect(date("gasolina ontem")).toBe("2026-10-08");
    expect(date("anteontem")).toBe("2026-10-07");
    expect(date("amanhã")).toBe("2026-10-10");
    expect(date("depois de amanhã")).toBe("2026-10-11");
  });
  it("vira o mês corretamente", () => {
    expect(resolveNaturalDate("ontem", new Date("2026-11-01T12:00:00Z"))).toEqual({ date: "2026-10-31" });
  });
  it("entende dias da semana e dia do mês", () => {
    expect(date("segunda passada")).toBe("2026-10-05");
    expect(date("na quarta")).toBe("2026-10-07");
    expect(date("sexta passada")).toBe("2026-10-02");
    expect(date("dia 5")).toBe("2026-10-05");
    expect(date("dia 20")).toBe("2026-09-20");
    expect(date("12/09")).toBe("2026-09-12");
  });
  it("marca como ambígua a sexta quando hoje é sexta", () => {
    expect(resolveNaturalDate("na sexta", LATE_NIGHT)).toEqual({ ambiguous: true });
  });
  it("sem data → null (o lançamento usa hoje)", () => {
    expect(resolveNaturalDate("gasolina no pix", LATE_NIGHT)).toBeNull();
  });

  it("salva '40 reais no pix gasolina ontem' direto com a data de ontem", () => {
    vi.useFakeTimers();
    vi.setSystemTime(LATE_NIGHT);
    const r = parseLaunchCommand("40 reais no pix gasolina ontem", ctx);
    expect(r?.status).toBe("ready");
    if (r?.status !== "ready") return;
    expect(r.proposal).toMatchObject({ type: "expense", amount: 40, date: "2026-10-08", description: "Gasolina", paymentMethod: "pix", categoryId: "c1" });
  });
  it("sem data usa hoje (Brasília)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(LATE_NIGHT);
    const r = parseLaunchCommand("Gastei 35 reais no almoço no Pix", ctx);
    expect(r?.status === "ready" && r.proposal.date).toBe("2026-10-09");
  });
  it("data ambígua pergunta e a resposta 'ontem' completa", () => {
    vi.useFakeTimers();
    vi.setSystemTime(LATE_NIGHT);
    const r = parseLaunchCommand("Gastei 20 reais na sexta no pix", ctx);
    expect(r?.status).toBe("needs_date");
    const done = r ? completeLaunch(r, "ontem", ctx) : null;
    expect(done?.status === "ready" && done.proposal.date).toBe("2026-10-08");
  });
  it("perguntas não viram lançamento", () => {
    expect(parseLaunchCommand("quanto gastei ontem no pix?", ctx)).toBeNull();
  });
});

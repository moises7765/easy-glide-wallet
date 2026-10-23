import { describe, expect, it } from "vitest";

import { isFinancialQuestion, parseActionProposal, parseLaunchCommand, type FluxoAiContext } from "./fluxo-ai";
import { CAPABILITIES_ANSWER, classifyChatError, detectLocalIntent, fallbackAnswer, localAnswer } from "./fluxo-ai-local";

// 20:00 in Brasília on Oct 23, 2026.
const NOW = new Date("2026-10-23T23:00:00Z");

// Synthetic October: income 2.206,00; cash out 2.498,10 (2.098,20 invoice payments + 399,90 consumption).
const ctx = {
  transactions: [
    { id: "i1", type: "income", amount: 2000, date: "2026-10-05", invoice_payment_id: null, category_id: null, description: "Salário" },
    { id: "i2", type: "income", amount: 206, date: "2026-10-10", invoice_payment_id: null, category_id: null, description: "Extra" },
    { id: "p1", type: "expense", amount: 1980.52, date: "2026-10-08", invoice_payment_id: "x1", category_id: null, description: "Fatura Nubank" },
    { id: "p2", type: "expense", amount: 117.68, date: "2026-10-08", invoice_payment_id: "x2", category_id: null, description: "Fatura MP" },
    { id: "e1", type: "expense", amount: 300, date: "2026-10-12", invoice_payment_id: null, category_id: "food", description: "Mercado" },
    { id: "e2", type: "expense", amount: 99.9, date: "2026-10-15", invoice_payment_id: null, category_id: "fun", description: "Show" },
  ],
  categories: [
    { id: "food", name: "Alimentação", kind: "expense" },
    { id: "fun", name: "Lazer", kind: "expense" },
  ],
  cards: [], purchases: [], goals: [], assets: [],
} as unknown as FluxoAiContext;

describe("perguntas informativas", () => {
  it.each(["O que você pode fazer?", "O que você pode fazer", "Como está minha situação financeira?", "💡 O que devo fazer?"])(
    "'%s' nunca vira lançamento",
    (question) => {
      expect(parseLaunchCommand(question, ctx)).toBeNull();
      expect(isFinancialQuestion(question) ? null : parseActionProposal(question, ctx)).toBeNull();
    },
  );

  it("'O que você pode fazer' responde as capacidades", () => {
    expect(detectLocalIntent("O que você pode fazer")).toBe("capabilities");
    expect(localAnswer("O que você pode fazer?", ctx, NOW).text).toBe(CAPABILITIES_ANSWER);
  });

  it("situação financeira usa os números reais do mês", () => {
    const { intent, text } = localAnswer("Como está minha situação financeira?", ctx, NOW);
    expect(intent).toBe("situation");
    expect(text).toContain("R$ 2.206,00"); // entrou
    expect(text).toContain("R$ 2.498,10"); // saiu em caixa
    expect(text).toContain("R$ 2.098,20"); // pagamentos de fatura
    expect(text).toContain("R$ 399,90"); // consumo
    expect(text).toContain("-R$ 292,10"); // saldo de caixa
  });

  it("gastos por categoria excluem pagamentos de fatura", () => {
    const { text } = localAnswer("Onde estou gastando?", ctx, NOW);
    expect(text).toContain("R$ 399,90");
    expect(text).toContain("Alimentação: R$ 300,00");
    expect(text).not.toContain("1.980,52");
  });

  it("pergunta complexa não reconhecida devolve o resumo do mês", () => {
    const r = localAnswer("Se eu trocar de carro em março, consigo manter a reserva?", ctx, NOW);
    expect(r.matched).toBe(false);
    expect(r.text).toContain("R$ 2.206,00");
  });
});

describe("erro da IA → resposta local", () => {
  it("402 (sem créditos) pausa a IA", () => {
    expect(classifyChatError('{"status":402}')).toEqual({ kind: "credits", pause: true });
  });
  it("servidor sem configuração (503) pausa a IA", () => {
    expect(classifyChatError('{"error":"O Fluxo IA ainda não está configurado neste ambiente.","status":503}')).toEqual({ kind: "config", pause: true });
  });
  it("429 não pausa", () => {
    expect(classifyChatError('{"status":429}')).toEqual({ kind: "rate", pause: false });
  });
  it("erro genérico ('An error occurred.') ou rede vira indisponível", () => {
    expect(classifyChatError("An error occurred.")).toEqual({ kind: "unavailable", pause: false });
    expect(classifyChatError("Failed to fetch")).toEqual({ kind: "unavailable", pause: false });
  });
  it("fallback explica a limitação em português e responde com os dados", () => {
    const text = fallbackAnswer("Como está minha situação financeira?", ctx, "credits", NOW);
    expect(text).toContain("sem créditos de IA");
    expect(text).toContain("R$ 2.206,00");
    expect(text).not.toContain("An error occurred");
  });
});

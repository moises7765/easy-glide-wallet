import { describe, expect, it } from "vitest";

import { parseLaunchCommand, type FluxoAiContext } from "./fluxo-ai";
import {
  analyzePurchase,
  goalPlans,
  goalsStrategyAnswer,
  isPurchaseQuestion,
  missingPurchaseInfo,
  parsePurchaseQuery,
  savingsOpportunities,
  savingsStrategyAnswer,
} from "./fluxo-ai-planning";
import { EMPTY_PLANNING, planningReply } from "./fluxo-ai-router";

// Dados sintéticos (nenhum dado real). Intl usa espaço não separável depois de "R$".
const plain = (text: string) => text.replace(/\u00a0/g, " ");
// 12:00 em Brasília, 3 de novembro de 2026.
const NOW = new Date("2026-11-03T15:00:00Z");

let seq = 0;
const tx = (date: string, type: string, amount: number, description: string, category_id: string | null, extra: Record<string, unknown> = {}) => ({
  id: `t${++seq}`, date, type, amount, description, category_id, card_id: null, invoice_payment_id: null, ...extra,
});

const months = ["2026-08", "2026-09", "2026-10"];
const base = months.flatMap((m) => [
  tx(`${m}-05`, "income", 4000, "Salário", "sal"),
  tx(`${m}-10`, "expense", 1200, "Aluguel", "home"),
  tx(`${m}-15`, "expense", 800, "Mercado", "food"),
  tx(`${m}-20`, "expense", 500, "Bar", "fun"),
  tx(`${m}-12`, "expense", 55.9, "Netflix", "subs", { card_id: "nu" }),
]);

function makeContext(overrides: Partial<Record<keyof FluxoAiContext, unknown>> = {}) {
  return {
    transactions: [
      ...base,
      tx("2026-10-20", "expense", 300, "Roupas", "clothes", { card_id: "nu" }),
      // Pagamento automático de fatura: saída de caixa, nunca consumo.
      tx("2026-10-08", "expense", 55.9, "Pagamento fatura Nubank", null, { card_id: "nu", invoice_payment_id: "pay-10", payment_method: "transfer" }),
      tx("2026-11-01", "expense", 20, "Padaria", "food"),
    ],
    categories: [
      { id: "sal", name: "Salário", kind: "income" },
      { id: "home", name: "Moradia", kind: "expense" },
      { id: "food", name: "Alimentação", kind: "expense" },
      { id: "fun", name: "Lazer", kind: "expense" },
      { id: "subs", name: "Assinaturas", kind: "expense" },
      { id: "clothes", name: "Vestuário", kind: "expense" },
    ],
    cards: [{ id: "nu", name: "Nubank", closing_day: 1, due_day: 8, limit_total: 5000 }],
    purchases: [],
    goals: [{ id: "g1", name: "Viagem", target_amount: 6000, current_amount: 1000, deadline: "2027-11-01" }],
    assets: [{ id: "a1", name: "Conta corrente", kind: "bank", liquid: true, value: 1500 }],
    invoicePayments: [
      { card_id: "nu", invoice_key: "2026-09", paid_at: "2026-09-08" },
      { card_id: "nu", invoice_key: "2026-10", paid_at: "2026-10-08" },
    ],
    ...overrides,
  } as unknown as FluxoAiContext;
}

const ctx = makeContext();
const ask = (text: string, context = ctx) => analyzePurchase(parsePurchaseQuery(text, context), context, NOW);

describe("compra: entende a pergunta", () => {
  it.each(["Posso comprar um tênis de R$ 450 hoje?", "Cabe uma compra de R$ 200 no cartão?", "Se eu gastar R$ 300 este mês, ainda consigo pagar minhas contas?", "🛍️ Posso comprar isso?"])("'%s' é simulação, nunca lançamento", (q) => {
    expect(isPurchaseQuestion(q)).toBe(true);
    expect(parseLaunchCommand(q, ctx)).toBeNull();
  });
  it("lê valor, item e forma de pagamento", () => {
    const q = parsePurchaseQuery("Posso comprar um tênis de R$ 450 no Pix?", ctx);
    expect(q).toMatchObject({ amount: 450, method: "cash", cashMethod: "pix", description: "Tênis" });
    expect(parsePurchaseQuery("Posso comprar uma geladeira de 3.000 em 10x no Nubank?", ctx)).toMatchObject({ amount: 3000, method: "card", cardId: "nu", installments: 10 });
  });
});

describe("compra: dados faltantes", () => {
  it("sem forma de pagamento pergunta só isso", () => {
    expect(missingPurchaseInfo(parsePurchaseQuery("Posso comprar um tênis de R$ 450 hoje?", ctx), ctx)).toBe("method");
  });
  it("sem valor pergunta o valor", () => {
    expect(missingPurchaseInfo(parsePurchaseQuery("Posso comprar isso?", ctx), ctx)).toBe("amount");
  });
  it("com dois cartões pergunta qual", () => {
    const two = makeContext({ cards: [...(ctx.cards as unknown[]), { id: "mp", name: "Mercado Pago", closing_day: 5, due_day: 12, limit_total: 1000 }] });
    expect(missingPurchaseInfo(parsePurchaseQuery("Cabe uma compra de R$ 200 no cartão?", two), two)).toBe("card");
  });
  it("sem saldo nem lançamentos no mês, não inventa veredito", () => {
    const empty = makeContext({ assets: [], transactions: base });
    const r = ask("Posso comprar um tênis de 450 no pix?", empty);
    expect(r.verdict).toBeNull();
    expect(r.text).toContain("ainda não consigo avaliar");
  });
});

describe("compra: veredito com dados reais simulados", () => {
  // Disponível 1.500 + salário previsto 4.000 − (fatura 355,90 + aluguel 1.200 + mercado 800 + bar 500) = 2.644,10.
  it("compra segura → Cabe, contando faturas e contas recorrentes", () => {
    const r = ask("Posso comprar um tênis de R$ 450 no Pix?");
    expect(r.verdict).toBe("Cabe");
    expect(r.freeAfter).toBeCloseTo(2194.1, 2);
    const text = plain(r.text);
    expect(text).toContain("Fatura Nubank R$ 355,90");
    expect(text).toContain("Aluguel R$ 1.200,00");
    expect(text).toContain("nada foi registrado");
  });
  it("compra que come a margem das metas → Cabe com cuidado", () => {
    const r = ask("Posso comprar uma TV de 2.500 no pix?");
    expect(r.verdict).toBe("Cabe com cuidado");
    expect(r.freeAfter).toBeCloseTo(144.1, 2);
  });
  it("compra que compromete contas futuras → Melhor esperar", () => {
    const r = ask("Posso comprar um sofá de 3.000 no débito?");
    expect(r.verdict).toBe("Melhor esperar");
    expect(r.freeAfter).toBeLessThan(0);
  });
  it("pagamento de fatura já pago não volta como compromisso", () => {
    expect(plain(ask("Posso comprar um tênis de 450 no pix?").text)).not.toContain("55,90 em 08/10");
  });
  it("parcelas compromissos futuros: 10x de R$ 300 cabe, 12x de R$ 750 pede cuidado/espera", () => {
    const ok = ask("Posso comprar uma geladeira de 3.000 em 10x no Nubank?");
    expect(ok.verdict).toBe("Cabe");
    expect(plain(ok.text)).toContain("10x de R$ 300,00");
    expect(ask("Posso comprar um notebook de 9.000 em 12x no Nubank?").verdict).toBe("Melhor esperar");
  });
});

describe("compra: limite do cartão não é dinheiro", () => {
  it("limite sobrando não salva uma compra sem caixa para pagar a fatura", () => {
    const rich = makeContext({ cards: [{ id: "nu", name: "Nubank", closing_day: 1, due_day: 8, limit_total: 20000 }], assets: [{ id: "a1", name: "Conta", kind: "bank", liquid: true, value: 200 }] });
    const r = ask("Cabe uma compra de R$ 2.000 no cartão?", rich);
    expect(r.cardAvailable).toBeGreaterThan(2000);
    expect(r.verdict).toBe("Melhor esperar");
    expect(plain(r.text)).toContain("limite não é dinheiro disponível");
  });
  it("limite insuficiente → Melhor esperar mesmo com caixa", () => {
    const r = ask("Cabe uma compra de R$ 4.800 no cartão?", makeContext({ assets: [{ id: "a1", name: "Conta", kind: "bank", liquid: true, value: 50000 }] }));
    expect(r.cardAvailable).toBeCloseTo(4644.1, 2);
    expect(r.verdict).toBe("Melhor esperar");
  });
});

describe("compra no chat: simula e só registra com ordem explícita", () => {
  it("pergunta o que falta, analisa e só 'comprei' gera o lançamento", () => {
    let r = planningReply("Posso comprar isso?", EMPTY_PLANNING, ctx, NOW)!;
    expect(r.reply).toContain("Qual é a compra e o valor");
    r = planningReply("um tênis de 450", r.state, ctx, NOW)!;
    expect(r.reply).toContain("Vai pagar como");
    r = planningReply("Pix", r.state, ctx, NOW)!;
    expect(r.reply).toContain("**Cabe**");
    expect(r.launchText).toBeUndefined();
    const again = planningReply("E se fosse no cartão?", r.state, ctx, NOW);
    expect(again?.launchText).toBeUndefined();
    const order = planningReply("comprei", r.state, ctx, NOW)!;
    const launch = parseLaunchCommand(order.launchText!, ctx);
    expect(launch?.status).toBe("ready");
    expect(launch && launch.status === "ready" ? launch.proposal : null).toMatchObject({ amount: 450, type: "expense", paymentMethod: "pix", description: "Tênis" });
    expect(order.state).toEqual(EMPTY_PLANNING);
  });
  it("'comprei' sem simulação anterior segue o fluxo normal", () => {
    expect(planningReply("comprei", EMPTY_PLANNING, ctx, NOW)).toBeNull();
  });
  it("ordem explícita 'Gastei 35 no almoço no Pix' não vira simulação", () => {
    expect(planningReply("Gastei 35 no almoço no Pix", EMPTY_PLANNING, ctx, NOW)).toBeNull();
  });
});

describe("economia", () => {
  it("oportunidades por impacto, sem cortar gastos fixos nem contar pagamento de fatura", () => {
    const s = savingsOpportunities(ctx, NOW);
    expect(s.baseline.consumption).toBeCloseTo(2655.9, 2);
    expect(s.opportunities.map((o) => o.title)).toEqual(["Lazer", "Alimentação", "Netflix", "Vestuário"]);
    expect(s.opportunities.map((o) => Number(o.monthly.toFixed(2)))).toEqual([100, 80, 55.9, 20]);
    expect(s.total).toBeCloseTo(255.9, 2);
    const text = plain(savingsStrategyAnswer(ctx, NOW));
    expect(text).toContain("~R$ 255,90/mês · ~R$ 3.070,80/ano");
    expect(text).toContain("Estimativa");
    expect(text).toContain("Gastos fixos (Moradia)");
    expect(text).toContain("**Ação prioritária:** comece por **Lazer**");
  });
  it("chat responde 'Como economizar mais?' localmente", () => {
    expect(planningReply("✂️ Como economizar mais?", EMPTY_PLANNING, ctx, NOW)?.reply).toContain("Como economizar mais");
  });
});

describe("metas: cenários", () => {
  // Sobra média 1.344,10 e economia 255,90; faltam 5.000 em 12 meses (416,67/mês).
  it("calcula faltante, aporte para o prazo e três cenários", () => {
    const plan = goalPlans(ctx, NOW).plans[0]!;
    expect(plan.missing).toBe(5000);
    expect(plan.requiredMonthly).toBeCloseTo(416.67, 2);
    expect(plan.scenarios.map((s) => [s.label, s.monthly, s.months])).toEqual([
      ["Confortável", 470, 11],
      ["Equilibrado", 800, 7],
      ["Acelerado", 1330, 4],
    ]);
  });
  it("'e se eu economizar mais R$ 200 por mês?' antecipa a meta sem alterá-la", () => {
    const r = planningReply("E se eu economizar mais R$ 200 por mês?", EMPTY_PLANNING, ctx, NOW)!;
    const text = plain(r.reply!);
    expect(text).toContain("fica pronta em 5 meses — 2 meses antes do cenário equilibrado");
    expect(text).toContain("Nenhuma meta foi alterada");
    expect(r.launchText).toBeUndefined();
  });
  it("sem metas ativas sugere criar, sem inventar", () => {
    expect(goalsStrategyAnswer(makeContext({ goals: [] }), NOW, 200)).toContain("Criar meta");
  });
  it("prazo apertado recomenda aporte do prazo ou estender", () => {
    const tight = makeContext({ goals: [{ id: "g1", name: "Carro", target_amount: 20000, current_amount: 0, deadline: "2027-05-01" }] });
    expect(plain(goalsStrategyAnswer(tight, NOW))).toContain("Considere estender o prazo");
  });
});

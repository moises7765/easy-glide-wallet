import { describe, expect, it } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { detectRecurrences, dueSchedule, fixedSummary, fixedToday, formToValues, monthlyEquivalent, occurrencesBetween, periodKey, unpaidFixedDues, validateFixedForm, type FixedExpense, type FixedForm, type FixedPayment } from "./fixed-expenses";
import { toISODate } from "./finance";
import { cashPicture, fixedExpensesAnswer } from "./fluxo-ai-planning";
import { EMPTY_PLANNING, planningReply } from "./fluxo-ai-router";
import { parseLaunchCommand, type FluxoAiContext } from "./fluxo-ai";

const today = new Date(2026, 10, 6);
const NOW = new Date("2026-11-06T15:00:00Z");
const fixed = (extra: Partial<FixedExpense> = {}): FixedExpense => ({ id: "f1", user_id: "synthetic-owner", name: "Internet", amount: 100, is_estimate: false, category_id: "internet", frequency: "monthly", interval_months: 1, due_day: 10, start_date: "2026-08-01", payment_method: "pix", note: null, active: true, source_signature: null, created_at: "2026-08-01", updated_at: "2026-08-01", ...extra });
const payment = (extra: Partial<FixedPayment> = {}): FixedPayment => ({ id: "p1", user_id: "synthetic-owner", fixed_expense_id: "f1", period_key: "2026-11", due_date: "2026-11-10", amount: 100, transaction_id: null, created_transaction: false, paid_at: "2026-11-06", created_at: "2026-11-06", ...extra });
const tx = (id: string, date: string, description = "Internet", amount = 100, extra: Partial<Tables<"transactions">> = {}): Tables<"transactions"> => ({ id, date, description, amount, user_id: "synthetic-owner", type: "expense", category_id: "internet", card_id: null, invoice_payment_id: null, payment_method: "pix", note: null, receipt_path: null, receipt_mime: null, created_at: date, updated_at: date, ...extra });
const context = (extra: Partial<FluxoAiContext> = {}): FluxoAiContext => ({ transactions: [], categories: [], cards: [], purchases: [], goals: [], assets: [{ id: "cash", user_id: "synthetic-owner", name: "Conta", kind: "bank", liquid: true, value: 1000, created_at: "", updated_at: "" }], invoicePayments: [], fixedExpenses: [], fixedPayments: [], ...extra });
const monthOnly = (rows: FixedExpense[], pay: FixedPayment[] = [], transactions: Tables<"transactions">[] = []) => dueSchedule(rows, pay, transactions, today, new Date(2026, 10, 1), new Date(2026, 10, 30));

describe("gastos fixos: calendário", () => {
  it("usa calendário de Brasília, mesmo após meia-noite UTC", () => expect(toISODate(fixedToday(new Date("2026-11-07T01:00:00Z")))).toBe("2026-11-06"));
  it("mensal dia 31 ajusta fevereiro sem deslocar março", () => expect(occurrencesBetween(fixed({ due_day: 31, start_date: "2027-01-01" }), new Date(2027, 1, 1), new Date(2027, 2, 31)).map(toISODate)).toEqual(["2027-02-28", "2027-03-31"]));
  it("semanal produz períodos distintos", () => { const f = fixed({ frequency: "weekly", start_date: "2026-11-06" }); const dates = occurrencesBetween(f, today, new Date(2026, 10, 20)); expect(dates.map(toISODate)).toEqual(["2026-11-06", "2026-11-13", "2026-11-20"]); expect(new Set(dates.map((d) => periodKey(f, d))).size).toBe(3); });
  it("anual e personalizada respeitam a âncora", () => { expect(occurrencesBetween(fixed({ frequency: "yearly", start_date: "2024-02-29" }), new Date(2026, 0, 1), new Date(2026, 11, 31)).map(toISODate)).toEqual(["2026-02-28"]); expect(occurrencesBetween(fixed({ frequency: "custom", interval_months: 3, due_day: 10, start_date: "2026-08-10" }), today, new Date(2027, 1, 28)).map(toISODate)).toEqual(["2026-11-10", "2027-02-10"]); });
  it("novo compromisso não gera atrasados anteriores ao cadastro", () => expect(monthOnly([fixed({ due_day: 5, start_date: "2026-11-06" })])).toHaveLength(0));
  it("mensal equivalente usa frequência, não duplica parcelas", () => { expect(monthlyEquivalent(fixed({ frequency: "weekly", amount: 120 }))).toBe(520); expect(monthlyEquivalent(fixed({ frequency: "yearly", amount: 1200 }))).toBe(100); expect(monthlyEquivalent(fixed({ frequency: "custom", amount: 600, interval_months: 3 }))).toBe(200); });
});

describe("gastos fixos: pagamento e ausência de dupla contagem", () => {
  it("sem compromissos tem totais zero", () => expect(fixedSummary([], [], [], today)).toMatchObject({ monthlyTotal: 0, activeCount: 0, monthRemaining: 0 }));
  it("vencido / em breve / futuro são calculados pela data", () => expect(monthOnly([fixed({ id: "a", due_day: 5 }), fixed({ id: "b", due_day: 10 }), fixed({ id: "c", due_day: 20 })]).map((d) => d.status)).toEqual(["vencida", "em_breve", "a_vencer"]));
  it("pagamento no período elimina só o compromisso correspondente", () => { expect(monthOnly([fixed()], [payment()])[0]?.status).toBe("paga"); expect(unpaidFixedDues([fixed({ start_date: "2026-11-01" })], [payment()], [], today, new Date(2026, 10, 30))).toHaveLength(0); });
  it("pausar remove compromissos novos; reativar restaura", () => { expect(monthOnly([fixed({ active: false })])).toHaveLength(0); expect(monthOnly([fixed({ active: true })])).toHaveLength(1); expect(monthOnly([fixed({ active: false })], [payment()])[0]?.status).toBe("paga"); });
  it("transação correspondente já registrada não é descontada de novo", () => { const c = context({ fixedExpenses: [fixed({ start_date: "2026-11-01" })], transactions: [tx("t", "2026-11-09")] }); expect(monthOnly(c.fixedExpenses ?? [], [], [tx("t", "2026-11-09")])[0]?.status).toBe("registrada"); expect(cashPicture(c, today, new Date(2026, 10, 30)).obligations).toHaveLength(0); });
  it("categoria e valor iguais não bastam para dar uma conta como paga", () => expect(monthOnly([fixed()], [], [tx("t", "2026-11-09", "Outra compra")])[0]?.status).toBe("em_breve"));
  it("pagamento de fatura nunca corresponde a gasto fixo", () => expect(monthOnly([fixed()], [], [tx("t", "2026-11-09", "Internet", 100, { invoice_payment_id: "invoice" })])[0]?.status).toBe("em_breve"));
  it("uma transação não cobre dois compromissos", () => expect(monthOnly([fixed(), fixed({ id: "f2" })], [], [tx("t", "2026-11-09")]).filter((d) => d.status === "registrada")).toHaveLength(1));
  it("conta variável usa valor registrado quando correspondência é segura", () => expect(monthOnly([fixed({ is_estimate: true })], [], [tx("t", "2026-11-09", "Internet", 125)])[0]).toMatchObject({ amount: 125, status: "registrada" }));
  it("não duplica recorrência cadastrada nos cálculos da IA", () => { const c = context({ fixedExpenses: [fixed({ start_date: "2026-11-01" })], transactions: [tx("a", "2026-09-10"), tx("b", "2026-10-10")] }); expect(cashPicture(c, today, new Date(2026, 10, 30)).obligations.map((o) => o.amount)).toEqual([100]); });
  it("perguntas de gastos fixos são somente leitura", () => { const c = context({ fixedExpenses: [fixed()] }); expect(planningReply("Quais são meus gastos fixos?", EMPTY_PLANNING, c, NOW)?.launchText).toBeUndefined(); expect(parseLaunchCommand("Quais são meus gastos fixos?", c)).toBeNull(); expect(fixedExpensesAnswer(c, NOW)).toContain("Comprometido por mês"); });
});

describe("sugestões: não cadastram automaticamente", () => {
  const rows = [tx("a", "2026-09-10"), tx("b", "2026-10-10"), tx("c", "2026-11-04")];
  it("exige histórico suficiente", () => { expect(detectRecurrences(rows.slice(0, 2), [], new Set(), today)).toHaveLength(0); expect(detectRecurrences(rows, [], new Set(), today)[0]).toMatchObject({ name: "Internet", amount: 100, frequency: "monthly" }); });
  it("ignoradas e já adicionadas não reaparecem", () => { expect(detectRecurrences(rows, [], new Set(["internet"]), today)).toHaveLength(0); expect(detectRecurrences(rows, [fixed({ source_signature: "internet" })], new Set(), today)).toHaveLength(0); });
  it("pagamentos de fatura e descrições de parcelas não são sugestões", () => { expect(detectRecurrences(rows.map((t) => ({ ...t, invoice_payment_id: "p" })), [], new Set(), today)).toHaveLength(0); expect(detectRecurrences(rows.map((t) => ({ ...t, description: "Notebook parcela 2/10" })), [], new Set(), today)).toHaveLength(0); });
  it("detecta semanal só com quatro ocorrências", () => { const weekly = [7, 14, 21, 28].map((d) => tx(`${d}`, `2026-10-${String(d).padStart(2, "0")}`, "Faxina", 120)); expect(detectRecurrences(weekly.slice(1), [], new Set(), today)).toHaveLength(0); expect(detectRecurrences(weekly, [], new Set(), today)[0]?.frequency).toBe("weekly"); });
});

describe("formulário: valores e datas válidos", () => {
  const form: FixedForm = { name: "Internet", amount: "100,50", is_estimate: false, category_id: null, frequency: "monthly", interval_months: 1, due_day: 10, next_date: "2026-11-10", payment_method: null, note: "" };
  it("converte BRL e preserva início ao editar mensal", () => { expect(formToValues(form, today)).toMatchObject({ amount: 100.5, start_date: "2026-11-06" }); expect(formToValues(form, today, fixed())).toMatchObject({ start_date: "2026-08-01" }); });
  it("rejeita zero, frações de dia, data impossível e intervalo inválido", () => { expect(validateFixedForm({ ...form, amount: "0" })).not.toBeNull(); expect(validateFixedForm({ ...form, due_day: 1.5 })).not.toBeNull(); expect(validateFixedForm({ ...form, frequency: "yearly", next_date: "2026-02-31" })).not.toBeNull(); expect(validateFixedForm({ ...form, frequency: "custom", interval_months: 25 })).not.toBeNull(); });
});
import { addMonths, monthKey, num } from "@/lib/finance";

type SavingsTransaction = { date: string; type: string; amount: number | string; invoice_payment_id?: string | null };

/**
 * Consumption expense: an expense that is not an automatic card-invoice payment.
 * Card purchases already count as expenses when they happen, so invoice payments
 * (invoice_payment_id IS NOT NULL) are cash outflow only, never consumption.
 */
export function isConsumptionExpense(t: SavingsTransaction) {
  return t.type === "expense" && !t.invoice_payment_id;
}

export type SavingsMonth = {
  key: string;
  income: number;
  expenses: number;
  saved: number;
  rate: number | null;
  hasData: boolean;
};

export function savingsMonthKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit",
  }).formatToParts(now);
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}`;
}

/** Savings rate = (income − consumption expenses) ÷ income × 100. Invoice payments are excluded to avoid double counting card purchases. */
export function savingsForMonth(transactions: SavingsTransaction[], key: string): SavingsMonth {
  const rows = transactions.filter((t) => t.date.slice(0, 7) === key && (t.type === "income" || isConsumptionExpense(t)));
  const income = rows.filter((t) => t.type === "income").reduce((sum, t) => sum + num(t.amount), 0);
  const expenses = rows.filter((t) => t.type === "expense").reduce((sum, t) => sum + num(t.amount), 0);
  const saved = income - expenses;
  return { key, income, expenses, saved, rate: income > 0 ? saved / income * 100 : null, hasData: rows.length > 0 };
}

export function savingsHistory(transactions: SavingsTransaction[], current: string) {
  const [year = 1970, month = 1] = current.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  return Array.from({ length: 12 }, (_, i) => savingsForMonth(transactions, monthKey(addMonths(start, i - 11))));
}

export function savingsPercent(rate: number | null) {
  return rate === null ? "—" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(rate)}%`;
}
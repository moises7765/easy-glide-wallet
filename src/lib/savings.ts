import { addMonths, monthKey, num } from "@/lib/finance";

type SavingsTransaction = { date: string; type: string; amount: number | string };

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

/** Uses the same recorded income/expense totals as Home; no synthetic rows or extra invoice charges. */
export function savingsForMonth(transactions: SavingsTransaction[], key: string): SavingsMonth {
  const rows = transactions.filter((t) => t.date.slice(0, 7) === key && (t.type === "income" || t.type === "expense"));
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
import type { Tables } from "@/integrations/supabase/types";

export type Transaction = Tables<"transactions">;
export type Category = Tables<"categories">;
export type Card = Tables<"cards">;
export type InstallmentPurchase = Tables<"installment_purchases">;
export type Asset = Tables<"assets">;
export type Goal = Tables<"goals">;
export type EmergencyFund = Tables<"emergency_fund">;
export type Budget = Tables<"budgets">;
export type Snapshot = Tables<"net_worth_snapshots">;

export const PAYMENT_METHODS = [
  { value: "pix", label: "Pix" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "boleto", label: "Boleto" },
  { value: "transferencia", label: "Transferência" },
] as const;

export const ASSET_KINDS = [
  { value: "cash", label: "Dinheiro" },
  { value: "bank", label: "Conta bancária" },
  { value: "wallet", label: "Carteira" },
  { value: "investment", label: "Investimentos" },
  { value: "vehicle", label: "Veículos" },
  { value: "property", label: "Imóveis" },
  { value: "other", label: "Outros bens" },
] as const;

export function brl(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

export function brlShort(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `R$ ${(value / 1000).toFixed(1)}k`;
  return `R$ ${value.toFixed(0)}`;
}

export const num = (v: unknown) => Number(v ?? 0);

/** "2026-08" for a Date */
export function monthKey(d: Date | string) {
  const date = typeof d === "string" ? parseDate(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Parses "YYYY-MM-DD" as a local date (avoids timezone shifts). */
export function parseDate(value: string) {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addMonths(d: Date, n: number) {
  const date = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(d.getDate(), lastDay));
  return date;
}

export function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, 1)
    .toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
    .replace(".", "");
}

export function monthInitialUpper(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, 1)
    .toLocaleDateString("pt-BR", { month: "long" })
    .slice(0, 3)
    .toUpperCase();
}

export function formatDayMonth(value: string) {
  return parseDate(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/**
 * Month shown on the dashboard: the current calendar month when it has
 * transactions, otherwise the most recent month with data — so imported
 * statements from a previous month still appear in the indicators.
 */
export function displayMonthKey(transactions: { date: string }[]) {
  const nowKey = monthKey(new Date());
  if (transactions.length === 0 || transactions.some((t) => monthKey(t.date) === nowKey)) {
    return nowKey;
  }
  return transactions.map((t) => monthKey(t.date)).sort().at(-1) ?? nowKey;
}

/** Schedule of every installment of a purchase. */
export type InstallmentLine = {
  purchase: InstallmentPurchase;
  index: number;
  amount: number;
  dueDate: Date;
  monthKey: string;
  paid: boolean;
};

export function installmentLines(p: InstallmentPurchase): InstallmentLine[] {
  const count = Math.max(1, p.installments_count);
  const amount = num(p.total_amount) / count;
  const first = parseDate(p.first_due_date);
  return Array.from({ length: count }, (_, i) => {
    const dueDate = addMonths(first, i);
    return {
      purchase: p,
      index: i + 1,
      amount,
      dueDate,
      monthKey: monthKey(dueDate),
      paid: i < p.installments_paid,
    };
  });
}

export function remainingOf(p: InstallmentPurchase) {
  const count = Math.max(1, p.installments_count);
  const left = Math.max(0, count - p.installments_paid);
  return { count, left, amount: num(p.total_amount) / count, total: (num(p.total_amount) / count) * left };
}

/** Invoice (fatura) of a card for a given month key. */
export function cardInvoice(
  cardId: string,
  key: string,
  transactions: Transaction[],
  purchases: InstallmentPurchase[],
) {
  const single = transactions
    .filter((t) => t.card_id === cardId && t.type === "expense" && monthKey(t.date) === key)
    .reduce((s, t) => s + num(t.amount), 0);
  const parcels = purchases
    .filter((p) => p.card_id === cardId)
    .flatMap(installmentLines)
    .filter((l) => l.monthKey === key)
    .reduce((s, l) => s + l.amount, 0);
  return single + parcels;
}

export function nextMonthKeys(count: number, from = new Date()) {
  return Array.from({ length: count }, (_, i) => monthKey(addMonths(from, i)));
}

export function cardUsed(cardId: string, transactions: Transaction[], purchases: InstallmentPurchase[]) {
  const committed = purchases
    .filter((p) => p.card_id === cardId)
    .reduce((s, p) => s + remainingOf(p).total, 0);
  const current = cardInvoice(cardId, monthKey(new Date()), transactions, purchases);
  const currentSingles = transactions
    .filter(
      (t) => t.card_id === cardId && t.type === "expense" && monthKey(t.date) === monthKey(new Date()),
    )
    .reduce((s, t) => s + num(t.amount), 0);
  void current;
  return committed + currentSingles;
}

export function pct(current: number, target: number) {
  if (!target) return 0;
  return Math.min(100, Math.max(0, (current / target) * 100));
}
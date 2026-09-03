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

/* ---------------------------------------------------------------------------
 * Ciclo de fatura do cartão
 * Uma fatura é identificada pela chave "YYYY-MM" do seu VENCIMENTO.
 * O fechamento acontece no closing_day; quando closing_day >= due_day o
 * fechamento cai no mês anterior ao vencimento.
 * ------------------------------------------------------------------------- */

export type CardCycle = Pick<Card, "closing_day" | "due_day">;

const clampDay = (year: number, monthIndex: number, day: number) => {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(Math.max(1, day), last));
};

function keyParts(key: string) {
  const [y, m] = key.split("-").map(Number);
  return { year: y ?? 1970, monthIndex: (m ?? 1) - 1 };
}

/** Vencimento da fatura de chave `key`. */
export function invoiceDueDate(card: CardCycle, key: string) {
  const { year, monthIndex } = keyParts(key);
  return clampDay(year, monthIndex, card.due_day);
}

/** Fechamento da fatura de chave `key` (mês anterior quando fechamento >= vencimento). */
export function invoiceClosingDate(card: CardCycle, key: string) {
  const { year, monthIndex } = keyParts(key);
  const offset = card.closing_day < card.due_day ? 0 : -1;
  return clampDay(year, monthIndex + offset, card.closing_day);
}

/** Chave da fatura à qual pertence uma compra feita em `date`. */
export function invoiceKeyForDate(card: CardCycle, date: Date | string) {
  const d = typeof date === "string" ? parseDate(date) : date;
  const closingThisMonth = clampDay(d.getFullYear(), d.getMonth(), card.closing_day);
  // Compras até o fechamento entram no ciclo que fecha neste mês; depois, no próximo.
  const closing = d <= closingThisMonth ? closingThisMonth : clampDay(d.getFullYear(), d.getMonth() + 1, card.closing_day);
  const dueMonthOffset = card.closing_day < card.due_day ? 0 : 1;
  const due = clampDay(closing.getFullYear(), closing.getMonth() + dueMonthOffset, card.due_day);
  return monthKey(due);
}

/** Invoice (fatura) de um cartão para uma chave de vencimento. */
export function cardInvoice(
  cardId: string,
  key: string,
  transactions: Transaction[],
  purchases: InstallmentPurchase[],
  card?: CardCycle | null,
) {
  const keyOf = (date: string) => (card ? invoiceKeyForDate(card, date) : monthKey(date));
  const single = transactions
    .filter((t) => t.card_id === cardId && t.type === "expense" && keyOf(t.date) === key)
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

export type InvoiceStatus = "paga" | "fechada" | "aberta";

export type CardInvoice = {
  key: string;
  amount: number;
  dueDate: Date;
  closingDate: Date;
  paid: boolean;
  paidAt: string | null;
  status: InvoiceStatus;
  /** Vencida e ainda não paga. */
  overdue: boolean;
  daysToDue: number;
};

export type InvoicePayment = { card_id: string; invoice_key: string; paid_at: string };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (a: Date, b: Date) =>
  Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000);

/** Chaves de faturas com algum valor, mais as próximas `future` faturas. */
export function cardInvoiceKeys(
  card: Card,
  transactions: Transaction[],
  purchases: InstallmentPurchase[],
  future = 6,
  now = new Date(),
) {
  const keys = new Set<string>();
  transactions
    .filter((t) => t.card_id === card.id && t.type === "expense")
    .forEach((t) => keys.add(invoiceKeyForDate(card, t.date)));
  purchases
    .filter((p) => p.card_id === card.id)
    .flatMap(installmentLines)
    .forEach((l) => keys.add(l.monthKey));
  keys.add(invoiceKeyForDate(card, now));
  nextMonthKeys(future + 1, now).forEach((k) => keys.add(k));
  return [...keys].sort();
}

export function buildCardInvoices(
  card: Card,
  transactions: Transaction[],
  purchases: InstallmentPurchase[],
  payments: InvoicePayment[] = [],
  now = new Date(),
): CardInvoice[] {
  const paidMap = new Map(
    payments.filter((p) => p.card_id === card.id).map((p) => [p.invoice_key, p.paid_at]),
  );
  return cardInvoiceKeys(card, transactions, purchases, 6, now).map((key) => {
    const amount = cardInvoice(card.id, key, transactions, purchases, card);
    const dueDate = invoiceDueDate(card, key);
    const closingDate = invoiceClosingDate(card, key);
    const paidAt = paidMap.get(key) ?? null;
    const paid = paidAt !== null;
    const status: InvoiceStatus = paid ? "paga" : now > closingDate ? "fechada" : "aberta";
    return {
      key,
      amount,
      dueDate,
      closingDate,
      paid,
      paidAt,
      status,
      overdue: !paid && startOfDay(now) > startOfDay(dueDate),
      daysToDue: dayDiff(dueDate, now),
    };
  });
}

/**
 * Faturas pendentes: tudo que ainda não foi pago e já tem valor — inclusive
 * faturas de ciclos anteriores. A virada do mês nunca "paga" uma fatura.
 */
export function pendingInvoices(invoices: CardInvoice[]) {
  return invoices.filter((i) => !i.paid && i.amount > 0.005);
}

/** Fatura em foco: a mais antiga pendente; senão a próxima a vencer. */
export function currentInvoice(invoices: CardInvoice[], now = new Date()) {
  const pending = pendingInvoices(invoices);
  if (pending.length > 0) return pending[0]!;
  return invoices.find((i) => i.dueDate >= startOfDay(now)) ?? invoices.at(-1) ?? null;
}

/** Limite usado: parcelas restantes + faturas não pagas de compras à vista. */
export function cardUsed(
  cardId: string,
  transactions: Transaction[],
  purchases: InstallmentPurchase[],
  card?: Card | null,
  payments: InvoicePayment[] = [],
) {
  const committed = purchases
    .filter((p) => p.card_id === cardId)
    .reduce((s, p) => s + remainingOf(p).total, 0);
  const paidKeys = new Set(
    payments.filter((p) => p.card_id === cardId).map((p) => p.invoice_key),
  );
  const keyOf = (date: string) => (card ? invoiceKeyForDate(card, date) : monthKey(date));
  const singles = transactions
    .filter((t) => t.card_id === cardId && t.type === "expense" && !paidKeys.has(keyOf(t.date)))
    .reduce((s, t) => s + num(t.amount), 0);
  return committed + singles;
}


export function pct(current: number, target: number) {
  if (!target) return 0;
  return Math.min(100, Math.max(0, (current / target) * 100));
}
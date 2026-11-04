import type { Tables } from "@/integrations/supabase/types";
import { addMonths, monthKey, num, parseDate, toISODate } from "@/lib/finance";

/**
 * Gastos fixos: compromissos recorrentes cadastrados pelo usuário (planejamento).
 * Nada aqui cria lançamentos. Um vencimento só conta como "pago" quando há um
 * registro em fixed_expense_payments (ação explícita) ou, para não subtrair duas
 * vezes, quando um lançamento já registrado corresponde claramente a ele.
 */

export type FixedExpense = Tables<"fixed_expenses">;
export type FixedPayment = Tables<"fixed_expense_payments">;
type Tx = Pick<Tables<"transactions">, "id" | "date" | "type" | "amount" | "description" | "category_id" | "card_id" | "invoice_payment_id"> &
  Partial<Pick<Tables<"transactions">, "payment_method">>;

export type Frequency = "weekly" | "monthly" | "yearly" | "custom";

export const FREQUENCIES: Array<{ value: Frequency; label: string }> = [
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensal" },
  { value: "yearly", label: "Anual" },
  { value: "custom", label: "Personalizada" },
];

const DAY = 86_400_000;
/** Quantos dias para trás um vencimento não pago ainda aparece como vencido. */
export const OVERDUE_WINDOW_DAYS = 45;
export const SOON_DAYS = 5;

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (a: Date, b: Date) => Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY);
const clampDay = (year: number, monthIndex: number, day: number) => {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(Math.max(1, day), last));
};

/** Data de hoje no calendário de Brasília (independe do fuso do aparelho). */
export function fixedToday(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(get("year"), get("month") - 1, get("day"));
}

export function frequencyLabel(f: Pick<FixedExpense, "frequency" | "interval_months">) {
  if (f.frequency === "custom") return f.interval_months === 1 ? "Mensal" : `A cada ${f.interval_months} meses`;
  return FREQUENCIES.find((x) => x.value === f.frequency)?.label ?? "Mensal";
}

/** Valor equivalente por mês (semanal × 52/12, anual ÷ 12, personalizada ÷ intervalo). */
export function monthlyEquivalent(f: Pick<FixedExpense, "amount" | "frequency" | "interval_months">) {
  const amount = num(f.amount);
  if (f.frequency === "weekly") return (amount * 52) / 12;
  if (f.frequency === "yearly") return amount / 12;
  if (f.frequency === "custom") return amount / Math.max(1, f.interval_months);
  return amount;
}

/** Chave estável do período: mês para mensal/anual/personalizada; semana (segunda-feira) para semanal. */
export function periodKey(f: Pick<FixedExpense, "frequency">, date: Date) {
  if (f.frequency === "weekly") {
    const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
    return `W${toISODate(monday)}`;
  }
  return monthKey(date);
}

/** Vencimentos de um gasto fixo entre `from` e `to` (inclusive), nunca antes de start_date. */
export function occurrencesBetween(f: Pick<FixedExpense, "frequency" | "interval_months" | "due_day" | "start_date">, from: Date, to: Date): Date[] {
  const start = parseDate(f.start_date);
  const lo = startOfDay(from) > start ? startOfDay(from) : start;
  const hi = startOfDay(to);
  if (hi < lo) return [];
  const out: Date[] = [];
  if (f.frequency === "weekly") {
    const skip = Math.max(0, Math.floor(dayDiff(lo, start) / 7));
    for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + skip * 7); d <= hi; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
      if (d >= lo) out.push(d);
    }
    return out;
  }
  const step = f.frequency === "yearly" ? 12 : f.frequency === "custom" ? Math.max(1, f.interval_months) : 1;
  const day = f.frequency === "yearly" ? start.getDate() : f.due_day;
  const monthsFromStart = (lo.getFullYear() - start.getFullYear()) * 12 + (lo.getMonth() - start.getMonth());
  let k = Math.max(0, Math.floor(monthsFromStart / step) - 1);
  for (;;) {
    const d = clampDay(start.getFullYear(), start.getMonth() + k * step, day);
    if (d > hi) break;
    if (d >= lo) out.push(d);
    k += 1;
  }
  return out;
}

/** Próximo vencimento a partir de hoje (inclusive), ou null para pausados. */
export function nextDueDate(f: FixedExpense, today: Date) {
  if (!f.active) return null;
  return occurrencesBetween(f, today, new Date(today.getFullYear() + 2, today.getMonth(), today.getDate()))[0] ?? null;
}

/* --------------------------------------------------------------------------
 * Correspondência com lançamentos já registrados (evita contar duas vezes)
 * ------------------------------------------------------------------------ */

const STOP = new Set(["conta", "contas", "pagamento", "pagto", "pgto", "mensal", "mensalidade", "fatura", "boleto", "debito", "pix", "compra", "para", "com", "dos", "das"]);
const tokens = (value: string) =>
  normalize(value).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !STOP.has(w));

/** Mesmo compromisso pelo nome: alguma palavra relevante em comum ("Conta de luz" × "Luz Enel"). */
export function sameName(a: string, b: string) {
  const ta = tokens(a);
  const tb = new Set(tokens(b));
  return ta.some((w) => tb.has(w));
}

function amountTolerance(f: Pick<FixedExpense, "amount" | "is_estimate">) {
  const amount = num(f.amount);
  return f.is_estimate ? Math.max(5, amount * 0.4) : Math.max(2, amount * 0.1);
}

/**
 * Lançamento que corresponde ao vencimento: despesa (não pagamento de fatura), perto da data,
 * valor dentro da tolerância e mesmo nome — ou mesma categoria com valor quase igual.
 */
export function matchTransaction(f: FixedExpense, due: Date, transactions: Tx[], excluded: Set<string>): Tx | null {
  const before = f.frequency === "weekly" ? 3 : 12;
  const after = f.frequency === "weekly" ? 3 : 7;
  const tolerance = amountTolerance(f);
  const amount = num(f.amount);
  const candidates = transactions.filter((t) => {
    if (t.type !== "expense" || t.invoice_payment_id || excluded.has(t.id)) return false;
    const diff = dayDiff(parseDate(t.date), due);
    if (diff < -before || diff > after) return false;
    const delta = Math.abs(num(t.amount) - amount);
    if (delta > tolerance) return false;
    if (sameName(f.name, t.description ?? "")) return true;
    return Boolean(f.category_id) && t.category_id === f.category_id && delta <= Math.max(1, amount * 0.03);
  });
  return candidates.sort((a, b) => Math.abs(dayDiff(parseDate(a.date), due)) - Math.abs(dayDiff(parseDate(b.date), due)))[0] ?? null;
}

/* --------------------------------------------------------------------------
 * Agenda de vencimentos com status
 * ------------------------------------------------------------------------ */

export type DueStatus = "paga" | "registrada" | "vencida" | "em_breve" | "a_vencer";

export const STATUS_LABEL: Record<DueStatus, string> = {
  paga: "Paga",
  registrada: "Lançamento encontrado",
  vencida: "Vencida",
  em_breve: "Vence em breve",
  a_vencer: "A vencer",
};

export type DueItem = {
  fixed: FixedExpense;
  date: Date;
  key: string;
  /** Valor pago, o do lançamento encontrado ou o valor cadastrado (estimado, se variável). */
  amount: number;
  status: DueStatus;
  daysToDue: number;
  payment: FixedPayment | null;
  matched: Tx | null;
};

/** true quando o vencimento já está coberto (pagamento marcado ou lançamento correspondente). */
export const isSettled = (item: Pick<DueItem, "status">) => item.status === "paga" || item.status === "registrada";

export function dueSchedule(
  fixedExpenses: FixedExpense[],
  payments: FixedPayment[],
  transactions: Tx[],
  today: Date,
  from: Date,
  to: Date,
): DueItem[] {
  const linked = new Set(payments.map((p) => p.transaction_id).filter((id): id is string => Boolean(id)));
  const used = new Set(linked);
  const items: DueItem[] = [];
  const ordered = [...fixedExpenses].sort((a, b) => a.created_at.localeCompare(b.created_at));
  ordered.forEach((f) => {
    const own = payments.filter((p) => p.fixed_expense_id === f.id);
    occurrencesBetween(f, from, to).forEach((date) => {
      const key = periodKey(f, date);
      const payment = own.find((p) => p.period_key === key) ?? null;
      // Pausado: só mostra o que já foi pago; não gera compromissos novos.
      if (!f.active && !payment) return;
      const daysToDue = dayDiff(date, today);
      if (payment) {
        items.push({ fixed: f, date, key, amount: num(payment.amount), status: "paga", daysToDue, payment, matched: null });
        return;
      }
      const matched = matchTransaction(f, date, transactions, used);
      if (matched) {
        used.add(matched.id);
        items.push({ fixed: f, date, key, amount: num(matched.amount), status: "registrada", daysToDue, payment: null, matched });
        return;
      }
      if (daysToDue < -OVERDUE_WINDOW_DAYS) return;
      const status: DueStatus = daysToDue < 0 ? "vencida" : daysToDue <= SOON_DAYS ? "em_breve" : "a_vencer";
      items.push({ fixed: f, date, key, amount: num(f.amount), status, daysToDue, payment: null, matched: null });
    });
  });
  return items.sort((a, b) => a.date.getTime() - b.date.getTime() || a.fixed.name.localeCompare(b.fixed.name));
}

/** Vencimentos ainda não cobertos entre hoje−45 dias e `until`: o que de fato falta pagar. */
export function unpaidFixedDues(fixedExpenses: FixedExpense[], payments: FixedPayment[], transactions: Tx[], today: Date, until: Date) {
  const from = new Date(today.getTime() - OVERDUE_WINDOW_DAYS * DAY);
  return dueSchedule(fixedExpenses, payments, transactions, today, from, until).filter((i) => !isSettled(i));
}

export type FixedSummary = {
  monthlyTotal: number;
  activeCount: number;
  pausedCount: number;
  estimateCount: number;
  /** Mês atual: total previsto, já coberto e o que falta. */
  monthDue: number;
  monthSettled: number;
  monthRemaining: number;
  overdue: DueItem[];
  upcoming: DueItem[];
};

export function fixedSummary(fixedExpenses: FixedExpense[], payments: FixedPayment[], transactions: Tx[], today: Date): FixedSummary {
  const active = fixedExpenses.filter((f) => f.active);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const month = dueSchedule(fixedExpenses, payments, transactions, today, monthStart, monthEnd);
  const window = dueSchedule(fixedExpenses, payments, transactions, today, new Date(today.getTime() - OVERDUE_WINDOW_DAYS * DAY), new Date(today.getTime() + 35 * DAY));
  const monthDue = month.reduce((s, i) => s + i.amount, 0);
  const monthSettled = month.filter(isSettled).reduce((s, i) => s + i.amount, 0);
  return {
    monthlyTotal: active.reduce((s, f) => s + monthlyEquivalent(f), 0),
    activeCount: active.length,
    pausedCount: fixedExpenses.length - active.length,
    estimateCount: active.filter((f) => f.is_estimate).length,
    monthDue,
    monthSettled,
    monthRemaining: Math.max(0, monthDue - monthSettled),
    overdue: window.filter((i) => i.status === "vencida"),
    upcoming: window.filter((i) => !isSettled(i) && i.status !== "vencida"),
  };
}

/** Gastos fixos cujo valor pago subiu em relação ao período anterior (pagamentos marcados ou lançamentos encontrados). */
export function fixedIncreases(fixedExpenses: FixedExpense[], payments: FixedPayment[], transactions: Tx[], today: Date) {
  const from = addMonths(new Date(today.getFullYear(), today.getMonth(), 1), -6);
  const settled = dueSchedule(fixedExpenses, payments, transactions, today, from, today).filter(isSettled);
  return fixedExpenses
    .map((f) => {
      const history = settled.filter((i) => i.fixed.id === f.id);
      if (history.length < 2) return null;
      const last = history.at(-1)!;
      const previous = history.at(-2)!;
      const delta = last.amount - previous.amount;
      if (delta < 1 || delta < previous.amount * 0.05) return null;
      return { fixed: f, previous: previous.amount, last: last.amount, delta, lastDate: last.date };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

/* --------------------------------------------------------------------------
 * Sugestões de recorrência a partir dos lançamentos (nunca cadastra sozinha)
 * ------------------------------------------------------------------------ */

export type RecurrenceSuggestion = {
  signature: string;
  name: string;
  amount: number;
  isEstimate: boolean;
  frequency: "weekly" | "monthly";
  dueDay: number;
  nextDate: string;
  occurrences: number;
  firstDate: string;
  lastDate: string;
  categoryId: string | null;
  paymentMethod: string | null;
};

const GENERIC = new Set(["", "despesa", "compra", "gasto", "pix", "transferencia", "pagamento", "saque", "debito", "credito"]);

/** Assinatura estável da descrição: sem acentos, números e pontuação. */
export function recurrenceSignature(description: string) {
  return normalize(description).replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};
const mostFrequent = <T,>(values: T[]) => {
  const counts = new Map<T, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

/**
 * Padrões mensais (≥3 meses distintos, intervalos de ~1 mês) ou semanais (≥4 vezes, ~7 dias),
 * ainda ativos e com valor estável (variação até 35%; acima de 8% vira estimativa).
 * Ignora receitas, pagamentos de fatura, parcelas e o que já foi adicionado ou ignorado.
 */
export function detectRecurrences(
  transactions: Tx[],
  fixedExpenses: Pick<FixedExpense, "name" | "source_signature">[],
  dismissed: Set<string>,
  today: Date,
): RecurrenceSuggestion[] {
  const since = new Date(today.getTime() - 200 * DAY);
  const groups = new Map<string, Tx[]>();
  transactions.forEach((t) => {
    if (t.type !== "expense" || t.invoice_payment_id) return;
    const date = parseDate(t.date);
    if (date < since || date > today) return;
    const raw = t.description ?? "";
    if (/parcela|\b\d{1,2}\s*\/\s*\d{1,2}\b/i.test(raw)) return;
    const signature = recurrenceSignature(raw);
    if (GENERIC.has(signature) || signature.length < 3) return;
    groups.set(signature, [...(groups.get(signature) ?? []), t]);
  });
  const known = new Set(fixedExpenses.map((f) => f.source_signature).filter((s): s is string => Boolean(s)));
  const out: RecurrenceSuggestion[] = [];
  groups.forEach((rows, signature) => {
    if (dismissed.has(signature) || known.has(signature)) return;
    if (fixedExpenses.some((f) => sameName(f.name, signature) || recurrenceSignature(f.name) === signature)) return;
    // Um lançamento por dia; vários no mesmo dia somam.
    const byDay = new Map<string, Tx[]>();
    rows.forEach((t) => byDay.set(t.date.slice(0, 10), [...(byDay.get(t.date.slice(0, 10)) ?? []), t]));
    const days = [...byDay.keys()].sort();
    if (days.length < 3) return;
    const dates = days.map(parseDate);
    const gaps = dates.slice(1).map((d, i) => dayDiff(d, dates[i]!));
    const gap = median(gaps);
    const amounts = days.map((d) => byDay.get(d)!.reduce((s, t) => s + num(t.amount), 0));
    const typical = median(amounts);
    if (typical <= 0) return;
    const spread = Math.max(...amounts.map((a) => Math.abs(a - typical))) / typical;
    if (spread > 0.35) return;
    const last = dates.at(-1)!;
    let frequency: "weekly" | "monthly";
    if (gap >= 26 && gap <= 35 && gaps.every((g) => g >= 20 && g <= 40)) {
      if (new Set(days.map((d) => d.slice(0, 7))).size < 3 || dayDiff(today, last) > 45) return;
      frequency = "monthly";
    } else if (gap >= 6 && gap <= 8 && gaps.every((g) => g >= 5 && g <= 10)) {
      if (days.length < 4 || dayDiff(today, last) > 14) return;
      frequency = "weekly";
    } else return;
    const dueDay = Math.round(median(dates.map((d) => d.getDate())));
    let next: Date;
    if (frequency === "weekly") {
      next = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 7);
      while (next < today) next = new Date(next.getFullYear(), next.getMonth(), next.getDate() + 7);
    } else {
      next = clampDay(today.getFullYear(), today.getMonth(), dueDay);
      if (monthKey(last) === monthKey(today) || next < today) next = clampDay(today.getFullYear(), today.getMonth() + 1, dueDay);
    }
    const latest = byDay.get(days.at(-1)!)!.at(-1)!;
    out.push({
      signature,
      name: (latest.description ?? signature).trim(),
      amount: Math.round(typical * 100) / 100,
      isEstimate: spread > 0.08,
      frequency,
      dueDay,
      nextDate: toISODate(next),
      occurrences: days.length,
      firstDate: days[0]!,
      lastDate: days.at(-1)!,
      categoryId: mostFrequent(rows.map((t) => t.category_id)),
      paymentMethod: mostFrequent(rows.map((t) => t.payment_method ?? null)),
    });
  });
  return out.sort((a, b) => b.occurrences - a.occurrences || b.amount - a.amount);
}

/* --------------------------------------------------------------------------
 * Formulário
 * ------------------------------------------------------------------------ */

export type FixedForm = {
  name: string;
  amount: string;
  is_estimate: boolean;
  category_id: string | null;
  frequency: Frequency;
  interval_months: number;
  due_day: number;
  /** Próximo vencimento (semanal, anual, personalizada). */
  next_date: string;
  payment_method: string | null;
  note: string;
};

export function parseAmountInput(value: string) {
  const clean = value.trim().replace(/\s|R\$/gi, "");
  const n = clean.includes(",") ? Number(clean.replace(/\./g, "").replace(",", ".")) : Number(clean);
  return Number.isFinite(n) ? n : NaN;
}

/** Valida o formulário; retorna a mensagem de erro ou null. */
export function validateFixedForm(form: FixedForm): string | null {
  if (!form.name.trim()) return "Informe o nome do gasto fixo.";
  if (form.name.trim().length > 80) return "Use um nome com até 80 caracteres.";
  const amount = parseAmountInput(form.amount);
  if (!(amount > 0)) return "Informe um valor maior que zero.";
  if (amount >= 100_000_000) return "Valor muito alto.";
  if (form.frequency === "monthly" && !(form.due_day >= 1 && form.due_day <= 31)) return "O dia do vencimento vai de 1 a 31.";
  if (form.frequency !== "monthly" && !/^\d{4}-\d{2}-\d{2}$/.test(form.next_date)) return "Informe a data do próximo vencimento.";
  if (form.frequency === "custom" && !(form.interval_months >= 1 && form.interval_months <= 24)) return "O intervalo vai de 1 a 24 meses.";
  if (form.note.length > 500) return "Observações com até 500 caracteres.";
  return null;
}

/**
 * Converte o formulário em colunas. Mensal: o ciclo começa hoje (vencimentos anteriores ao
 * cadastro nunca aparecem como vencidos). Demais: o próximo vencimento informado é a âncora.
 */
export function formToValues(form: FixedForm, today: Date, existing?: Pick<FixedExpense, "frequency" | "start_date" | "due_day"> | null) {
  const base = {
    name: form.name.trim(),
    amount: Math.round(parseAmountInput(form.amount) * 100) / 100,
    is_estimate: form.is_estimate,
    category_id: form.category_id,
    frequency: form.frequency,
    payment_method: form.payment_method,
    note: form.note.trim() || null,
  };
  if (form.frequency === "monthly") {
    const keepStart = existing?.frequency === "monthly" ? existing.start_date : toISODate(today);
    return { ...base, interval_months: 1, due_day: form.due_day, start_date: keepStart };
  }
  const anchor = parseDate(form.next_date);
  return { ...base, interval_months: form.frequency === "custom" ? form.interval_months : 1, due_day: anchor.getDate(), start_date: form.next_date };
}

export function valuesToForm(f: FixedExpense, today: Date): FixedForm {
  const next = nextDueDate({ ...f, active: true }, today);
  return {
    name: f.name,
    amount: String(num(f.amount)).replace(".", ","),
    is_estimate: f.is_estimate,
    category_id: f.category_id,
    frequency: (f.frequency as Frequency) ?? "monthly",
    interval_months: f.interval_months,
    due_day: f.due_day,
    next_date: next ? toISODate(next) : f.start_date,
    payment_method: f.payment_method,
    note: f.note ?? "",
  };
}

export function suggestionToForm(s: RecurrenceSuggestion): FixedForm {
  return {
    name: s.name,
    amount: String(s.amount).replace(".", ","),
    is_estimate: s.isEstimate,
    category_id: s.categoryId,
    frequency: s.frequency,
    interval_months: 1,
    due_day: s.dueDay,
    next_date: s.nextDate,
    payment_method: s.paymentMethod,
    note: "",
  };
}

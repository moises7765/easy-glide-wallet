import { addMonths, brl, buildCardInvoices, cardUsed, installmentLines, invoiceDueDate, invoiceKeyForDate, monthKey, monthLong, num, parseDate } from "@/lib/finance";
import { detectRecurrences, fixedIncreases, fixedSummary, frequencyLabel, sameName, unpaidFixedDues, STATUS_LABEL } from "@/lib/fixed-expenses";
import { brasiliaToday, parseMoney, wordsToDigits, type FluxoAiContext } from "@/lib/fluxo-ai";
import { isConsumptionExpense } from "@/lib/savings";

/**
 * Planejamento do Fluxo IA, calculado no próprio app (sem IA), a partir dos dados reais:
 * - "Posso comprar isso?": simula uma compra (nunca registra nada).
 * - "Como economizar mais?" / "Acelerar minhas metas": oportunidades e cenários (nunca altera metas).
 * Pagamentos de fatura (invoice_payment_id) contam só como saída de caixa, nunca como consumo.
 */

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const DAY = 86_400_000;
const shortDate = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const monthYear = (d: Date) => d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", "").replace(" de ", "/");
const round10 = (value: number) => (value <= 0 ? 0 : Math.max(10, Math.round(value / 10) * 10));

export function planningToday(now: Date = new Date()) {
  const t = brasiliaToday(now);
  return new Date(t.y, t.m - 1, t.d);
}

function monthsBetween(from: Date, to: Date) {
  return Math.max(1, (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()));
}

/* --------------------------------------------------------------------------
 * Base: média dos últimos 3 meses completos com lançamentos
 * ------------------------------------------------------------------------ */

export type Baseline = { months: string[]; income: number; consumption: number; surplus: number };

export function baselineOf(context: FluxoAiContext, today: Date): Baseline {
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const keys = [1, 2, 3].map((i) => monthKey(addMonths(first, -i)));
  const months = keys.filter((key) => context.transactions.some((t) => t.date.slice(0, 7) === key)).reverse();
  if (months.length === 0) return { months, income: 0, consumption: 0, surplus: 0 };
  const rows = context.transactions.filter((t) => months.includes(t.date.slice(0, 7)));
  const income = rows.filter((t) => t.type === "income").reduce((s, t) => s + num(t.amount), 0) / months.length;
  const consumption = rows.filter(isConsumptionExpense).reduce((s, t) => s + num(t.amount), 0) / months.length;
  return { months, income, consumption, surplus: income - consumption };
}

function baselineLabel(b: Baseline) {
  if (b.months.length === 0) return "";
  if (b.months.length === 1) return monthLong(b.months[0]!);
  return `${b.months.length} meses (${monthLong(b.months[0]!).split(" ")[0]} a ${monthLong(b.months.at(-1)!)})`;
}

/* --------------------------------------------------------------------------
 * Recorrências: mesma descrição em pelo menos 2 dos últimos 3 meses
 * ------------------------------------------------------------------------ */

export type Recurring = { description: string; type: "income" | "expense"; amount: number; day: number; paidThisMonth: boolean; onCard: boolean; categoryId: string | null };

const GENERIC = new Set(["", "despesa", "receita", "compra", "gasto", "pix", "transferencia"]);

export function recurringOf(context: FluxoAiContext, today: Date): Recurring[] {
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const current = monthKey(today);
  const previous = [1, 2, 3].map((i) => monthKey(addMonths(first, -i)));
  type Group = { description: string; type: string; months: Map<string, number>; days: number[]; onCard: boolean; categoryId: string | null };
  const groups = new Map<string, Group>();
  context.transactions.forEach((t) => {
    if (t.invoice_payment_id) return;
    const key = t.date.slice(0, 7);
    if (key !== current && !previous.includes(key)) return;
    const desc = normalize(t.description ?? "").replace(/\d+/g, " ").replace(/\s+/g, " ").trim();
    if (GENERIC.has(desc)) return;
    const id = `${t.type}|${desc}`;
    const group: Group = groups.get(id) ?? { description: t.description?.trim() || desc, type: t.type, months: new Map<string, number>(), days: [], onCard: true, categoryId: t.category_id };
    group.months.set(key, (group.months.get(key) ?? 0) + num(t.amount));
    if (key !== current) group.days.push(Number(t.date.slice(8, 10)));
    if (!t.card_id) group.onCard = false;
    groups.set(id, group);
  });
  return [...groups.values()]
    .map((g) => {
      const past = previous.filter((k) => g.months.has(k));
      return { g, past };
    })
    .filter(({ g, past }) => past.length >= 2 && (g.type === "income" || g.type === "expense"))
    .map(({ g, past }) => ({
      description: g.description,
      type: g.type as "income" | "expense",
      amount: past.reduce((s, k) => s + (g.months.get(k) ?? 0), 0) / past.length,
      day: Math.round(g.days.reduce((s, d) => s + d, 0) / Math.max(1, g.days.length)),
      paidThisMonth: g.months.has(current),
      onCard: g.onCard,
      categoryId: g.categoryId,
    }));
}

function nextOccurrence(r: Recurring, today: Date) {
  const base = r.paidThisMonth ? addMonths(new Date(today.getFullYear(), today.getMonth(), 1), 1) : new Date(today.getFullYear(), today.getMonth(), 1);
  const last = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const date = new Date(base.getFullYear(), base.getMonth(), Math.min(Math.max(1, r.day), last));
  return date < today ? today : date;
}

/* --------------------------------------------------------------------------
 * Caixa: dinheiro disponível e compromissos até uma data
 * ------------------------------------------------------------------------ */

type Item = { label: string; amount: number; date: Date };

export type CashPicture = {
  cash: number;
  source: "assets" | "month" | "none";
  obligations: Item[];
  expectedIncome: Item[];
  until: Date;
};

export function cashPicture(context: FluxoAiContext, today: Date, until: Date): CashPicture {
  const liquid = context.assets.filter((a) => a.liquid);
  const currentKey = monthKey(today);
  const monthRows = context.transactions.filter((t) => t.date.slice(0, 7) === currentKey);
  let source: CashPicture["source"] = "none";
  let cash = 0;
  if (liquid.length > 0) {
    source = "assets";
    cash = liquid.reduce((s, a) => s + num(a.value), 0);
  } else if (monthRows.length > 0) {
    // Sobra do mês em dinheiro: compras no cartão ainda não saíram do caixa (saem na fatura).
    source = "month";
    cash = monthRows.reduce((s, t) => {
      if (t.type === "income") return s + num(t.amount);
      if (t.type === "expense" && (!t.card_id || t.invoice_payment_id)) return s - num(t.amount);
      return s;
    }, 0);
  }

  const obligations: Item[] = [];
  const payments = context.invoicePayments ?? [];
  const oldest = new Date(today.getTime() - 40 * DAY);
  context.cards.forEach((card) => {
    buildCardInvoices(card, context.transactions, context.purchases, payments, today)
      .filter((inv) => !inv.paid && inv.amount > 0.009 && inv.dueDate <= until && inv.dueDate >= oldest)
      .forEach((inv) => obligations.push({ label: `Fatura ${card.name}${inv.overdue ? " (vencida)" : ""}`, amount: inv.amount, date: inv.dueDate }));
  });
  context.purchases
    .filter((p) => !p.card_id)
    .flatMap(installmentLines)
    .filter((line) => !line.paid && line.dueDate >= today && line.dueDate <= until)
    .forEach((line) => obligations.push({ label: `Parcela ${line.purchase.description}`, amount: line.amount, date: line.dueDate }));

  const expectedIncome: Item[] = [];
  recurringOf(context, today).forEach((r) => {
    if (r.onCard) return; // compras recorrentes no cartão já estão na fatura
    const date = nextOccurrence(r, today);
    if (date > until) return;
    const item = { label: r.description, amount: r.amount, date };
    if (r.type === "expense") obligations.push(item);
    else expectedIncome.push(item);
  });
  obligations.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { cash, source, obligations, expectedIncome, until };
}

const sum = (items: Item[]) => items.reduce((s, i) => s + i.amount, 0);

/** Aporte mensal necessário para as metas com prazo (sem prazo não entra). */
export function goalsMonthlyNeed(context: FluxoAiContext, today: Date) {
  return context.goals.reduce((s, g) => {
    const missing = num(g.target_amount) - num(g.current_amount);
    if (missing <= 0 || !g.deadline) return s;
    const deadline = parseDate(g.deadline);
    if (deadline <= today) return s;
    return s + missing / monthsBetween(today, deadline);
  }, 0);
}

/* --------------------------------------------------------------------------
 * 1) "Essa compra cabe no meu orçamento?"
 * ------------------------------------------------------------------------ */

export type PurchaseQuery = {
  description: string;
  amount: number | null;
  method: "cash" | "card" | null;
  cashMethod: "pix" | "debito" | "dinheiro" | null;
  cardId: string | null;
  cardName: string | null;
  installments: number;
};

const PURCHASE_QUESTION = /\b(posso|consigo|da pra|da para|devo|tenho como|vale a pena|sera que (eu )?(posso|consigo))\s+(comprar|gastar|pegar|parcelar|fazer (uma|essa) compra)|\bcabe\b.*\b(compra|gasto|comprar|gastar|orcamento|bolso)|\b(compra|gasto)\b.*\b(cabe|caberia)\b|\bse eu (comprar|gastar|parcelar)\b|\bcaberia\b|posso comprar isso/;

export function isPurchaseQuestion(text: string) {
  return PURCHASE_QUESTION.test(normalize(text));
}

function purchaseDescription(text: string, cardName: string | null) {
  let value = wordsToDigits(text).split(/[?,;]/)[0] ?? "";
  value = value.replace(/^.*?\b(comprar|gastar|parcelar|pegar|cabe|caberia)\b/i, " ");
  if (cardName) value = value.replace(new RegExp(cardName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  const cleaned = value
    .replace(/(?:r\$\s*)?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?/gi, " ")
    .replace(/\b(x|vezes|parcelas?)\b/gi, " ")
    .replace(/(^|\s)(isso|essa|esse|este|esta|uma|um|de|do|da|no|na|em|com|pelo|pela|por|para|pra|o|a|os|as|meu|minha|compra|gasto|reais|real|hoje|amanh[aã]|agora|m[eê]s|ainda|cart[aã]o|cr[eé]dito|pix|d[eé]bito|dinheiro|[aà] vista|boleto|or[cç]amento|bolso|eu)(?=\s|$)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "";
}

export function parsePurchaseQuery(raw: string, context: FluxoAiContext): PurchaseQuery {
  const text = wordsToDigits(raw);
  const value = normalize(text);
  const card = context.cards.find((c) => value.includes(normalize(c.name))) ?? null;
  const installments = Math.max(1, Number(value.match(/\b(\d{1,2})\s*(?:x|vezes|parcelas?)\b/)?.[1] ?? 1));
  const cashMethod = /\bpix\b/.test(value) ? "pix" : /\bdebito\b/.test(value) ? "debito" : /\bdinheiro\b|\bespecie\b/.test(value) ? "dinheiro" : null;
  const cardWords = /\b(cartao|credito|parcelad|parcelas?)\b/.test(value) || installments > 1;
  const method = card || cardWords ? "card" : cashMethod || /\ba vista\b|\bboleto\b/.test(value) ? "cash" : null;
  return {
    description: purchaseDescription(text, card?.name ?? null),
    amount: parseMoney(text),
    method,
    cashMethod: method === "cash" ? cashMethod ?? "pix" : null,
    cardId: card?.id ?? null,
    cardName: card?.name ?? null,
    installments,
  };
}

export type PurchaseMissing = "amount" | "method" | "card" | null;

export function missingPurchaseInfo(q: PurchaseQuery, context: FluxoAiContext): PurchaseMissing {
  if (!q.amount) return "amount";
  if (!q.method) return "method";
  if (q.method === "card" && !q.cardId && context.cards.length > 1) return "card";
  return null;
}

export function purchaseQuestionFor(missing: Exclude<PurchaseMissing, null>, context: FluxoAiContext) {
  if (missing === "amount") return "Qual é a compra e o valor? Ex.: “um tênis de R$ 450 no Pix”.";
  if (missing === "method") return "Vai pagar como: Pix/débito (à vista) ou no cartão?";
  return `Em qual cartão? (${context.cards.map((c) => c.name).join(", ")})`;
}

/** Fills the missing data with the user's short answer ("450", "no Pix", "Nubank 3x"). null = the answer did not fill it. */
export function completePurchaseQuery(q: PurchaseQuery, answer: string, context: FluxoAiContext): PurchaseQuery | null {
  const missing = missingPurchaseInfo(q, context);
  const extra = parsePurchaseQuery(answer, context);
  const merged: PurchaseQuery = {
    description: q.description || extra.description,
    amount: q.amount ?? extra.amount,
    method: q.method ?? extra.method,
    cashMethod: q.cashMethod ?? extra.cashMethod,
    cardId: q.cardId ?? extra.cardId,
    cardName: q.cardName ?? extra.cardName,
    installments: q.installments > 1 ? q.installments : extra.installments,
  };
  if (merged.cardId) merged.method = "card";
  if (merged.method === "cash" && !merged.cashMethod) merged.cashMethod = "pix";
  if (merged.method === "card") merged.cashMethod = null;
  const filled = (missing === "amount" && merged.amount) || (missing === "method" && merged.method) || (missing === "card" && merged.cardId);
  return filled ? merged : null;
}

export type PurchaseVerdict = "Cabe" | "Cabe com cuidado" | "Melhor esperar";

export type PurchaseAnalysis = {
  verdict: PurchaseVerdict | null;
  text: string;
  freeAfter: number | null;
  cardAvailable: number | null;
};

const CASH_LABEL = { pix: "no Pix", debito: "no débito", dinheiro: "em dinheiro" } as const;
const worse = (a: PurchaseVerdict, b: PurchaseVerdict): PurchaseVerdict => {
  const order: PurchaseVerdict[] = ["Cabe", "Cabe com cuidado", "Melhor esperar"];
  return order[Math.max(order.indexOf(a), order.indexOf(b))]!;
};

/** Simulates the purchase against real cash, bills, installments and goals. Never writes anything. */
export function analyzePurchase(q: PurchaseQuery, context: FluxoAiContext, now: Date = new Date()): PurchaseAnalysis {
  const today = planningToday(now);
  const amount = q.amount ?? 0;
  const name = q.description || "Compra";
  const card = q.method === "card" ? context.cards.find((c) => c.id === q.cardId) ?? (context.cards.length === 1 ? context.cards[0]! : null) : null;
  const parcel = amount / Math.max(1, q.installments);
  const baseline = baselineOf(context, today);

  let dueDate = new Date(today.getTime() + 30 * DAY);
  let cardAvailable: number | null = null;
  if (card) {
    dueDate = invoiceDueDate(card, invoiceKeyForDate(card, today));
    if (num(card.limit_total) > 0) cardAvailable = num(card.limit_total) - cardUsed(card.id, context.transactions, context.purchases, card, context.invoicePayments ?? []);
  }
  const horizon = new Date(today.getTime() + 30 * DAY);
  const until = q.method === "card" && dueDate > horizon ? dueDate : horizon;
  const picture = cashPicture(context, today, until);
  const payLabel = q.method === "card"
    ? `no cartão${card ? ` ${card.name}` : ""}${q.installments > 1 ? ` em ${q.installments}x de ${brl(parcel)}` : ""}`
    : CASH_LABEL[q.cashMethod ?? "pix"];
  const header = `${name} de **${brl(amount)}** ${payLabel}`;

  if (picture.source === "none") {
    return {
      verdict: null,
      freeAfter: null,
      cardAvailable,
      text: `${header}: ainda não consigo avaliar. Não há saldo de contas cadastrado em Patrimônio nem lançamentos neste mês.\n\nCadastre o saldo da sua conta em **Patrimônio** (marcado como disponível) ou registre suas entradas e saídas, e pergunte de novo. Nada foi registrado.`,
    };
  }

  const owed = sum(picture.obligations);
  const incoming = sum(picture.expectedIncome);
  const cashImpact = q.method === "card" ? parcel : amount;
  const freeBefore = picture.cash + incoming - owed;
  const freeAfter = freeBefore - cashImpact;
  const goalsNeed = goalsMonthlyNeed(context, today);
  const cushion = baseline.months.length ? baseline.consumption * 0.1 : 0;

  const reasons: string[] = [];
  let verdict: PurchaseVerdict = "Cabe";
  if (freeAfter < 0) {
    verdict = "Melhor esperar";
    reasons.push(`a compra deixaria **${brl(freeAfter)}** até ${shortDate(until)}, ou seja, faltaria dinheiro para as contas já previstas.`);
  } else if (freeAfter < goalsNeed + cushion) {
    verdict = "Cabe com cuidado";
    if (goalsNeed > 0 && freeAfter < goalsNeed) reasons.push(`sobram ${brl(freeAfter)}, menos que os **${brl(goalsNeed)}/mês** que suas metas com prazo pedem.`);
    else reasons.push(`sobra pouca margem (${brl(freeAfter)}) para imprevistos até ${shortDate(until)}.`);
  }
  if (cardAvailable !== null && amount > cardAvailable) {
    verdict = "Melhor esperar";
    reasons.push(`o limite disponível do ${card!.name} é **${brl(Math.max(0, cardAvailable))}**, menor que o valor da compra.`);
  }
  if (q.method === "card" && q.installments > 1 && baseline.months.length) {
    if (baseline.surplus <= 0 || parcel > baseline.surplus) {
      verdict = worse(verdict, "Melhor esperar");
      reasons.push(`a parcela de ${brl(parcel)} é maior que sua sobra média de ${brl(Math.max(0, baseline.surplus))}/mês.`);
    } else if (parcel > baseline.surplus * 0.5) {
      verdict = worse(verdict, "Cabe com cuidado");
      reasons.push(`a parcela usa mais da metade da sua sobra média (${brl(baseline.surplus)}/mês) por ${q.installments} meses.`);
    }
  }

  const sourceLabel = picture.source === "assets" ? "saldo em contas e dinheiro cadastrado em Patrimônio" : "sobra do mês até agora: entradas menos saídas em dinheiro";
  const lines = [`**${verdict}** — ${header}.`, ""];
  lines.push(`- **Dinheiro disponível:** ${brl(picture.cash)} (${sourceLabel}).`);
  if (picture.obligations.length) {
    const top = picture.obligations.slice(0, 4).map((o) => `${o.label} ${brl(o.amount)} em ${shortDate(o.date)}`).join("; ");
    lines.push(`- **A pagar até ${shortDate(until)}:** ${brl(owed)} (${top}${picture.obligations.length > 4 ? "; …" : ""}).`);
  } else lines.push(`- **A pagar até ${shortDate(until)}:** nenhuma fatura, parcela ou conta recorrente encontrada.`);
  if (picture.expectedIncome.length) lines.push(`- **Entrada prevista:** ${brl(incoming)} (${picture.expectedIncome.map((i) => `${i.label} ~${shortDate(i.date)}`).join(", ")}, pela recorrência dos últimos meses).`);
  if (q.method === "card") {
    lines.push(`- **Cartão:** limite não é dinheiro disponível. ${card ? `A compra entra na fatura que vence em ${shortDate(dueDate)}` : "Sem cartão cadastrado, considerei o pagamento em até 30 dias"}${q.installments > 1 ? `; as outras ${q.installments - 1} parcelas pesam nos meses seguintes` : ""}.${cardAvailable !== null ? ` Limite livre: ${brl(Math.max(0, cardAvailable))}.` : ""}`);
  }
  lines.push(`- **Depois da compra sobram:** ${brl(freeAfter)} até ${shortDate(until)}.`);
  if (goalsNeed > 0) lines.push(`- **Metas:** as que têm prazo pedem cerca de ${brl(goalsNeed)}/mês.`);
  if (reasons.length) lines.push("", `Por quê: ${reasons.join(" Além disso, ")}`);
  if (picture.source === "month") lines.push("", "_Para uma análise mais precisa, cadastre o saldo da sua conta em Patrimônio._");
  lines.push("", "_Isso é só uma simulação: nada foi registrado. Se fizer a compra, diga “comprei” que eu lanço._");
  return { verdict, text: lines.join("\n"), freeAfter, cardAvailable };
}

/** Text for the explicit "comprei" after a simulation, parsed by the existing launch flow. */
export function purchaseLaunchText(q: PurchaseQuery) {
  const amount = String(q.amount ?? 0).replace(".", ",");
  const how = q.method === "card" && q.cardName ? `no ${q.cardName}${q.installments > 1 ? ` em ${q.installments}x` : ""}` : `no ${q.cashMethod ?? "pix"}`;
  return `Comprei ${q.description || "compra"} ${amount} reais ${how} hoje`;
}

export const REGISTER_AFTER_SIMULATION = /^(sim,?\s+)?(ok,?\s+)?(ja\s+)?(comprei|pode (registrar|lancar|anotar)|registra|registre|lanca|lance|anota|anote)\b/;

/* --------------------------------------------------------------------------
 * 2) Estratégia de economia e metas
 * ------------------------------------------------------------------------ */

const FIXED = /moradia|aluguel|condominio|casa|saude|farmacia|medic|plano de saude|educa|escola|faculdade|curso|seguro|imposto|financiamento|emprestimo|divida|investimento|reserva/;
const ESSENTIAL_VARIABLE = /mercado|supermercado|aliment|transporte|combust|gasolina|contas?\b|luz|energia|agua|internet|telefone|celular/;
const SUBSCRIPTION = /netflix|spotify|prime|disney|hbo|\bmax\b|youtube|assinatura|academia|smartfit|apple|icloud|google one|globoplay|deezer|gympass|wellhub|clube|streaming|paramount|crunchyroll/;

export type Opportunity = { title: string; detail: string; monthly: number };

export function isSavingsQuestion(text: string) {
  return /como (posso |eu )?(economizar|poupar|gastar menos|sobrar mais)|economizar mais|onde (posso |da pra |da para |devo )?(cortar|economizar|reduzir)|reduzir (meus )?gastos|cortar (meus )?gastos|estrategia (de|para) econom|gastar menos/.test(normalize(text));
}

export function isGoalsQuestion(text: string) {
  return /acelerar|antecipar|mais rapido|bater (minhas |a |as )?metas?|atingir (minhas |a |as )?metas?|(prazo|quando).*\bmetas?\b|\bmetas?\b.*(prazo|quando|quanto tempo|cenario)/.test(normalize(text));
}

/** "e se eu economizar mais R$ 200 por mês?" → 200 */
export function parseExtraSavings(text: string): number | null {
  const value = normalize(wordsToDigits(text));
  if (!/\bse eu\b.*\b(economizar|guardar|poupar|separar|juntar|cortar|investir|aportar)\b|\b(economizando|guardando|poupando|separando)\b.*\bmais\b/.test(value)) return null;
  return parseMoney(wordsToDigits(text));
}

export function savingsOpportunities(context: FluxoAiContext, now: Date = new Date()) {
  const today = planningToday(now);
  const baseline = baselineOf(context, today);
  const months = baseline.months.length ? baseline.months : [monthKey(today)];
  const divisor = months.length;
  const rows = context.transactions.filter((t) => isConsumptionExpense(t) && months.includes(t.date.slice(0, 7)));

  const subscriptions = recurringOf(context, today).filter((r) => {
    if (r.type !== "expense") return false;
    const category = context.categories.find((c) => c.id === r.categoryId);
    return SUBSCRIPTION.test(normalize(`${r.description} ${category?.name ?? ""}`)) && !FIXED.test(normalize(category?.name ?? ""));
  });

  const byCategory = new Map<string, { name: string; total: number }>();
  rows.forEach((t) => {
    const category = context.categories.find((c) => c.id === t.category_id);
    const id = category?.id ?? "none";
    const entry = byCategory.get(id) ?? { name: category?.name ?? "Sem categoria", total: 0 };
    entry.total += num(t.amount);
    byCategory.set(id, entry);
  });

  const opportunities: Opportunity[] = [];
  const fixed: string[] = [];
  byCategory.forEach((entry, id) => {
    const monthly = entry.total / divisor;
    const name = normalize(entry.name);
    if (FIXED.test(name)) { fixed.push(entry.name); return; }
    const subs = subscriptions.filter((s) => (s.categoryId ?? "none") === id).reduce((s, r) => s + r.amount, 0);
    const base = Math.max(0, monthly - subs);
    if (base < 30) return;
    const share = ESSENTIAL_VARIABLE.test(name) || id === "none" ? 0.1 : 0.2;
    const saving = base * share;
    opportunities.push({
      title: entry.name,
      detail: `reduzir ${share * 100}% (de ${brl(base)} para ${brl(base - saving)} por mês)${id === "none" ? " — vale categorizar esses gastos" : ""}`,
      monthly: saving,
    });
  });
  subscriptions.forEach((s) => opportunities.push({ title: s.description, detail: `revisar ou cancelar a assinatura (${brl(s.amount)}/mês${s.onCard ? ", no cartão" : ""})`, monthly: s.amount }));
  opportunities.sort((a, b) => b.monthly - a.monthly);

  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const nextKey = monthKey(addMonths(first, 1));
  const installmentsNext = context.purchases.flatMap(installmentLines).filter((l) => !l.paid && l.monthKey === nextKey).reduce((s, l) => s + l.amount, 0);
  const lastInstallment = context.purchases.flatMap(installmentLines).filter((l) => !l.paid).map((l) => l.dueDate).sort((a, b) => b.getTime() - a.getTime())[0];
  const payments = context.invoicePayments ?? [];
  const oldest = new Date(today.getTime() - 40 * DAY);
  const overdue = context.cards.flatMap((card) => buildCardInvoices(card, context.transactions, context.purchases, payments, today)
    .filter((inv) => inv.overdue && inv.amount > 0.009 && inv.dueDate >= oldest)
    .map((inv) => ({ card: card.name, amount: inv.amount })));

  return {
    baseline,
    usedCurrentMonth: baseline.months.length === 0,
    opportunities,
    total: opportunities.reduce((s, o) => s + o.monthly, 0),
    fixed,
    installmentsNext,
    lastInstallment: lastInstallment ?? null,
    overdue,
  };
}

export function savingsStrategyAnswer(context: FluxoAiContext, now: Date = new Date()) {
  const s = savingsOpportunities(context, now);
  const hasData = context.transactions.some((t) => isConsumptionExpense(t));
  if (!hasData) return "Ainda não há despesas registradas para eu analisar. Registre seus gastos (ex.: “Gastei 35 no almoço no Pix”) e pergunte de novo.";
  const lines = ["**Como economizar mais**", ""];
  if (s.usedCurrentMonth) lines.push("_Base: só o mês atual (ainda não há meses completos anteriores)._", "");
  else lines.push(`Base: média de ${baselineLabel(s.baseline)} · receita ${brl(s.baseline.income)}/mês · consumo ${brl(s.baseline.consumption)}/mês · sobra ${brl(s.baseline.surplus)}/mês.`, "");
  if (s.overdue.length) lines.push(`⚠️ Fatura vencida: ${s.overdue.map((o) => `${o.card} ${brl(o.amount)}`).join(", ")}. Pagar primeiro evita juros, que costumam pesar mais que qualquer corte.`, "");
  if (s.opportunities.length) {
    lines.push("**Oportunidades, da maior para a menor**");
    s.opportunities.slice(0, 5).forEach((o, i) => lines.push(`${i + 1}. **${o.title}** — ${o.detail}: ~${brl(o.monthly)}/mês · ~${brl(o.monthly * 12)}/ano`));
    lines.push("", `**Economia estimada:** ~${brl(s.total)}/mês · ~${brl(s.total * 12)}/ano. _Estimativa com base na sua média; o resultado depende dos seus hábitos._`);
  } else lines.push("Não encontrei gastos variáveis relevantes para cortar: o que você registrou é principalmente fixo.");
  if (s.installmentsNext > 0) lines.push("", `Parcelas já comprometem **${brl(s.installmentsNext)}** no próximo mês${s.lastInstallment ? `, até ${monthYear(s.lastInstallment)}` : ""}. Evitar novas parcelas até lá libera espaço.`);
  if (s.fixed.length) lines.push("", `_Gastos fixos (${s.fixed.join(", ")}) não entraram nos cortes._`);
  const top = s.opportunities[0];
  const action = s.overdue.length
    ? `quite a fatura vencida do ${s.overdue[0]!.card}.`
    : top
      ? `comece por **${top.title}**: ${top.detail}. Isso sozinho rende ~${brl(top.monthly * 12)} em um ano.`
      : "mantenha o registro dos gastos por mais um mês para eu achar onde cortar.";
  lines.push("", `**Ação prioritária:** ${action}`);
  if (context.goals.some((g) => num(g.target_amount) > num(g.current_amount))) lines.push("", "Quer ver quanto isso acelera suas metas? Pergunte “Acelerar minhas metas”.");
  return lines.join("\n");
}

export type GoalScenario = { label: "Confortável" | "Equilibrado" | "Acelerado"; monthly: number; months: number | null; date: Date | null };
export type GoalPlan = { id: string; name: string; missing: number; progress: number; deadline: Date | null; requiredMonthly: number | null; scenarios: GoalScenario[] };

export function goalPlans(context: FluxoAiContext, now: Date = new Date(), extraMonthly = 0) {
  const today = planningToday(now);
  const s = savingsOpportunities(context, now);
  const active = context.goals.filter((g) => num(g.target_amount) > num(g.current_amount));
  const capacity = Math.max(0, s.baseline.surplus);
  const n = Math.max(1, active.length);
  const shares: Array<[GoalScenario["label"], number, number]> = [["Confortável", 0.3, 0.25], ["Equilibrado", 0.5, 0.5], ["Acelerado", 0.8, 1]];
  const plans: GoalPlan[] = active.map((g) => {
    const missing = num(g.target_amount) - num(g.current_amount);
    const deadline = g.deadline ? parseDate(g.deadline) : null;
    const scenarios = shares.map(([label, c, o]) => {
      const monthly = round10((capacity * c + s.total * o) / n);
      const months = monthly > 0 ? Math.ceil(missing / monthly) : null;
      return { label, monthly, months, date: months ? addMonths(today, months) : null };
    });
    return {
      id: g.id,
      name: g.name,
      missing,
      progress: num(g.target_amount) > 0 ? (num(g.current_amount) / num(g.target_amount)) * 100 : 0,
      deadline,
      requiredMonthly: deadline && deadline > today ? missing / monthsBetween(today, deadline) : null,
      scenarios,
    };
  });
  // Meta prioritária: a de prazo mais próximo; sem prazo, a que falta menos.
  const priority = [...plans].sort((a, b) => {
    if (a.deadline && b.deadline) return a.deadline.getTime() - b.deadline.getTime();
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return a.missing - b.missing;
  })[0] ?? null;
  let extra: { goal: string; before: number | null; after: number; monthly: number } | null = null;
  if (extraMonthly > 0 && priority) {
    const base = priority.scenarios[1]!;
    const monthly = base.monthly + extraMonthly;
    extra = { goal: priority.name, before: base.months, after: Math.ceil(priority.missing / monthly), monthly };
  }
  return { today, savings: s, capacity, plans, priority, extra };
}

export function goalsStrategyAnswer(context: FluxoAiContext, now: Date = new Date(), extraMonthly = 0) {
  const r = goalPlans(context, now, extraMonthly);
  const months = (value: number | null) => (value === null ? "sem prazo estimado" : `${value} ${value === 1 ? "mês" : "meses"}`);
  if (r.plans.length === 0) {
    const lines = [context.goals.length ? "Todas as suas metas já estão concluídas. 🎉" : "Você ainda não tem metas ativas."];
    if (extraMonthly > 0) lines.push("", `Economizando mais **${brl(extraMonthly)}/mês**, em 12 meses você junta **${brl(extraMonthly * 12)}** (estimativa, sem rendimentos).`);
    lines.push("", "Para criar uma, diga por exemplo: “Criar meta viagem de 5.000”.");
    return lines.join("\n");
  }
  const lines = ["**Acelerar suas metas**", ""];
  if (r.savings.baseline.months.length) lines.push(`Sobra média: **${brl(r.savings.baseline.surplus)}/mês** (receitas − consumo, ${baselineLabel(r.savings.baseline)}). Economia possível estimada: ~${brl(r.savings.total)}/mês.`);
  else lines.push("_Ainda não há meses completos para calcular sua sobra média; os cenários usam só a economia estimada do mês atual._");
  if (r.plans.length > 1) lines.push(`_Cenários dividem a capacidade igualmente entre ${r.plans.length} metas._`);
  r.plans.forEach((p) => {
    lines.push("", `**${p.name}** — faltam ${brl(p.missing)} (${Math.round(p.progress)}% concluída)${p.deadline ? ` · prazo ${monthYear(p.deadline)}${p.requiredMonthly !== null ? ` → precisa de ~${brl(p.requiredMonthly)}/mês` : " (já passou)"}` : " · sem prazo"}`);
    if (p.scenarios.every((sc) => sc.monthly === 0)) lines.push("- Sem sobra média nem economia estimada para simular aportes agora.");
    else p.scenarios.forEach((sc) => lines.push(`- ${sc.label}: ${brl(sc.monthly)}/mês → ${months(sc.months)}${sc.date ? ` (${monthYear(sc.date)})` : ""}`));
  });
  if (r.extra) {
    const saved = r.extra.before !== null ? r.extra.before - r.extra.after : null;
    lines.push("", `**E se você economizar mais ${brl(extraMonthly)}/mês?** Aplicando em **${r.extra.goal}** (${brl(r.extra.monthly)}/mês), ela fica pronta em ${months(r.extra.after)}${saved !== null && saved > 0 ? ` — ${saved} ${saved === 1 ? "mês" : "meses"} antes do cenário equilibrado` : ""}. Em 12 meses são ${brl(extraMonthly * 12)} a mais.`);
  }
  const p = r.priority!;
  const balanced = p.scenarios[1]!;
  let action: string;
  if (p.requiredMonthly !== null && p.requiredMonthly > balanced.monthly) {
    const accelerated = p.scenarios[2]!;
    action = accelerated.monthly >= p.requiredMonthly
      ? `para cumprir o prazo de **${p.name}**, separe ~${brl(p.requiredMonthly)}/mês — o cenário acelerado já cobre isso.`
      : `o prazo de **${p.name}** pede ~${brl(p.requiredMonthly)}/mês, acima dos cenários. Considere estender o prazo${balanced.date ? ` para ${monthYear(balanced.date)}` : ""} ou aplicar os cortes sugeridos em “Como economizar mais?”.`;
  } else if (balanced.monthly > 0) {
    action = `separe **${brl(balanced.monthly)}/mês** para **${p.name}** logo que receber; assim ela fica pronta em ${months(balanced.months)}.`;
  } else action = "primeiro abra espaço no orçamento: pergunte “Como economizar mais?” para ver onde cortar.";
  lines.push("", `**Ação prioritária:** ${action}`, "", "_Estimativas sem rendimentos. Nenhuma meta foi alterada; para mudar, peça explicitamente._");
  return lines.join("\n");
}

import type { Tables } from "@/integrations/supabase/types";
import { brl, monthKey, num, parseDate, toISODate } from "@/lib/finance";

export type FluxoAiContext = {
  transactions: Tables<"transactions">[];
  categories: Tables<"categories">[];
  cards: Tables<"cards">[];
  purchases: Tables<"installment_purchases">[];
  goals: Tables<"goals">[];
  assets: Tables<"assets">[];
};

export type TransactionProposal = {
  kind: "transaction";
  type: "expense" | "income";
  amount: number;
  date: string;
  description: string;
  categoryId: string | null;
  categoryName: string | null;
  cardId: string | null;
  cardName: string | null;
  installments: number;
  paymentMethod: string;
};

export type GoalProposal = {
  kind: "goal";
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string | null;
};

export type ActionProposal = TransactionProposal | GoalProposal;

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100, duzentos: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500, seiscentos: 600, setecentos: 700, oitocentos: 800, novecentos: 900,
};

/** Converts spoken amounts like "vinte e cinco reais" into "25 reais". */
function wordsToDigits(text: string) {
  return text.replace(/((?:[a-zçãéêô]+)(?:\s+(?:e\s+)?[a-zçãéêô]+)*)\s+(reais|real|conto|contos)\b/gi, (full, words: string, unit: string) => {
    const tokens = normalize(words).split(/\s+/);
    let total = 0;
    let current = 0;
    let used = 0;
    for (let i = tokens.length - 1; i >= 0; i -= 1) {
      const token = tokens[i]!;
      if (token === "e") continue;
      if (token === "mil") { current = current || 0; total += (current || 1) * 1000; current = 0; used = i; continue; }
      const n = NUMBER_WORDS[token];
      if (n === undefined) break;
      current += n;
      used = i;
    }
    const value = total + current;
    if (!value) return full;
    const original = words.split(/\s+/);
    return `${original.slice(0, used).join(" ")} ${value} ${unit}`.trim();
  });
}

function parseMoney(text: string) {
  const match = text.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})|\d+(?:\.\d{1,2})?)(?!\s*(?:x|vezes|parcelas?)\b)/i);
  if (!match) return null;
  const raw = match[1];
  if (!raw) return null;
  const value = raw.includes(",") || /^\d{1,3}(?:\.\d{3})+$/.test(raw)
    ? Number(raw.replace(/\./g, "").replace(",", "."))
    : Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseDateFromText(text: string) {
  const value = normalize(text);
  const today = new Date();
  if (value.includes("ontem")) {
    today.setDate(today.getDate() - 1);
  }
  const explicit = text.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
  if (!explicit) return toISODate(today);
  const day = explicit[1];
  const month = explicit[2];
  if (!day || !month) return toISODate(today);
  const year = explicit[3] ? Number(explicit[3].length === 2 ? `20${explicit[3]}` : explicit[3]) : today.getFullYear();
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function closestNamed<T extends { id: string; name: string }>(text: string, rows: T[]) {
  const value = normalize(text);
  return rows.find((row) => value.includes(normalize(row.name))) ?? null;
}

function inferredCategory(text: string, categories: Tables<"categories">[], kind: "expense" | "income") {
  const matching = categories.filter((category) => category.kind === kind);
  const named = closestNamed(text, matching);
  if (named) return named;
  const value = normalize(text);
  const hints: Array<[RegExp, RegExp]> = [
    [/almoco|jantar|lanche|restaurante|mercado|comida|pao|padaria|cafe|ifood/, /aliment|mercado|refei/],
    [/uber|99|gasolina|combustivel|onibus|transporte/, /transport|combust|carro/],
    [/aluguel|condominio|luz|energia|agua|internet/, /moradia|casa|conta/],
    [/salario|pagamento|recebi|renda/, /salario|renda/],
    [/farmacia|medico|saude/, /saude|farmacia/],
  ];
  const hint = hints.find(([words]) => words.test(value));
  return hint ? matching.find((category) => hint[1].test(normalize(category.name))) ?? null : null;
}

function transactionDescription(text: string, type: "expense" | "income", cardName?: string | null) {
  let base = text.replace(/^\s*(novo|nova)\s+(lan[cç]amento|gasto|despesa|receita|entrada|sa[ií]da)\b[,:]?/i, " ").replace(/^\s*(registra|registre|registrar|anota|anote|lan[cç]a|lance)\b[,:]?/i, " ");
  if (cardName) base = base.replace(new RegExp(cardName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  const cleaned = base
    .replace(/\d+\s*(?:x|vezes|parcelas?)\b/gi, " ")
    .replace(/(?:r\$\s*)?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?/gi, "")
    .replace(/[,.!]/g, " ")
    .replace(/(^|\s)(hoje|ontem|no|na|em|pelo|pela|com|de|do|da|por|um|uma|reais|real|conto|contos|gastei|recebi|cart[aã]o|pix|d[eé]bito|dinheiro|cr[eé]dito)(?=\s|$)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const withoutVerb = cleaned.replace(/^(gastei|paguei|comprei|recebi|ganhei|entrou|vendi)\s+/i, "");
  if (!withoutVerb) return type === "expense" ? "Despesa" : "Receita";
  return withoutVerb.charAt(0).toUpperCase() + withoutVerb.slice(1);
}

export function parseActionProposal(text: string, context: FluxoAiContext): ActionProposal | null {
  const value = normalize(text);
  const amount = parseMoney(text);
  const goalIntent = /criar|nova|quero|meta|objetivo/.test(value) && /meta|guardar|juntar|economizar/.test(value);
  if (goalIntent && amount) {
    const deadlineMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    const name = text
      .replace(/(?:r\$\s*)?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?/gi, "")
      .replace(/\b(criar|crie|nova|uma|meta|objetivo|de|para|quero|guardar|juntar|economizar|até|ate)\b/gi, " ")
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return { kind: "goal", name: name || "Nova meta", targetAmount: amount, currentAmount: 0, deadline: deadlineMatch?.[1] ?? null };
  }

  const expenseIntent = /gastei|paguei|comprei|despesa|saida/.test(value);
  const incomeIntent = /recebi|ganhei|salario|renda|entrada|vendi/.test(value);
  if (!amount || (!expenseIntent && !incomeIntent)) return null;
  const type = incomeIntent && !expenseIntent ? "income" : "expense";
  const card = type === "expense" ? closestNamed(text, context.cards) : null;
  const category = inferredCategory(text, context.categories, type);
  const installmentsMatch = value.match(/\b(\d{1,2})\s*(?:x|vezes|parcelas?)\b/);
  const installments = Math.max(1, Number(installmentsMatch?.[1] ?? 1));
  const paymentMethod = card ? "credito" : /debito/.test(value) ? "debit" : /dinheiro/.test(value) ? "cash" : /transfer/.test(value) ? "transfer" : "pix";
  return {
    kind: "transaction",
    type,
    amount,
    date: parseDateFromText(text),
    description: transactionDescription(text, type, card?.name),
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    cardId: card?.id ?? null,
    cardName: card?.name ?? null,
    installments,
    paymentMethod,
  };
}

export type LaunchCommand =
  | { status: "ready"; proposal: TransactionProposal }
  | { status: "needs_type"; text: string }
  | { status: "needs_card"; proposal: TransactionProposal };

const QUESTION = /^(quanto|quantos|quantas|qual|quais|quando|onde|como|por que|porque|o que|quem|sera|devo|posso)\b|\?\s*$/;

/** Detects explicit launch orders ("novo lançamento", "gastei", "recebi"...). Questions never match. */
export function parseLaunchCommand(raw: string, context: FluxoAiContext): LaunchCommand | null {
  const text = wordsToDigits(raw);
  const value = normalize(text).trim();
  if (QUESTION.test(value)) return null;
  const explicit = /^(novo|nova)\s+(lancamento|gasto|despesa|receita|entrada|saida)\b|^(registra|registre|registrar|anota|anote|lanca|lance)\b|\b(gastei|paguei|comprei|recebi|ganhei)\b/.test(value);
  if (!explicit || !parseMoney(text)) return null;
  const typed = /\b(gastei|paguei|comprei|gasto|despesa|saida)\b/.test(value) || /\b(recebi|ganhei|receita|entrada|salario)\b/.test(value);
  const genericLaunch = /^(novo|nova)\s+lancamento\b/.test(value) && transactionDescription(text, "expense") !== "Despesa";
  if (!typed && !genericLaunch) return { status: "needs_type", text };
  const forced = /^(novo|nova)\s+(gasto|despesa|saida|lancamento)/.test(value) ? "expense" : /^(novo|nova)\s+(receita|entrada)/.test(value) ? "income" : null;
  const proposal = parseActionProposal(forced === "income" ? `${text} recebi` : forced === "expense" ? `${text} gastei` : text, context);
  if (!proposal || proposal.kind !== "transaction") return null;
  if (forced) proposal.description = transactionDescription(text, forced, proposal.cardName);
  if (proposal.installments > 1 && !proposal.cardId) return { status: "needs_card", proposal };
  return { status: "ready", proposal };
}

/** Completes a pending launch with the user's answer ("saída", "entrada", card name). */
export function completeLaunch(pending: LaunchCommand, answer: string, context: FluxoAiContext): LaunchCommand | null {
  const value = normalize(answer);
  if (pending.status === "needs_type") {
    const type = /saida|gasto|despesa|paguei|gastei/.test(value) ? "expense" : /entrada|receita|recebi|ganhei/.test(value) ? "income" : null;
    if (!type) return null;
    return parseLaunchCommand(`${pending.text} ${type === "expense" ? "gastei" : "recebi"}`, context);
  }
  if (pending.status === "needs_card") {
    const card = closestNamed(answer, context.cards);
    if (!card) return null;
    return { status: "ready", proposal: { ...pending.proposal, cardId: card.id, cardName: card.name, paymentMethod: "credito" } };
  }
  return null;
}

const METHOD_LABEL: Record<string, string> = { pix: "Pix", debit: "Débito", cash: "Dinheiro", transfer: "Transferência", credito: "Crédito" };

export function launchDoneMessage(p: TransactionProposal) {
  const when = p.date === toISODate(new Date()) ? "hoje" : parseDate(p.date).toLocaleDateString("pt-BR");
  const method = p.cardName ? `${p.cardName}${p.installments > 1 ? ` ${p.installments}x` : ""}` : METHOD_LABEL[p.paymentMethod] ?? p.paymentMethod;
  return `✅ ${p.installments > 1 ? "Compra parcelada adicionada" : "Lançamento adicionado"}: ${brl(p.amount)} · ${p.description} · ${method} · ${when}.`;
}

export function isFinancialQuestion(text: string) {
  return QUESTION.test(normalize(text).trim());
}

export function proposalSummary(proposal: ActionProposal) {
  if (proposal.kind === "goal") {
    return `Meta “${proposal.name}” · ${brl(proposal.targetAmount)}${proposal.deadline ? ` · até ${parseDate(proposal.deadline).toLocaleDateString("pt-BR")}` : ""}`;
  }
  const type = proposal.type === "expense" ? "Saída" : "Entrada";
  const details = [proposal.categoryName, proposal.cardName, proposal.date === toISODate(new Date()) ? "hoje" : parseDate(proposal.date).toLocaleDateString("pt-BR")].filter(Boolean);
  return `${type} de ${brl(proposal.amount)} · ${proposal.description}${details.length ? ` · ${details.join(" · ")}` : ""}${proposal.installments > 1 ? ` · ${proposal.installments}x` : ""}`;
}

export function localFinancialAnswer(question: string, context: FluxoAiContext) {
  const value = normalize(question);
  const current = monthKey(new Date());
  const transactions = context.transactions.filter((transaction) => !transaction.invoice_payment_id);
  const month = transactions.filter((transaction) => monthKey(transaction.date) === current);
  const income = month.filter((transaction) => transaction.type === "income").reduce((sum, transaction) => sum + num(transaction.amount), 0);
  const expense = month.filter((transaction) => transaction.type === "expense").reduce((sum, transaction) => sum + num(transaction.amount), 0);
  const balance = income - expense;
  if (/maior gasto/.test(value)) {
    const biggest = month.filter((transaction) => transaction.type === "expense").sort((a, b) => num(b.amount) - num(a.amount))[0];
    return biggest ? `Seu maior gasto neste mês foi **${biggest.description || "Sem descrição"}**, de **${brl(num(biggest.amount))}**.` : "Ainda não há despesas neste mês.";
  }
  if (/meta/.test(value)) {
    if (context.goals.length === 0) return "Você ainda não tem metas cadastradas. Posso preparar uma nova meta para você.";
    const pending = context.goals.map((goal) => ({ ...goal, missing: Math.max(0, num(goal.target_amount) - num(goal.current_amount)) })).sort((a, b) => a.missing - b.missing)[0];
    if (!pending) return "Você ainda não tem metas cadastradas. Posso preparar uma nova meta para você.";
    return `A meta mais próxima é **${pending.name}**. Faltam **${brl(pending.missing)}** para concluí-la.`;
  }
  return `Neste mês, entraram **${brl(income)}**, saíram **${brl(expense)}** e seu saldo é **${brl(balance)}**. ${balance >= 0 ? "Você está fechando o mês no positivo." : "Vale revisar as maiores despesas antes de assumir novos compromissos."}`;
}
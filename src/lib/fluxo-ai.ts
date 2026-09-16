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

function parseMoney(text: string) {
  const match = text.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?)/i);
  if (!match) return null;
  const raw = match[1];
  if (!raw) return null;
  const value = raw.includes(",")
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
    [/almoco|jantar|lanche|restaurante|mercado|comida/, /aliment|mercado|refei/],
    [/uber|99|gasolina|combustivel|onibus|transporte/, /transport|combust|carro/],
    [/aluguel|condominio|luz|energia|agua|internet/, /moradia|casa|conta/],
    [/salario|pagamento|recebi|renda/, /salario|renda/],
    [/farmacia|medico|saude/, /saude|farmacia/],
  ];
  const hint = hints.find(([words]) => words.test(value));
  return hint ? matching.find((category) => hint[1].test(normalize(category.name))) ?? null : null;
}

function transactionDescription(text: string, type: "expense" | "income") {
  const cleaned = text
    .replace(/(?:r\$\s*)?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?/gi, "")
    .replace(/\b(hoje|ontem|no|na|em|pelo|pela|cart[aã]o|pix|d[eé]bito|dinheiro|\d+\s*(?:x|vezes|parcelas?))\b/gi, " ")
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
    description: transactionDescription(text, type),
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    cardId: card?.id ?? null,
    cardName: card?.name ?? null,
    installments,
    paymentMethod,
  };
}

export function isExplicitConfirmation(text: string) {
  return /^(sim|pode|pode sim|confirmo|confirmar|adicione|adicionar|salvar|registre|registrar)[.!\s]*$/i.test(text.trim());
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
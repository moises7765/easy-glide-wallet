import { brl, cardInvoice, invoiceKeyForDate, monthLabel, num, remainingOf } from "@/lib/finance";
import { isConsumptionExpense, savingsForMonth, savingsMonthKey, savingsPercent } from "@/lib/savings";
import type { FluxoAiContext } from "@/lib/fluxo-ai";

/**
 * Respostas calculadas no próprio app (sem IA). Usadas quando o assistente
 * inteligente está indisponível (sem créditos, sem configuração, falha de rede)
 * e para perguntas simples como "o que você pode fazer?". Nunca grava nada.
 */

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export type LocalIntent =
  | "capabilities"
  | "advice"
  | "cards"
  | "goals"
  | "net_worth"
  | "biggest_expense"
  | "spending"
  | "income"
  | "situation";

const INTENTS: Array<[LocalIntent, RegExp]> = [
  ["capabilities", /o que (voce|vc|tu) (pode|consegue|sabe|faz)|como (voce|vc) (pode |consegue )?(me )?ajuda|quais (sao )?(as )?(suas )?(funcoes|funcionalidades|capacidades)|^(ajuda|help)\b|para que (voce|vc) serve/],
  ["advice", /o que (eu )?devo fazer|dica|conselho|como (posso )?(economizar|poupar|guardar)|devo (economizar|cortar|reduzir)|melhorar (minhas )?financas/],
  ["cards", /cart(ao|oes)|fatura|limite|credito/],
  ["goals", /\bmetas?\b|objetivo/],
  ["net_worth", /patrimonio|meus bens|investimento/],
  ["biggest_expense", /maior(es)? (gasto|despesa)/],
  ["spending", /gast|despesa|categoria|consumo|onde (foi|vai|esta indo) (o )?(meu )?dinheiro/],
  ["income", /receita|entrad|renda|salario|ganhei|recebi/],
  ["situation", /situacao|resumo|como (estou|esta|estao|anda|andam|vai|vao)|minhas financas|saldo|balanco|panorama|visao geral/],
];

export function detectLocalIntent(question: string): LocalIntent | null {
  const value = normalize(question);
  return INTENTS.find(([, pattern]) => pattern.test(value))?.[0] ?? null;
}

export function isCapabilitiesQuestion(question: string) {
  return detectLocalIntent(question) === "capabilities";
}

export const CAPABILITIES_ANSWER = [
  "Posso ajudar com suas finanças usando os dados que você registrou no Fluxo:",
  "",
  "- **Responder perguntas**: situação do mês, gastos por categoria, maior gasto, receitas, cartões e faturas, metas e patrimônio.",
  "- **Dar orientações**: onde dá para economizar e quanto você está poupando.",
  "- **Registrar lançamentos** por texto ou voz, direto: *“Gastei 35 reais no almoço no Pix”*, *“Recebi 2.000 de salário”*, *“Comprei 600 em 3x no Nubank”*.",
  "- **Criar metas**: *“Criar meta viagem de 5.000”*.",
  "",
  "Entendo datas como hoje, ontem, segunda passada ou dia 5. Perguntas nunca criam lançamentos — só uma ordem como “gastei”, “paguei” ou “recebi”.",
].join("\n");

type MonthNumbers = {
  key: string;
  income: number;
  cashOut: number;
  invoicePayments: number;
  consumption: number;
  balance: number;
  rate: number | null;
  count: number;
};

function monthNumbers(context: FluxoAiContext, key: string): MonthNumbers {
  const rows = context.transactions.filter((t) => t.date.slice(0, 7) === key);
  const income = rows.filter((t) => t.type === "income").reduce((s, t) => s + num(t.amount), 0);
  const cashOut = rows.filter((t) => t.type === "expense").reduce((s, t) => s + num(t.amount), 0);
  const consumption = rows.filter(isConsumptionExpense).reduce((s, t) => s + num(t.amount), 0);
  const savings = savingsForMonth(context.transactions, key);
  return {
    key,
    income,
    cashOut,
    invoicePayments: cashOut - consumption,
    consumption,
    balance: income - cashOut,
    rate: savings.rate,
    count: rows.length,
  };
}

function categoriesOf(context: FluxoAiContext, key: string) {
  const map = new Map<string, { name: string; value: number }>();
  context.transactions
    .filter((t) => isConsumptionExpense(t) && t.date.slice(0, 7) === key)
    .forEach((t) => {
      const category = context.categories.find((c) => c.id === t.category_id);
      const id = category?.id ?? "none";
      const entry = map.get(id) ?? { name: category?.name ?? "Sem categoria", value: 0 };
      entry.value += num(t.amount);
      map.set(id, entry);
    });
  return [...map.values()].sort((a, b) => b.value - a.value);
}

const monthName = (key: string) => monthLabel(key).toLowerCase();

function situation(context: FluxoAiContext, key: string) {
  const m = monthNumbers(context, key);
  if (m.count === 0) {
    return `Ainda não há lançamentos em ${monthName(key)}. Registre entradas e saídas (ex.: “Recebi 2.000 de salário”) para eu montar seu resumo.`;
  }
  const top = categoriesOf(context, key).slice(0, 3);
  const committed = context.purchases.reduce((s, p) => s + remainingOf(p).total, 0);
  const lines = [
    `**Resumo de ${monthName(key)}**`,
    "",
    `- Entrou **${brl(m.income)}** e saiu **${brl(m.cashOut)}** em caixa${m.invoicePayments > 0 ? ` (inclui ${brl(m.invoicePayments)} em pagamentos de fatura)` : ""}: saldo de **${brl(m.balance)}**.`,
    `- Consumo do mês: **${brl(m.consumption)}** (sem pagamentos de fatura). Taxa de poupança: **${savingsPercent(m.rate)}**.`,
  ];
  if (top.length) lines.push(`- Maiores gastos: ${top.map((c) => `${c.name} ${brl(c.value)}`).join(", ")}.`);
  if (committed > 0) lines.push(`- Parcelas ainda a pagar: **${brl(committed)}**.`);
  lines.push("");
  if (m.income === 0) lines.push("Não há receitas registradas neste mês, então não dá para calcular quanto você está poupando.");
  else if (m.rate !== null && m.rate < 0) lines.push("Seu consumo está maior que suas receitas neste mês. Vale revisar os maiores gastos antes de assumir novos compromissos.");
  else if (m.balance < 0) lines.push("O saldo de caixa ficou negativo por causa dos pagamentos de fatura, mas o consumo do mês cabe nas receitas.");
  else lines.push("Você está fechando o mês no positivo.");
  return lines.join("\n");
}

function advice(context: FluxoAiContext, key: string) {
  const m = monthNumbers(context, key);
  const top = categoriesOf(context, key)[0];
  if (m.income === 0) {
    return "Para eu orientar com números, registre suas receitas do mês. Com entradas e saídas lançadas, calculo sua taxa de poupança e onde dá para economizar.";
  }
  const rate = m.rate ?? 0;
  const cut = top ? ` Reduzir **${top.name}** em 10% libera cerca de **${brl(top.value * 0.1)}** por mês.` : "";
  if (rate < 0) return `Neste mês o consumo (**${brl(m.consumption)}**) passou das receitas (**${brl(m.income)}**). Priorize cortar gastos variáveis e evite novas parcelas.${cut}`;
  if (rate < 10) return `Você está poupando **${savingsPercent(m.rate)}** das receitas. Uma referência comum é guardar de 10% a 20%.${cut}`;
  if (rate < 20) return `Você está poupando **${savingsPercent(m.rate)}** das receitas — bom caminho. Direcionar a sobra para a reserva de emergência e suas metas ajuda a manter o ritmo.${cut}`;
  return `Ótimo: você está poupando **${savingsPercent(m.rate)}** das receitas. Considere direcionar a sobra (**${brl(m.income - m.consumption)}**) para a reserva de emergência e metas. Isso não é recomendação de investimento.`;
}

function cards(context: FluxoAiContext, now: Date) {
  if (context.cards.length === 0) return "Você ainda não cadastrou cartões. Cadastre em Cartões para eu acompanhar as faturas.";
  const lines = context.cards.map((card) => {
    const key = invoiceKeyForDate(card, now);
    const invoice = cardInvoice(card.id, key, context.transactions, context.purchases, card);
    return `- **${card.name}**: fatura com vencimento em ${monthName(key)} de **${brl(invoice)}** (vence dia ${card.due_day}).`;
  });
  return ["**Seus cartões**", "", ...lines].join("\n");
}

function goals(context: FluxoAiContext) {
  if (context.goals.length === 0) return "Você ainda não tem metas. Para criar, diga por exemplo: “Criar meta viagem de 5.000”.";
  const lines = context.goals.map((goal) => {
    const missing = Math.max(0, num(goal.target_amount) - num(goal.current_amount));
    return `- **${goal.name}**: ${brl(num(goal.current_amount))} de ${brl(num(goal.target_amount))}${missing > 0 ? ` · faltam ${brl(missing)}` : " · concluída"}.`;
  });
  return ["**Suas metas**", "", ...lines].join("\n");
}

function netWorth(context: FluxoAiContext) {
  if (context.assets.length === 0) return "Você ainda não cadastrou bens ou contas em Patrimônio.";
  const total = context.assets.reduce((s, a) => s + num(a.value), 0);
  return `Seu patrimônio registrado soma **${brl(total)}** em ${context.assets.length} ${context.assets.length === 1 ? "item" : "itens"}.`;
}

function biggestExpense(context: FluxoAiContext, key: string) {
  const biggest = context.transactions
    .filter((t) => isConsumptionExpense(t) && t.date.slice(0, 7) === key)
    .sort((a, b) => num(b.amount) - num(a.amount))[0];
  return biggest
    ? `Seu maior gasto em ${monthName(key)} foi **${biggest.description || "Sem descrição"}**, de **${brl(num(biggest.amount))}**.`
    : `Ainda não há despesas em ${monthName(key)}.`;
}

function spending(context: FluxoAiContext, key: string) {
  const list = categoriesOf(context, key);
  if (list.length === 0) return `Ainda não há despesas em ${monthName(key)}.`;
  const total = list.reduce((s, c) => s + c.value, 0);
  return [
    `**Gastos de ${monthName(key)}**: ${brl(total)} (sem pagamentos de fatura)`,
    "",
    ...list.slice(0, 5).map((c) => `- ${c.name}: ${brl(c.value)}`),
  ].join("\n");
}

function income(context: FluxoAiContext, key: string) {
  const m = monthNumbers(context, key);
  return m.income > 0 ? `Em ${monthName(key)} entraram **${brl(m.income)}**.` : `Ainda não há receitas em ${monthName(key)}.`;
}

/** Answers with local calculations. `matched` is false when the question was not understood (a monthly summary is returned). */
export function localAnswer(question: string, context: FluxoAiContext, now: Date = new Date()) {
  const key = savingsMonthKey(now);
  const intent = detectLocalIntent(question);
  switch (intent) {
    case "capabilities": return { intent, matched: true, text: CAPABILITIES_ANSWER };
    case "advice": return { intent, matched: true, text: advice(context, key) };
    case "cards": return { intent, matched: true, text: cards(context, now) };
    case "goals": return { intent, matched: true, text: goals(context) };
    case "net_worth": return { intent, matched: true, text: netWorth(context) };
    case "biggest_expense": return { intent, matched: true, text: biggestExpense(context, key) };
    case "spending": return { intent, matched: true, text: spending(context, key) };
    case "income": return { intent, matched: true, text: income(context, key) };
    case "situation": return { intent, matched: true, text: situation(context, key) };
    default:
      return {
        intent: null,
        matched: false,
        text: `Essa pergunta precisa do assistente inteligente. Enquanto isso, aqui está o seu mês:\n\n${situation(context, key)}`,
      };
  }
}

export type ChatErrorKind = "credits" | "denied" | "config" | "rate" | "auth" | "unavailable";

/** Classifies an error from the chat route (stream error text or JSON body) without exposing technical details. */
export function classifyChatError(raw: string | undefined | null): { kind: ChatErrorKind; pause: boolean } {
  let status: number | undefined;
  try {
    const parsed = JSON.parse(raw ?? "") as { status?: unknown };
    if (typeof parsed.status === "number") status = parsed.status;
  } catch {
    const match = (raw ?? "").match(/\b(401|402|403|429|503)\b/);
    if (match?.[1]) status = Number(match[1]);
  }
  if (status === 402) return { kind: "credits", pause: true };
  if (status === 403) return { kind: "denied", pause: true };
  if (status === 503) return { kind: "config", pause: true };
  if (status === 429) return { kind: "rate", pause: false };
  if (status === 401) return { kind: "auth", pause: false };
  return { kind: "unavailable", pause: false };
}

const NOTICE: Record<ChatErrorKind, string> = {
  credits: "O assistente inteligente está sem créditos de IA no momento.",
  denied: "O assistente inteligente não está liberado no momento.",
  config: "O assistente inteligente ainda não está configurado neste ambiente.",
  rate: "O assistente inteligente está com muitas solicitações agora; tente de novo em instantes.",
  auth: "Sua sessão expirou; entre novamente para usar o assistente completo.",
  unavailable: "Não consegui falar com o assistente inteligente agora.",
};

/** Useful answer in Portuguese when the AI call fails: a short notice plus local calculations. */
export function fallbackAnswer(question: string, context: FluxoAiContext, kind: ChatErrorKind, now: Date = new Date()) {
  const answer = localAnswer(question, context, now);
  return `_${NOTICE[kind]} Respondi com cálculos feitos no próprio app, a partir dos seus lançamentos._\n\n${answer.text}`;
}

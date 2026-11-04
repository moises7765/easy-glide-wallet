import { parseMoney, type FluxoAiContext } from "@/lib/fluxo-ai";
import {
  analyzePurchase,
  completePurchaseQuery,
  fixedExpensesAnswer,
  freeMoneyAnswer,
  isFixedQuestion,
  isFreeMoneyQuestion,
  goalsStrategyAnswer,
  isGoalsQuestion,
  isPurchaseQuestion,
  isSavingsQuestion,
  missingPurchaseInfo,
  parseExtraSavings,
  parsePurchaseQuery,
  purchaseLaunchText,
  purchaseQuestionFor,
  REGISTER_AFTER_SIMULATION,
  savingsStrategyAnswer,
  type PurchaseQuery,
} from "@/lib/fluxo-ai-planning";

/** Chat state for planning flows: a purchase waiting for one missing detail, and the last simulated purchase. */
export type PlanningState = { pendingPurchase: PurchaseQuery | null; lastPurchase: PurchaseQuery | null };
export const EMPTY_PLANNING: PlanningState = { pendingPurchase: null, lastPurchase: null };

/**
 * reply: answer computed locally (nothing is written).
 * launchText: explicit "comprei" after a simulation; the chat sends it through the normal launch flow.
 * Only `state`: nothing matched, continue with the usual routing using this state.
 */
export type PlanningResult = { state: PlanningState; reply?: string; launchText?: string };

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const EXPLICIT_ORDER = /\b(gastei|paguei|comprei|recebi|ganhei)\b/;

function purchaseReply(q: PurchaseQuery, context: FluxoAiContext, now: Date): PlanningResult {
  const missing = missingPurchaseInfo(q, context);
  if (missing) return { state: { pendingPurchase: q, lastPurchase: null }, reply: purchaseQuestionFor(missing, context) };
  return { state: { pendingPurchase: null, lastPurchase: q }, reply: analyzePurchase(q, context, now).text };
}

export function planningReply(text: string, state: PlanningState, context: FluxoAiContext, now: Date = new Date()): PlanningResult | null {
  const value = normalize(text);
  let current = state;
  if (current.pendingPurchase) {
    if (/^(cancelar|cancela|deixa|esquece|nao)\b/.test(value)) return { state: EMPTY_PLANNING, reply: "Tudo bem, deixei a simulação de lado. Nada foi registrado." };
    const completed = completePurchaseQuery(current.pendingPurchase, text, context);
    if (completed) return purchaseReply(completed, context, now);
    current = { ...current, pendingPurchase: null };
  }
  if (current.lastPurchase && REGISTER_AFTER_SIMULATION.test(value) && !parseMoney(text)) {
    return { state: EMPTY_PLANNING, launchText: purchaseLaunchText(current.lastPurchase) };
  }
  // Gastos fixos e dinheiro livre: só leitura. Ordens ("paguei a luz 180") seguem para o lançamento.
  if (!EXPLICIT_ORDER.test(value) && isFreeMoneyQuestion(text)) return { state: current, reply: freeMoneyAnswer(context, now) };
  if (isPurchaseQuestion(text) && !EXPLICIT_ORDER.test(value)) return purchaseReply(parsePurchaseQuery(text, context), context, now);
  if (!EXPLICIT_ORDER.test(value) && isFixedQuestion(text)) return { state: current, reply: fixedExpensesAnswer(context, now) };
  const extra = parseExtraSavings(text);
  if (extra) return { state: current, reply: goalsStrategyAnswer(context, now, extra) };
  if (isGoalsQuestion(text)) return { state: current, reply: goalsStrategyAnswer(context, now) };
  if (isSavingsQuestion(text)) return { state: current, reply: savingsStrategyAnswer(context, now) };
  return current === state ? null : { state: current };
}

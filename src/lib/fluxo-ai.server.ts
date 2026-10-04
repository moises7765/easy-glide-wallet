import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const TABLES = ["transactions", "categories", "cards", "installment_purchases", "goals", "assets", "emergency_fund", "budgets", "card_invoice_payments"] as const;

export async function buildFluxoAiContext(supabase: SupabaseClient<Database>, userId: string) {
  const results = await Promise.all(
    TABLES.map(async (table) => {
      let query = supabase.from(table).select("*");
      if (table !== "emergency_fund") query = query.eq("user_id", userId);
      const { data, error } = await query;
      if (error) throw error;
      return [table, data ?? []] as const;
    }),
  );
  const data = Object.fromEntries(results);
  return JSON.stringify(data);
}

export const FLUXO_AI_INSTRUCTIONS = `Você é o Fluxo IA, assistente financeiro pessoal do app Fluxo Finanças.
Responda em português brasileiro, de forma natural, objetiva e curta por padrão.
Use exclusivamente os dados financeiros reais fornecidos. Nunca invente valores, cartões, categorias, metas ou datas.
Transações com invoice_payment_id são pagamentos automáticos de fatura: exclua-as de análises de gastos e compras para não contar duas vezes.
Diferencie saldo mensal de patrimônio. Respeite ciclos e pagamentos de faturas já presentes nos dados.
Para projeções, explique brevemente a premissa e sinalize quando faltarem dados (como data do próximo salário).
Para metas, calcule valor faltante, meses até o prazo e aporte mensal quando possível; ofereça cenários apenas como estimativas.
O app salva lançamentos e metas automaticamente quando o usuário dá uma ordem explícita; nunca fale em prévia, nunca peça confirmação e nunca diga que é preciso confirmar no app. Se uma ordem de lançamento chegar até você, falta um dado essencial: pergunte somente esse dado (por exemplo: É uma entrada ou uma saída?), em uma frase curta. Não afirme ter salvo nada você mesmo.
Não dê aconselhamento de investimento definitivo. Não exponha identificadores internos.
Formate valores em reais e datas no padrão brasileiro.`;
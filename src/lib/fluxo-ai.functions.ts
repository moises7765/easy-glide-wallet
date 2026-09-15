import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const transactionInput = z.object({
  kind: z.literal("transaction"),
  type: z.enum(["expense", "income"]),
  amount: z.number().positive(),
  date: z.string(),
  description: z.string(),
  categoryId: z.string().nullable(),
  cardId: z.string().nullable(),
  installments: z.number().int().positive(),
  paymentMethod: z.string(),
});

const goalInput = z.object({
  kind: z.literal("goal"),
  name: z.string(),
  targetAmount: z.number().positive(),
  currentAmount: z.number().nonnegative(),
  deadline: z.string().nullable(),
});

export const executeFluxoAiAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.discriminatedUnion("kind", [transactionInput, goalInput]).parse(input))
  .handler(async ({ data, context }) => {
    if (data.kind === "goal") {
      const { error } = await context.supabase.from("goals").insert({
        user_id: context.userId,
        name: data.name.trim() || "Nova meta",
        target_amount: data.targetAmount,
        current_amount: data.currentAmount,
        deadline: data.deadline,
      });
      if (error) throw error;
      return { kind: "goal" as const };
    }

    if (data.installments > 1) {
      if (!data.cardId) throw new Error("Escolha um cartão para registrar a compra parcelada.");
      const { error } = await context.supabase.from("installment_purchases").insert({
        user_id: context.userId,
        card_id: data.cardId,
        category_id: data.categoryId,
        description: data.description,
        total_amount: data.amount,
        installments_count: data.installments,
        installments_paid: 0,
        first_due_date: data.date,
      });
      if (error) throw error;
      return { kind: "installment" as const };
    }

    const { error } = await context.supabase.from("transactions").insert({
      user_id: context.userId,
      type: data.type,
      amount: data.amount,
      date: data.date,
      category_id: data.categoryId,
      card_id: data.paymentMethod === "credito" ? data.cardId : null,
      payment_method: data.paymentMethod,
      description: data.description,
    });
    if (error) throw error;
    return { kind: "transaction" as const };
  });
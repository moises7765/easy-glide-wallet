import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

type TableName =
  | "transactions"
  | "categories"
  | "cards"
  | "installment_purchases"
  | "assets"
  | "goals"
  | "budgets"
  | "net_worth_snapshots";

const ORDER: Record<TableName, { column: string; ascending: boolean }> = {
  transactions: { column: "date", ascending: false },
  categories: { column: "name", ascending: true },
  cards: { column: "created_at", ascending: true },
  installment_purchases: { column: "first_due_date", ascending: false },
  assets: { column: "value", ascending: false },
  goals: { column: "created_at", ascending: true },
  budgets: { column: "created_at", ascending: true },
  net_worth_snapshots: { column: "date", ascending: true },
};

export function useUser() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setEmail(data.user?.email ?? null);
    });
  }, []);
  return { userId, email };
}

export function useRows<T extends TableName>(table: T) {
  return useQuery({
    queryKey: [table],
    queryFn: async () => {
      const order = ORDER[table];
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .order(order.column, { ascending: order.ascending });
      if (error) throw error;
      return (data ?? []) as Tables<T>[];
    },
  });
}

export function useEmergencyFund() {
  return useQuery({
    queryKey: ["emergency_fund"],
    queryFn: async () => {
      const { data, error } = await supabase.from("emergency_fund").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, table: string) {
  qc.invalidateQueries({ queryKey: [table] });
  qc.invalidateQueries({ queryKey: ["emergency_fund"] });
  if (table !== "net_worth_snapshots") qc.invalidateQueries({ queryKey: ["net_worth_snapshots"] });
}

export function useCreate<T extends TableName>(table: T, label = "Salvo") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Omit<TablesInsert<T>, "user_id">) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sessão expirada");
      const { error } = await supabase
        .from(table)
        .insert({ ...values, user_id: auth.user.id } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate(qc, table);
      toast.success(label);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdate<T extends TableName>(table: T, label = "Atualizado") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: TablesUpdate<T> }) => {
      const { error } = await supabase
        .from(table)
        .update(values as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate(qc, table);
      toast.success(label);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRemove<T extends TableName>(table: T, label = "Excluído") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate(qc, table);
      toast.success(label);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useSaveFund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      current_amount: number;
      target_amount: number;
      months_target: number;
      monthly_expense: number;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sessão expirada");
      const { error } = await supabase
        .from("emergency_fund")
        .upsert({ ...values, user_id: auth.user.id }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["emergency_fund"] });
      toast.success("Reserva atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
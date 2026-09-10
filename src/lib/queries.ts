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
  | "card_invoice_payments"
  | "net_worth_snapshots";

const ORDER: Record<TableName, { column: string; ascending: boolean }> = {
  transactions: { column: "date", ascending: false },
  categories: { column: "name", ascending: true },
  cards: { column: "created_at", ascending: true },
  installment_purchases: { column: "first_due_date", ascending: false },
  assets: { column: "value", ascending: false },
  goals: { column: "created_at", ascending: true },
  budgets: { column: "created_at", ascending: true },
  card_invoice_payments: { column: "due_date", ascending: true },
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

/** True once a Supabase session is confirmed, so queries never fire unauthenticated. */
export function useSessionReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setReady(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setReady(Boolean(session));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return ready;
}

export function useRows<T extends TableName>(table: T) {
  const ready = useSessionReady();
  return useQuery({
    queryKey: [table],
    enabled: ready,
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
  const ready = useSessionReady();
  return useQuery({
    queryKey: ["emergency_fund"],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase.from("emergency_fund").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useProfile() {
  const ready = useSessionReady();
  return useQuery({
    queryKey: ["profiles"],
    enabled: ready,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", auth.user.id)
        .maybeSingle();
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

type LooseQuery = {
  update: (values: unknown) => {
    eq: (column: string, value: string) => PromiseLike<{ error: { message: string } | null }>;
  };
  delete: () => {
    eq: (column: string, value: string) => PromiseLike<{ error: { message: string } | null }>;
  };
};

const loose = (table: TableName) => supabase.from(table) as unknown as LooseQuery;

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
      const { error } = await loose(table).update(values).eq("id", id);
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
      const { error } = await loose(table).delete().eq("id", id);
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
/** Bulk insert of imported statement transactions. */
export function useImportTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Omit<TablesInsert<"transactions">, "user_id">[]) => {
      if (rows.length === 0) return 0;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sessão expirada");
      const payload = rows.map((r) => ({ ...r, user_id: auth.user!.id }));
      for (let i = 0; i < payload.length; i += 200) {
        const { error } = await supabase.from("transactions").insert(payload.slice(i, i + 200) as never);
        if (error) throw error;
      }
      return rows.length;
    },
    onSuccess: (count) => {
      invalidate(qc, "transactions");
      qc.invalidateQueries();
      toast.success(`${count} lançamento(s) importado(s)`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Marca a fatura como paga e cria o lançamento de despesa vinculado (idempotente). */
export function usePayInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      card_id: string;
      card_name: string;
      invoice_key: string;
      invoice_label: string;
      due_date: string;
      amount: number;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sessão expirada");
      const userId = auth.user.id;

      const { data: payment, error: payErr } = await supabase
        .from("card_invoice_payments")
        .upsert(
          {
            user_id: userId,
            card_id: input.card_id,
            invoice_key: input.invoice_key,
            due_date: input.due_date,
            amount: input.amount,
          },
          { onConflict: "card_id,invoice_key" },
        )
        .select("id, paid_at")
        .single();
      if (payErr) throw payErr;

      const { data: existing } = await supabase
        .from("transactions")
        .select("id")
        .eq("invoice_payment_id", payment.id)
        .maybeSingle();
      if (existing) return;

      const { data: categories } = await supabase
        .from("categories")
        .select("id, name, kind")
        .eq("kind", "expense");
      const category = (categories ?? []).find((c) =>
        /fatura|cart[ãa]o/i.test(c.name ?? ""),
      );

      const paidDate = (payment.paid_at ?? new Date().toISOString()).slice(0, 10);
      const { error: txErr } = await supabase.from("transactions").insert({
        user_id: userId,
        type: "expense",
        amount: input.amount,
        date: paidDate,
        card_id: input.card_id,
        category_id: category?.id ?? null,
        payment_method: "transfer",
        description: `Pagamento da fatura ${input.card_name} — ${input.invoice_label}`,
        invoice_payment_id: payment.id,
      } as never);
      if (txErr && txErr.code !== "23505") throw txErr;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Fatura marcada como paga");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Desfaz o pagamento; o lançamento vinculado sai junto via ON DELETE CASCADE. */
export function useUnpayInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase.from("card_invoice_payments").delete().eq("id", paymentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Pagamento desfeito");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

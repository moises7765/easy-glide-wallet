import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { BottomSheet, EmptyState, PageHeader, Panel, Row } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  brl,
  formatDayMonth,
  monthKey,
  monthLabel,
  num,
  PAYMENT_METHODS,
  type Transaction,
} from "@/lib/finance";
import { useRemove, useRows, useUpdate } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/lancamentos")({
  head: () => ({
    meta: [
      { title: "Lançamentos — Fluxo Finanças" },
      { name: "description", content: "Todas as receitas e despesas, com edição e exclusão." },
      { property: "og:title", content: "Lançamentos — Fluxo Finanças" },
      { property: "og:description", content: "Todas as receitas e despesas, com edição e exclusão." },
    ],
  }),
  component: TransactionsPage,
});

function TransactionsPage() {
  const { data: transactions = [] } = useRows("transactions");
  const { data: categories = [] } = useRows("categories");
  const { data: cards = [] } = useRows("cards");
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");
  const [editing, setEditing] = useState<Transaction | null>(null);

  const groups = useMemo(() => {
    const list = transactions.filter((t) => filter === "all" || t.type === filter);
    const map = new Map<string, Transaction[]>();
    list.forEach((t) => {
      const key = monthKey(t.date);
      map.set(key, [...(map.get(key) ?? []), t]);
    });
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [transactions, filter]);

  return (
    <div className="space-y-4">
      <PageHeader title="Lançamentos" subtitle={`${transactions.length} registros`} />

      <div className="flex gap-2 px-5">
        {(
          [
            { value: "all", label: "Tudo" },
            { value: "income", label: "Receitas" },
            { value: "expense", label: "Despesas" },
          ] as const
        ).map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              filter === f.value
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="px-5">
          <EmptyState title="Nenhum lançamento" description="Toque no + para registrar em segundos." />
        </div>
      ) : null}

      {groups.map(([key, items]) => {
        const total = items.reduce(
          (s, t) => s + (t.type === "income" ? num(t.amount) : -num(t.amount)),
          0,
        );
        return (
          <div key={key} className="px-5">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {monthLabel(key)}
              </p>
              <p className="text-xs tabular-nums text-muted-foreground">{brl(total)}</p>
            </div>
            <Panel className="divide-y divide-border p-0">
              {items.map((t) => {
                const cat = categories.find((c) => c.id === t.category_id);
                const card = cards.find((c) => c.id === t.card_id);
                return (
                  <Row
                    key={t.id}
                    title={t.description || cat?.name || "Lançamento"}
                    subtitle={[formatDayMonth(t.date), cat?.name, card?.name].filter(Boolean).join(" · ")}
                    right={`${t.type === "income" ? "+" : "−"} ${brl(num(t.amount))}`}
                    tone={t.type === "income" ? "positive" : "negative"}
                    onClick={() => setEditing(t)}
                    leading={
                      <span
                        className="h-9 w-9 rounded-xl"
                        style={{ background: `${cat?.color ?? "#64748B"}22` }}
                      />
                    }
                  />
                );
              })}
            </Panel>
          </div>
        );
      })}

      <EditTransaction transaction={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function EditTransaction({
  transaction,
  onClose,
}: {
  transaction: Transaction | null;
  onClose: () => void;
}) {
  const { data: categories = [] } = useRows("categories");
  const { data: cards = [] } = useRows("cards");
  const update = useUpdate("transactions");
  const remove = useRemove("transactions");

  const [form, setForm] = useState<Transaction | null>(transaction);
  if (transaction && form?.id !== transaction.id) setForm(transaction);
  if (!transaction || !form) return null;

  return (
    <BottomSheet open={Boolean(transaction)} onOpenChange={(v) => !v && onClose()} title="Editar lançamento">
      <div className="space-y-4">
        <div>
          <Label className="text-xs text-muted-foreground">Valor</Label>
          <Input
            type="number"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
            className="mt-1 h-12 text-lg"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Data</Label>
          <Input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Categoria</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {categories
              .filter((c) => c.kind === form.type)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setForm({ ...form, category_id: c.id })}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm",
                    form.category_id === c.id
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {c.name}
                </button>
              ))}
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Forma de pagamento</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setForm({ ...form, payment_method: m.value })}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm",
                  form.payment_method === m.value
                    ? "border-foreground bg-accent"
                    : "border-border text-muted-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        {form.payment_method === "credito" && cards.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {cards.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setForm({ ...form, card_id: c.id })}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm",
                  form.card_id === c.id ? "border-transparent" : "border-border text-muted-foreground",
                )}
                style={form.card_id === c.id ? { background: c.color } : undefined}
              >
                {c.name}
              </button>
            ))}
          </div>
        ) : null}
        <div>
          <Label className="text-xs text-muted-foreground">Descrição</Label>
          <Input
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Observação</Label>
          <Textarea
            value={form.note ?? ""}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            rows={2}
            className="mt-1"
          />
        </div>
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            className="h-12 flex-1 rounded-full text-destructive"
            onClick={async () => {
              await remove.mutateAsync(form.id);
              onClose();
            }}
          >
            Excluir
          </Button>
          <Button
            className="h-12 flex-1 rounded-full font-semibold"
            onClick={async () => {
              await update.mutateAsync({
                id: form.id,
                values: {
                  amount: form.amount,
                  date: form.date,
                  category_id: form.category_id,
                  card_id: form.payment_method === "credito" ? form.card_id : null,
                  payment_method: form.payment_method,
                  description: form.description,
                  note: form.note,
                },
              });
              onClose();
            }}
          >
            Salvar
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
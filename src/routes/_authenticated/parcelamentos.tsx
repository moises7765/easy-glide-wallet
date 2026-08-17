import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { BottomSheet, EmptyState, PageHeader, Panel } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  brl,
  installmentLines,
  monthKey,
  monthLabel,
  num,
  pct,
  remainingOf,
  type InstallmentPurchase,
} from "@/lib/finance";
import { useRemove, useRows, useUpdate } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/parcelamentos")({
  head: () => ({
    meta: [
      { title: "Parcelamentos — Fluxo Finanças" },
      { name: "description", content: "Todas as compras parceladas e os meses comprometidos." },
      { property: "og:title", content: "Parcelamentos — Fluxo Finanças" },
      { property: "og:description", content: "Todas as compras parceladas e os meses comprometidos." },
    ],
  }),
  component: InstallmentsPage,
});

function InstallmentsPage() {
  const { data: purchases = [] } = useRows("installment_purchases");
  const { data: cards = [] } = useRows("cards");
  const [editing, setEditing] = useState<InstallmentPurchase | null>(null);

  const totalLeft = purchases.reduce((s, p) => s + remainingOf(p).total, 0);

  const byMonth = new Map<string, number>();
  purchases
    .flatMap(installmentLines)
    .filter((l) => !l.paid)
    .forEach((l) => byMonth.set(l.monthKey, (byMonth.get(l.monthKey) ?? 0) + l.amount));
  const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 12);

  return (
    <div className="space-y-4">
      <PageHeader title="Parcelamentos" subtitle={`${brl(totalLeft)} ainda comprometidos`} />

      {purchases.length === 0 ? (
        <div className="px-5">
          <EmptyState
            title="Nenhum parcelamento"
            description="Compras no crédito com mais de 1 parcela aparecem aqui."
          />
        </div>
      ) : null}

      {months.length > 0 ? (
        <div className="px-5">
          <Panel>
            <p className="text-sm font-medium">Comprometido por mês</p>
            <ul className="mt-3 space-y-2">
              {months.map(([key, value]) => (
                <li key={key} className="flex items-center gap-3 text-sm">
                  <span className="w-16 text-muted-foreground capitalize">{monthLabel(key)}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{
                        width: `${pct(value, Math.max(...months.map((m) => m[1])))}%`,
                      }}
                    />
                  </span>
                  <span className="tabular-nums">{brl(value)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : null}

      <div className="space-y-3 px-5">
        {purchases.map((p) => {
          const r = remainingOf(p);
          const card = cards.find((c) => c.id === p.card_id);
          const next = installmentLines(p).find((l) => !l.paid);
          return (
            <Panel key={p.id}>
              <button type="button" className="w-full text-left" onClick={() => setEditing(p)}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{p.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {card?.name ?? "Sem cartão"} · {brl(num(p.total_amount))}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">
                    {r.count}x {brl(r.amount)}
                  </p>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${pct(p.installments_paid, r.count)}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>
                    {p.installments_paid} pagas · {r.left} restantes
                  </span>
                  <span>
                    {next
                      ? `Próxima ${monthLabel(monthKey(next.dueDate))}`
                      : "Quitado"}
                  </span>
                </div>
              </button>
            </Panel>
          );
        })}
      </div>

      <InstallmentSheet purchase={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function InstallmentSheet({
  purchase,
  onClose,
}: {
  purchase: InstallmentPurchase | null;
  onClose: () => void;
}) {
  const update = useUpdate("installment_purchases");
  const remove = useRemove("installment_purchases");
  const [form, setForm] = useState<InstallmentPurchase | null>(purchase);
  if (purchase && form?.id !== purchase.id) setForm(purchase);
  if (!purchase || !form) return null;

  return (
    <BottomSheet open onOpenChange={(v) => !v && onClose()} title="Editar parcelamento">
      <div className="space-y-4">
        <div>
          <Label className="text-xs text-muted-foreground">Descrição</Label>
          <Input
            className="mt-1"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Valor total</Label>
            <Input
              className="mt-1"
              type="number"
              step="0.01"
              value={form.total_amount}
              onChange={(e) => setForm({ ...form, total_amount: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Parcelas</Label>
            <Input
              className="mt-1"
              type="number"
              min={1}
              value={form.installments_count}
              onChange={(e) => setForm({ ...form, installments_count: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Parcelas pagas</Label>
            <Input
              className="mt-1"
              type="number"
              min={0}
              value={form.installments_paid}
              onChange={(e) => setForm({ ...form, installments_paid: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">1ª parcela</Label>
            <Input
              className="mt-1"
              type="date"
              value={form.first_due_date}
              onChange={(e) => setForm({ ...form, first_due_date: e.target.value })}
            />
          </div>
        </div>
        <Button
          variant="secondary"
          className="h-11 w-full rounded-full"
          onClick={() =>
            setForm({
              ...form,
              installments_paid: Math.min(form.installments_count, form.installments_paid + 1),
            })
          }
        >
          Marcar mais uma parcela como paga
        </Button>
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
                  description: form.description,
                  total_amount: form.total_amount,
                  installments_count: form.installments_count,
                  installments_paid: form.installments_paid,
                  first_due_date: form.first_due_date,
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
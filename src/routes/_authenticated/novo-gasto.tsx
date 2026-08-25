import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { PageHeader, Panel } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toISODate } from "@/lib/finance";
import { useCreate, useRows } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/novo-gasto")({
  head: () => ({
    meta: [
      { title: "Novo gasto — Fluxo Finanças" },
      { name: "description", content: "Registre um gasto em segundos: valor, descrição e categoria." },
      { property: "og:title", content: "Novo gasto — Fluxo Finanças" },
      {
        property: "og:description",
        content: "Registre um gasto em segundos: valor, descrição e categoria.",
      },
    ],
  }),
  component: NovoGasto,
});

function NovoGasto() {
  const navigate = useNavigate();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const { data: categories = [] } = useRows("categories");
  const createTx = useCreate("transactions", "Gasto registrado");

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.kind === "expense"),
    [categories],
  );

  const value = Number(amount.replace(/\./g, "").replace(",", "."));
  const canSave = value > 0;

  async function save() {
    if (!canSave) return;
    await createTx.mutateAsync({
      type: "expense",
      amount: value,
      date: toISODate(new Date()),
      category_id: categoryId,
      card_id: null,
      payment_method: "pix",
      description: description || null,
      note: null,
    });
    setAmount("");
    setDescription("");
    setCategoryId(null);
    navigate({ to: "/inicio" });
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Novo gasto" subtitle="Registre em segundos" />

      <div className="px-5">
        <Panel>
          <div className="space-y-5">
            <div className="text-center">
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-2xl text-muted-foreground">R$</span>
                <input
                  autoFocus
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
                  placeholder="0,00"
                  aria-label="Valor"
                  className="w-40 bg-transparent text-center text-4xl font-semibold tabular-nums outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Para quê</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Almoço, Uber, Mercado"
                className="mt-1"
              />
            </div>

            {expenseCategories.length > 0 ? (
              <div>
                <Label className="text-xs text-muted-foreground">Categoria (opcional)</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {expenseCategories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategoryId((prev) => (prev === c.id ? null : c.id))}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm transition-colors",
                        categoryId === c.id
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <Button
              onClick={save}
              disabled={!canSave || createTx.isPending}
              className="h-12 w-full rounded-full text-base font-semibold"
            >
              Registrar gasto
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

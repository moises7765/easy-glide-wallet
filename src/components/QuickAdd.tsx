import { useMemo, useState } from "react";

import { BottomSheet } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PAYMENT_METHODS, toISODate } from "@/lib/finance";
import { useCreate, useRows } from "@/lib/queries";

export function QuickAdd({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [method, setMethod] = useState<string>("pix");
  const [cardId, setCardId] = useState<string | null>(null);
  const [installments, setInstallments] = useState(1);
  const [date, setDate] = useState(toISODate(new Date()));
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [more, setMore] = useState(false);

  const { data: categories = [] } = useRows("categories");
  const { data: cards = [] } = useRows("cards");
  const createTx = useCreate("transactions", "Lançamento salvo");
  const createInstallment = useCreate("installment_purchases", "Parcelamento criado");

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.kind === type),
    [categories, type],
  );

  const value = Number(amount.replace(/\./g, "").replace(",", "."));
  const canSave = value > 0;

  function reset() {
    setAmount("");
    setCategoryId(null);
    setInstallments(1);
    setDescription("");
    setNote("");
    setMore(false);
    setDate(toISODate(new Date()));
  }

  async function save() {
    if (!canSave) return;
    if (type === "expense" && method === "credito" && cardId && installments > 1) {
      await createInstallment.mutateAsync({
        card_id: cardId,
        category_id: categoryId,
        description: description || "Compra parcelada",
        total_amount: value,
        installments_count: installments,
        installments_paid: 0,
        first_due_date: date,
        note: note || null,
      });
    } else {
      await createTx.mutateAsync({
        type,
        amount: value,
        date,
        category_id: categoryId,
        card_id: method === "credito" ? cardId : null,
        payment_method: method,
        description: description || null,
        note: note || null,
      });
    }
    reset();
    onOpenChange(false);
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Novo lançamento">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2 rounded-full bg-secondary p-1">
          {(["expense", "income"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setType(t);
                setCategoryId(null);
              }}
              className={cn(
                "rounded-full py-2 text-sm font-medium transition-colors",
                type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {t === "expense" ? "Despesa" : "Receita"}
            </button>
          ))}
        </div>

        <div className="text-center">
          <div className="flex items-baseline justify-center gap-2">
            <span className="text-2xl text-muted-foreground">R$</span>
            <input
              autoFocus
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
              placeholder="0,00"
              className="w-40 bg-transparent text-center text-4xl font-semibold tabular-nums outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {visibleCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id)}
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

        <div className="flex flex-wrap gap-2">
          {PAYMENT_METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => {
                setMethod(m.value);
                if (m.value === "credito" && !cardId && cards[0]) setCardId(cards[0].id);
              }}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                method === m.value
                  ? "border-foreground bg-accent text-foreground"
                  : "border-border text-muted-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {method === "credito" && cards.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {cards.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCardId(c.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm",
                    cardId === c.id ? "border-transparent text-white" : "border-border text-muted-foreground",
                  )}
                  style={cardId === c.id ? { background: c.color } : undefined}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Parcelas</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {[1, 2, 3, 4, 6, 10, 12, 18, 24].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setInstallments(n)}
                    className={cn(
                      "h-9 w-9 rounded-full border text-sm tabular-nums",
                      installments === n
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          {more ? "Menos detalhes" : "Mais detalhes"}
        </button>

        {more ? (
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Descrição</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Mercado do bairro"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Observação</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" rows={2} />
            </div>
          </div>
        ) : null}

        <Button
          onClick={save}
          disabled={!canSave || createTx.isPending || createInstallment.isPending}
          className="h-12 w-full rounded-full text-base font-semibold"
        >
          Salvar
        </Button>
      </div>
    </BottomSheet>
  );
}
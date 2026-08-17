import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";

import { BottomSheet, EmptyState, PageHeader, Panel } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addMonths,
  brl,
  cardInvoice,
  cardUsed,
  monthKey,
  monthLabel,
  nextMonthKeys,
  num,
  pct,
  type Card,
} from "@/lib/finance";
import { useCreate, useRemove, useRows, useUpdate } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/cartoes")({
  head: () => ({
    meta: [
      { title: "Cartões — Fluxo Finanças" },
      { name: "description", content: "Faturas atuais e futuras, limite disponível e parcelas." },
      { property: "og:title", content: "Cartões — Fluxo Finanças" },
      { property: "og:description", content: "Faturas atuais e futuras, limite disponível e parcelas." },
    ],
  }),
  component: CardsPage,
});

const EMPTY: Omit<Card, "id" | "user_id" | "created_at" | "updated_at"> = {
  name: "Nubank",
  brand: "Mastercard",
  color: "#820AD1",
  limit_total: 5000,
  closing_day: 3,
  due_day: 10,
};

function CardsPage() {
  const { data: cards = [] } = useRows("cards");
  const { data: transactions = [] } = useRows("transactions");
  const { data: purchases = [] } = useRows("installment_purchases");
  const [editing, setEditing] = useState<Card | "new" | null>(null);

  const current = monthKey(new Date());

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cartões"
        subtitle="Faturas e limites"
        action={
          <Button size="sm" className="rounded-full" onClick={() => setEditing("new")}>
            <Plus className="mr-1 h-4 w-4" /> Cartão
          </Button>
        }
      />

      {cards.length === 0 ? (
        <div className="px-5">
          <EmptyState title="Nenhum cartão" description="Cadastre seu Nubank para começar." />
        </div>
      ) : null}

      {cards.map((card) => {
        const invoice = cardInvoice(card.id, current, transactions, purchases);
        const used = cardUsed(card.id, transactions, purchases);
        const available = Math.max(0, num(card.limit_total) - used);
        const months = nextMonthKeys(6, addMonths(new Date(), 1));
        return (
          <div key={card.id} className="px-5">
            <Panel className="space-y-4">
              <div
                className="rounded-2xl p-4"
                style={{ background: `linear-gradient(135deg, ${card.color}, ${card.color}88)` }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm opacity-80">{card.brand}</p>
                    <p className="text-lg font-semibold">{card.name}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing(card)}
                    className="rounded-full bg-black/20 px-3 py-1 text-xs"
                  >
                    Editar
                  </button>
                </div>
                <p className="mt-6 text-xs opacity-80">Fatura atual</p>
                <p className="text-3xl font-semibold tabular-nums">{brl(invoice)}</p>
                <p className="mt-2 text-xs opacity-80">
                  Fecha dia {card.closing_day} · Vence dia {card.due_day}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Limite disponível</span>
                  <span className="font-semibold tabular-nums">{brl(available)}</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${pct(used, num(card.limit_total))}%`, background: card.color }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {brl(used)} usados de {brl(num(card.limit_total))}
                </p>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Próximas faturas</p>
                <ul className="space-y-1.5">
                  {months.map((m) => (
                    <li key={m} className="flex justify-between text-sm">
                      <span className="text-muted-foreground capitalize">{monthLabel(m)}</span>
                      <span className="tabular-nums">
                        {brl(cardInvoice(card.id, m, transactions, purchases))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <Link to="/parcelamentos" className="block text-sm text-primary">
                Ver parcelamentos
              </Link>
            </Panel>
          </div>
        );
      })}

      <CardSheet card={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function CardSheet({ card, onClose }: { card: Card | "new" | null; onClose: () => void }) {
  const create = useCreate("cards", "Cartão criado");
  const update = useUpdate("cards", "Cartão atualizado");
  const remove = useRemove("cards", "Cartão excluído");
  const isNew = card === "new";
  const existing = card && card !== "new" ? card : null;
  const source = existing ?? EMPTY;
  const [form, setForm] = useState(source ?? EMPTY);
  const key = existing ? existing.id : "new";
  const [loadedKey, setLoadedKey] = useState(key);
  if (card && loadedKey !== key) {
    setLoadedKey(key);
    setForm(source ?? EMPTY);
  }
  if (!card) return null;

  return (
    <BottomSheet open onOpenChange={(v) => !v && onClose()} title={isNew ? "Novo cartão" : "Editar cartão"}>
      <div className="space-y-4">
        <Field label="Nome">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Bandeira">
          <Input
            value={form.brand ?? ""}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
          />
        </Field>
        <Field label="Cor">
          <Input
            type="color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            className="h-11 w-full"
          />
        </Field>
        <Field label="Limite total">
          <Input
            type="number"
            step="0.01"
            value={form.limit_total}
            onChange={(e) => setForm({ ...form, limit_total: Number(e.target.value) })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dia do fechamento">
            <Input
              type="number"
              min={1}
              max={31}
              value={form.closing_day}
              onChange={(e) => setForm({ ...form, closing_day: Number(e.target.value) })}
            />
          </Field>
          <Field label="Dia do vencimento">
            <Input
              type="number"
              min={1}
              max={31}
              value={form.due_day}
              onChange={(e) => setForm({ ...form, due_day: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="flex gap-2 pt-2">
          {existing ? (
            <Button
              variant="outline"
              className="h-12 flex-1 rounded-full text-destructive"
              onClick={async () => {
                await remove.mutateAsync(existing.id);
                onClose();
              }}
            >
              Excluir
            </Button>
          ) : null}
          <Button
            className="h-12 flex-1 rounded-full font-semibold"
            onClick={async () => {
              if (existing) {
                await update.mutateAsync({ id: existing.id, values: form });
              } else {
                await create.mutateAsync(form);
              }
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
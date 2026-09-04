import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, BellOff, BellRing, Check, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { BottomSheet, EmptyState, PageHeader, Panel } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  brl,
  buildCardInvoices,
  cardUsed,
  currentInvoice,
  monthLabel,
  num,
  pct,
  type Card,
  type CardInvoice,
} from "@/lib/finance";
import {
  alertsForInvoice,
  clearAlertsFor,
  dispatchAlerts,
  howToUnblock,
  notificationEnvironment,
  requestNotificationPermission,
  type InvoiceAlert,
  type NotifyEnv,
} from "@/lib/invoice-notifications";

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
  invoice_alerts_enabled: true,
};

const dayMonth = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

function CardsPage() {
  const { data: cards = [] } = useRows("cards");
  const { data: transactions = [] } = useRows("transactions");
  const { data: purchases = [] } = useRows("installment_purchases");
  const { data: payments = [] } = useRows("card_invoice_payments");
  const [editing, setEditing] = useState<Card | "new" | null>(null);

  const payInvoice = useCreate("card_invoice_payments", "Fatura marcada como paga");
  const unpayInvoice = useRemove("card_invoice_payments", "Pagamento desfeito");
  const updateCard = useUpdate("cards", "Cartão atualizado");

  const invoicesByCard = useMemo(
    () =>
      new Map(
        cards.map((card) => [card.id, buildCardInvoices(card, transactions, purchases, payments)]),
      ),
    [cards, transactions, purchases, payments],
  );

  const alerts = useMemo(() => {
    const list: InvoiceAlert[] = [];
    for (const card of cards) {
      if (!card.invoice_alerts_enabled) continue;
      for (const invoice of invoicesByCard.get(card.id) ?? []) {
        list.push(...alertsForInvoice(card.id, card.name, invoice));
      }
    }
    return list;
  }, [cards, invoicesByCard]);

  const [permission, setPermission] = useState<string>("default");
  useEffect(() => setPermission(notificationPermission()), []);
  useEffect(() => {
    if (alerts.length > 0) dispatchAlerts(alerts, permission === "granted");
  }, [alerts, permission]);

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

      {alerts.length > 0 ? (
        <div className="space-y-2 px-5">
          {alerts.map((a) => (
            <div
              key={a.id}
              className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div className="text-sm">
                <p className="font-medium">{a.title}</p>
                <p className="text-xs text-muted-foreground">{a.body}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {cards.length > 0 && permission !== "granted" && permission !== "unsupported" ? (
        <div className="px-5">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-2xl border border-border p-3 text-left text-sm"
            onClick={async () => {
              const result = await requestNotificationPermission();
              setPermission(result);
              if (result === "denied") toast.error("Notificações bloqueadas pelo navegador");
              if (result === "granted") toast.success("Avisos de fatura ativados");
            }}
          >
            <BellRing className="h-4 w-4 text-primary" />
            <span>
              Ativar avisos de vencimento
              <span className="block text-xs text-muted-foreground">
                Lembretes 5 dias antes, 1 dia antes e no dia.
              </span>
            </span>
          </button>
        </div>
      ) : null}

      {cards.length === 0 ? (
        <div className="px-5">
          <EmptyState title="Nenhum cartão" description="Cadastre seu Nubank para começar." />
        </div>
      ) : null}

      {cards.map((card) => {
        const invoices = invoicesByCard.get(card.id) ?? [];
        const focus = currentInvoice(invoices);
        const used = cardUsed(card.id, transactions, purchases, card, payments);
        const available = Math.max(0, num(card.limit_total) - used);
        const pending = invoices.filter((i) => !i.paid && i.amount > 0.005);
        const upcoming = invoices.filter((i) => !pending.includes(i)).slice(0, 6);

        const togglePaid = async (invoice: CardInvoice) => {
          const existing = payments.find(
            (p) => p.card_id === card.id && p.invoice_key === invoice.key,
          );
          if (existing) {
            await unpayInvoice.mutateAsync(existing.id);
            return;
          }
          await payInvoice.mutateAsync({
            card_id: card.id,
            invoice_key: invoice.key,
            due_date: `${invoice.key}-${String(invoice.dueDate.getDate()).padStart(2, "0")}`,
            amount: invoice.amount,
          });
          clearAlertsFor(card.id, invoice.key);
        };

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
                <p className="mt-6 text-xs opacity-80">
                  {focus ? (focus.overdue ? "Fatura vencida" : "Fatura em aberto") : "Fatura atual"}
                </p>
                <p className="text-3xl font-semibold tabular-nums">{brl(focus?.amount ?? 0)}</p>
                <p className="mt-2 text-xs opacity-80">
                  {focus
                    ? `Fecha ${dayMonth(focus.closingDate)} · Vence ${dayMonth(focus.dueDate)}`
                    : `Fecha dia ${card.closing_day} · Vence dia ${card.due_day}`}
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

              {pending.length > 0 ? (
                <div>
                  <p className="mb-2 text-sm font-medium">Faturas pendentes</p>
                  <ul className="space-y-2">
                    {pending.map((invoice) => (
                      <li
                        key={invoice.key}
                        className="flex items-center justify-between gap-3 rounded-xl bg-secondary/40 p-3"
                      >
                        <div className="text-sm">
                          <p className="font-medium capitalize">{monthLabel(invoice.key)}</p>
                          <p className="text-xs text-muted-foreground">
                            {invoice.overdue
                              ? `Venceu ${dayMonth(invoice.dueDate)}`
                              : `Vence ${dayMonth(invoice.dueDate)} · ${
                                  invoice.status === "fechada" ? "fechada" : "aberta"
                                }`}
                          </p>
                        </div>
                        <span className="tabular-nums">{brl(invoice.amount)}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => togglePaid(invoice)}
                        >
                          Pagar
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div>
                <p className="mb-2 text-sm font-medium">Próximas faturas</p>
                <ul className="space-y-1.5">
                  {upcoming.map((invoice) => (
                    <li key={invoice.key} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground capitalize">
                        {monthLabel(invoice.key)}
                        {invoice.paid ? (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs text-emerald-500">
                            <Check className="h-3 w-3" /> paga
                          </span>
                        ) : null}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums">{brl(invoice.amount)}</span>
                        {invoice.paid ? (
                          <button
                            type="button"
                            className="text-xs text-muted-foreground underline"
                            onClick={() => togglePaid(invoice)}
                          >
                            desfazer
                          </button>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                className="flex w-full items-center gap-2 text-sm text-muted-foreground"
                onClick={() =>
                  updateCard.mutate({
                    id: card.id,
                    values: { invoice_alerts_enabled: !card.invoice_alerts_enabled },
                  })
                }
              >
                {card.invoice_alerts_enabled ? (
                  <BellRing className="h-4 w-4 text-primary" />
                ) : (
                  <BellOff className="h-4 w-4" />
                )}
                {card.invoice_alerts_enabled
                  ? "Avisos de vencimento ativados"
                  : "Avisos de vencimento desativados"}
              </button>

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
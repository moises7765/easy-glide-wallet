import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, Check, Pencil, Plus, RotateCcw } from "lucide-react";
import { useState } from "react";
import { FixedExpenseSheet, FixedPaymentSheet } from "@/components/FixedExpenseSheets";
import { BottomSheet, EmptyState, PageHeader } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { brl, installmentLines, monthKey, toISODate } from "@/lib/finance";
import { detectRecurrences, dueSchedule, fixedSummary, fixedToday, frequencyLabel, isSettled, nextDueDate, STATUS_LABEL, suggestionToForm, valuesToForm, type DueItem, type FixedExpense, type FixedForm } from "@/lib/fixed-expenses";
import { useDismissRecurrence, useRows, useUnpayFixedExpense, useUpdate } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/gastos-fixos")({
  head: () => ({ meta: [
    { title: "Gastos fixos — Fluxo Finanças" },
    { name: "description", content: "Organize contas recorrentes, pagamentos e próximos vencimentos no Fluxo Finanças." },
    { property: "og:title", content: "Gastos fixos — Fluxo Finanças" },
    { property: "og:description", content: "Seus compromissos mensais e vencimentos, sem duplicar lançamentos." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: FixedExpensesPage,
});

function FixedExpensesPage() {
  const fixedQuery = useRows("fixed_expenses");
  const paymentQuery = useRows("fixed_expense_payments");
  const txQuery = useRows("transactions");
  const categoryQuery = useRows("categories");
  const dismissQuery = useRows("recurrence_dismissals");
  const { data: purchases = [] } = useRows("installment_purchases");
  const { data: invoicePayments = [] } = useRows("card_invoice_payments");
  const fixed = fixedQuery.data ?? [], payments = paymentQuery.data ?? [], transactions = txQuery.data ?? [], categories = categoryQuery.data ?? [];
  const today = fixedToday();
  const summary = fixedSummary(fixed, payments, transactions, today);
  const suggestions = detectRecurrences(transactions, fixed, new Set((dismissQuery.data ?? []).map((d) => d.signature)), today);
  const agenda = dueSchedule(fixed, payments, transactions, today, new Date(today.getFullYear(), today.getMonth(), today.getDate() - 45), new Date(today.getFullYear(), today.getMonth() + 2, 0));
  const installments = purchases.flatMap((p) => installmentLines(p, invoicePayments)).filter((l) => !l.paid && l.monthKey === monthKey(today)).reduce((s, l) => s + l.amount, 0);
  const [editing, setEditing] = useState<{ form: FixedForm; existing?: FixedExpense; signature?: string } | null>(null);
  const [paying, setPaying] = useState<DueItem | null>(null);
  const [undo, setUndo] = useState<DueItem | null>(null);
  const [view, setView] = useState("pending");
  const update = useUpdate("fixed_expenses");
  const dismiss = useDismissRecurrence();
  const unpay = useUnpayFixedExpense();
  const failed = [fixedQuery, paymentQuery, txQuery, categoryQuery, dismissQuery].some((q) => q.isError);
  const loading = [fixedQuery, paymentQuery, txQuery, categoryQuery, dismissQuery].some((q) => !q.data && !q.isError);
  const newForm: FixedForm = { name: "", amount: "", is_estimate: false, category_id: null, frequency: "monthly", interval_months: 1, due_day: today.getDate(), next_date: toISODate(today), payment_method: null, note: "" };
  return <div className="space-y-5">
    <PageHeader title="Gastos fixos" action={<Button size="icon" aria-label="Adicionar gasto fixo" title="Adicionar gasto fixo" onClick={() => setEditing({ form: newForm })}><Plus className="h-5 w-5" /></Button>} />
    {failed ? <div className="px-5 space-y-3"><p role="alert" className="text-sm text-destructive">Não foi possível carregar suas contas.</p><Button variant="outline" onClick={() => { void fixedQuery.refetch(); void paymentQuery.refetch(); void txQuery.refetch(); void categoryQuery.refetch(); void dismissQuery.refetch(); }}>Tentar novamente</Button></div> : loading ? <p role="status" className="px-5 text-sm text-muted-foreground">Carregando contas…</p> : <>
      <section className="px-5 space-y-3">
        <p className="text-xs uppercase text-muted-foreground">Comprometido por mês</p><p className="text-3xl font-semibold tabular-nums">{brl(summary.monthlyTotal)}</p>
        <p className="text-sm text-muted-foreground">{summary.activeCount} {summary.activeCount === 1 ? "conta ativa" : "contas ativas"}{summary.estimateCount ? ` · ${summary.estimateCount} com valor estimado` : ""}</p>
        <div className="grid grid-cols-2 border-y border-border py-3 gap-3"><div><p className="text-xs text-muted-foreground">Já coberto neste mês</p><p className="font-medium tabular-nums text-primary">{brl(summary.monthSettled)}</p></div><div><p className="text-xs text-muted-foreground">Falta neste mês</p><p className="font-medium tabular-nums">{brl(summary.monthRemaining)}</p></div></div>
        {summary.upcoming[0] && <p className="text-xs text-muted-foreground">Próximo: {summary.upcoming[0].fixed.name} · {summary.upcoming[0].date.toLocaleDateString("pt-BR")} · {brl(summary.upcoming[0].amount)}</p>}
        {summary.overdue.length > 0 && <p className="text-xs text-destructive">{summary.overdue.length} {summary.overdue.length === 1 ? "vencimento pendente" : "vencimentos pendentes"} em atraso</p>}
      </section>
      {fixed.length === 0 && <div className="px-5"><EmptyState title="Nenhum gasto fixo cadastrado" description="Suas contas recorrentes ficam aqui, separadas dos lançamentos." /></div>}
      {fixed.length > 0 && <section className="px-5"><h2 className="mb-2 text-sm font-semibold">Compromissos</h2><div className="divide-y divide-border">{fixed.map((f) => {
        const next = nextDueDate(f, today), category = categories.find((c) => c.id === f.category_id);
        return <article key={f.id} className="py-3 space-y-2"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><p className="font-medium break-words">{f.name}</p><p className="text-xs text-muted-foreground">{category?.name ?? "Sem categoria"} · {frequencyLabel(f)}</p></div><p className="shrink-0 text-sm font-semibold tabular-nums">{f.is_estimate ? "~" : ""}{brl(Number(f.amount))}</p><Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Editar ${f.name}`} title={`Editar ${f.name}`} onClick={() => setEditing({ form: valuesToForm(f, today), existing: f })}><Pencil className="h-4 w-4" /></Button></div><div className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{next ? `Próximo: ${next.toLocaleDateString("pt-BR")}` : "Pausado"}{f.is_estimate ? " · Estimativa" : ""}</p><Switch aria-label={`${f.active ? "Pausar" : "Reativar"} ${f.name}`} checked={f.active} disabled={update.isPending} onCheckedChange={(active) => update.mutate({ id: f.id, values: { active } })} /></div></article>;
      })}</div></section>}
      {fixed.length > 0 && <section className="px-5 space-y-3"><div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">Vencimentos</h2><div className="flex gap-1">{[{ id: "pending", text: "Pendentes" }, { id: "paid", text: "Quitados" }].map((v) => <Button key={v.id} size="sm" variant={view === v.id ? "secondary" : "ghost"} aria-pressed={view === v.id} onClick={() => setView(v.id)}>{v.text}</Button>)}</div></div>
        <div className="divide-y divide-border">{agenda.filter((i) => view === "paid" ? isSettled(i) : !isSettled(i)).map((i) => <article key={`${i.fixed.id}:${i.key}`} className="flex items-center gap-3 py-3"><CalendarClock className={`h-4 w-4 shrink-0 ${i.status === "vencida" ? "text-destructive" : "text-muted-foreground"}`} /><div className="min-w-0 flex-1"><p className="text-sm font-medium break-words">{i.fixed.name}</p><p className={`text-xs ${i.status === "vencida" ? "text-destructive" : "text-muted-foreground"}`}>{i.date.toLocaleDateString("pt-BR")} · {STATUS_LABEL[i.status]}</p></div><div className="shrink-0 text-right"><p className="text-sm tabular-nums">{i.fixed.is_estimate && !isSettled(i) ? "~" : ""}{brl(i.amount)}</p>{!isSettled(i) ? <Button size="sm" variant="ghost" className="h-8 text-primary" onClick={() => setPaying(i)}><Check className="mr-1 h-3 w-3" />Pagar</Button> : i.payment ? <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Desfazer pagamento ${i.fixed.name}`} title="Desfazer pagamento" onClick={() => setUndo(i)}><RotateCcw className="h-3 w-3" /></Button> : <Button size="sm" variant="ghost" className="h-8" onClick={() => setPaying(i)}>Vincular</Button>}</div></article>)}</div>
        {!agenda.some((i) => view === "paid" ? isSettled(i) : !isSettled(i)) && <p className="text-sm text-muted-foreground">{view === "paid" ? "Nenhum pagamento encontrado neste período." : "Nenhum vencimento pendente neste período."}</p>}
      </section>}
      {installments > 0 && <section className="px-5 border-t border-border pt-4"><h2 className="text-sm font-semibold">Parcelas de compras · à parte</h2><p className="mt-1 text-sm text-muted-foreground">{brl(installments)} neste mês · acompanhadas em Parcelamentos e nas faturas. Fora do total de gastos fixos.</p></section>}
      {suggestions.length > 0 && <section className="px-5 space-y-3"><h2 className="text-sm font-semibold">Possíveis recorrências</h2>{suggestions.map((s) => <article key={s.signature} className="surface p-3 space-y-2"><p className="text-sm font-medium break-words">{s.name}</p><p className="text-xs text-muted-foreground">~{brl(s.amount)} · {s.frequency === "monthly" ? "Mensal" : "Semanal"} · {s.occurrences} registros semelhantes</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => setEditing({ form: suggestionToForm(s), signature: s.signature })}><Plus className="mr-1 h-3 w-3" />Adicionar aos gastos fixos</Button><Button size="sm" variant="ghost" disabled={dismiss.isPending} onClick={() => dismiss.mutate(s.signature)}>Ignorar</Button></div></article>)}</section>}
    </>}
    {editing && <FixedExpenseSheet initial={editing.form} existing={editing.existing} signature={editing.signature} categories={categories} today={today} onClose={() => setEditing(null)} />}
    {paying && <FixedPaymentSheet item={paying} transactions={transactions} payments={payments} onClose={() => setPaying(null)} />}
    {undo?.payment && <BottomSheet open onOpenChange={(v) => !v && setUndo(null)} title="Desfazer pagamento"><p className="mb-4 text-sm">O status de pagamento de {undo.fixed.name} será removido. Nenhum lançamento será removido; se houver uma despesa correspondente, ela continuará identificada na agenda.</p><Button className="w-full" disabled={unpay.isPending} onClick={async () => { if (!undo.payment) return; try { await unpay.mutateAsync(undo.payment); setUndo(null); } catch { /* Toast da mutation */ } }}>Confirmar</Button></BottomSheet>}
  </div>;
}
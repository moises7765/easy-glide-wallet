import { useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Tables } from "@/integrations/supabase/types";
import { brl, parseDate, toISODate } from "@/lib/finance";
import { FREQUENCIES, formToValues, parseAmountInput, validateFixedForm, type DueItem, type FixedExpense, type FixedForm } from "@/lib/fixed-expenses";
import { useCreate, usePayFixedExpense, useRemove, useUpdate } from "@/lib/queries";

export function FixedSelect({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>;
}

export function FixedExpenseSheet({ initial, existing, signature, categories, today, onClose }: { initial: FixedForm; existing?: FixedExpense; signature?: string; categories: Tables<"categories">[]; today: Date; onClose: () => void }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const create = useCreate("fixed_expenses", "Gasto fixo adicionado");
  const update = useUpdate("fixed_expenses", "Gasto fixo atualizado");
  const remove = useRemove("fixed_expenses", "Gasto fixo excluído");
  const busy = create.isPending || update.isPending || remove.isPending;
  const set = <K extends keyof FixedForm>(key: K, value: FixedForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const save = async () => {
    const validation = validateFixedForm(form);
    setError(validation);
    if (validation) return;
    try {
      const values = formToValues(form, today, existing);
      if (existing) await update.mutateAsync({ id: existing.id, values });
      else await create.mutateAsync({ ...values, source_signature: signature ?? null });
      onClose();
    } catch { setError("Não foi possível salvar. Tente novamente."); }
  };
  return <BottomSheet open onOpenChange={(open) => !open && onClose()} title={existing ? "Editar gasto fixo" : "Novo gasto fixo"}>
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="space-y-1.5"><Label htmlFor="fixed-name">Nome</Label><Input id="fixed-name" value={form.name} maxLength={80} placeholder="Ex.: Aluguel" onChange={(e) => set("name", e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="fixed-amount">Valor (R$)</Label><Input id="fixed-amount" inputMode="decimal" value={form.amount} placeholder="0,00" onChange={(e) => set("amount", e.target.value)} /></div>
      <div className="flex items-center justify-between gap-3"><Label htmlFor="fixed-estimate">Valor variável / estimado</Label><Switch id="fixed-estimate" checked={form.is_estimate} onCheckedChange={(v) => set("is_estimate", v)} /></div>
      <FixedSelect id="fixed-category" label="Categoria" value={form.category_id ?? "none"} onChange={(v) => set("category_id", v === "none" ? null : v)} options={[{ value: "none", label: "Sem categoria" }, ...categories.filter((c) => c.kind === "expense").map((c) => ({ value: c.id, label: c.name }))]} />
      <FixedSelect id="fixed-frequency" label="Frequência" value={form.frequency} onChange={(v) => set("frequency", v as FixedForm["frequency"])} options={FREQUENCIES} />
      {form.frequency === "monthly" ? <div className="space-y-1.5"><Label htmlFor="fixed-day">Dia do vencimento</Label><Input id="fixed-day" type="number" inputMode="numeric" min={1} max={31} value={form.due_day} onChange={(e) => set("due_day", Number(e.target.value))} /></div> : <div className="space-y-1.5"><Label htmlFor="fixed-date">Próximo vencimento</Label><Input id="fixed-date" type="date" value={form.next_date} onChange={(e) => set("next_date", e.target.value)} /></div>}
      {form.frequency === "custom" && <div className="space-y-1.5"><Label htmlFor="fixed-interval">Intervalo em meses</Label><Input id="fixed-interval" type="number" inputMode="numeric" min={1} max={24} value={form.interval_months} onChange={(e) => set("interval_months", Number(e.target.value))} /></div>}
      <FixedSelect id="fixed-method" label="Forma de pagamento (opcional)" value={form.payment_method ?? "none"} onChange={(v) => set("payment_method", v === "none" ? null : v)} options={[{ value: "none", label: "Não informada" }, { value: "pix", label: "Pix" }, { value: "debit", label: "Débito" }, { value: "credit", label: "Cartão de crédito" }, { value: "cash", label: "Dinheiro" }, { value: "transfer", label: "Transferência / boleto" }]} />
      <div className="space-y-1.5"><Label htmlFor="fixed-note">Observações (opcional)</Label><Input id="fixed-note" value={form.note} maxLength={500} onChange={(e) => set("note", e.target.value)} /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {deleting ? <div className="space-y-3 border-t border-border pt-3"><p className="text-sm">Excluir este compromisso e seu histórico de pagamentos? Os lançamentos existentes serão mantidos.</p><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setDeleting(false)}>Cancelar</Button><Button type="button" variant="destructive" disabled={busy} onClick={async () => { if (!existing) return; try { await remove.mutateAsync(existing.id); onClose(); } catch { setError("Não foi possível excluir."); } }}>Confirmar exclusão</Button></div></div> : <div className="flex gap-2 pt-2">{existing && <Button type="button" variant="outline" size="icon" aria-label="Excluir gasto fixo" title="Excluir gasto fixo" disabled={busy} onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4" /></Button>}<Button type="submit" className="flex-1" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button></div>}
    </form>
  </BottomSheet>;
}

export function FixedPaymentSheet({ item, transactions, payments, onClose }: { item: DueItem; transactions: Tables<"transactions">[]; payments: Tables<"fixed_expense_payments">[]; onClose: () => void }) {
  const [amount, setAmount] = useState(String(item.amount).replace(".", ","));
  const [mode, setMode] = useState("status");
  const [txId, setTxId] = useState("none");
  const [error, setError] = useState<string | null>(null);
  const pay = usePayFixedExpense();
  const linked = new Set(payments.map((p) => p.transaction_id));
  const candidates = transactions.filter((t) => t.type === "expense" && !t.invoice_payment_id && !linked.has(t.id) && Math.abs(parseDate(t.date).getTime() - item.date.getTime()) <= 45 * 86400000);
  const selected = candidates.find((t) => t.id === txId);
  return <BottomSheet open onOpenChange={(v) => !v && onClose()} title={`Pagamento · ${item.fixed.name}`}>
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      const value = mode === "link" && selected ? Number(selected.amount) : parseAmountInput(amount);
      if (!(value > 0)) { setError("Informe o valor pago."); return; }
      if (mode === "link" && !selected) { setError("Escolha o lançamento já registrado."); return; }
      try { await pay.mutateAsync({ fixedExpenseId: item.fixed.id, periodKey: item.key, dueDate: toISODate(item.date), amount: value, mode: mode === "link" ? "link" : "status", transactionId: selected?.id }); onClose(); } catch { setError("Não foi possível registrar o pagamento. Tente novamente."); }
    }}>
      <p className="text-sm text-muted-foreground">Vencimento {item.date.toLocaleDateString("pt-BR")}. Nenhuma nova despesa será criada.</p>
      <FixedSelect id="fixed-payment-mode" label="Registrar pagamento" value={mode} onChange={setMode} options={[{ value: "status", label: "Apenas marcar como paga" }, { value: "link", label: "Vincular lançamento existente" }]} />
      {mode === "link" ? <FixedSelect id="fixed-payment-tx" label="Lançamento" value={txId} onChange={setTxId} options={[{ value: "none", label: "Selecione" }, ...candidates.map((t) => ({ value: t.id, label: `${parseDate(t.date).toLocaleDateString("pt-BR")} · ${t.description || "Despesa"} · ${brl(Number(t.amount))}` }))]} /> : <div className="space-y-1.5"><Label htmlFor="fixed-paid-amount">Valor pago (R$)</Label><Input id="fixed-paid-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" disabled={pay.isPending} type="submit"><Check className="mr-2 h-4 w-4" />{pay.isPending ? "Registrando…" : "Confirmar pagamento"}</Button>
    </form>
  </BottomSheet>;
}
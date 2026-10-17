import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { BottomSheet } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { brl, monthLabel, type Transaction } from "@/lib/finance";
import { savingsForMonth, savingsHistory, savingsMonthKey, savingsPercent } from "@/lib/savings";
import { cn } from "@/lib/utils";

export function SavingsRate({ transactions, loading, error }: {
  transactions: Transaction[]; loading: boolean; error: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const current = savingsMonthKey();
  const month = useMemo(() => savingsForMonth(transactions, current), [transactions, current]);
  const history = useMemo(() => savingsHistory(transactions, current), [transactions, current]);
  const status = error ? "Dados indisponíveis" : loading ? "Carregando…" : !month.hasData ? "Sem lançamentos no mês" : month.rate === null ? "Sem receita no mês" : null;

  return (
    <>
      <div className="surface fade-up min-w-0 p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase">Taxa de Poupança</p>
        <p className={cn("mt-2 text-xl font-semibold tabular-nums", month.rate !== null && !status && (month.rate < 0 ? "text-destructive" : "text-primary"))}>
          {loading ? "…" : error ? "—" : savingsPercent(month.rate)}
        </p>
        {status ? <p className="mt-1 text-xs text-muted-foreground">{status}</p> : null}
        <Button variant="link" size="sm" className="mt-1 h-6 px-0" disabled={loading || error} onClick={() => { setHistoryOpen(false); setOpen(true); }}>
          Ver detalhes <ArrowRight className="size-3" />
        </Button>
      </div>
      <BottomSheet open={open} onOpenChange={setOpen} title={historyOpen ? "Histórico da Taxa de Poupança" : "Taxa de Poupança"}>
        <div className="mx-auto w-full max-w-2xl">
          <div className="flex items-center justify-between gap-2">
            {historyOpen ? <Button variant="ghost" size="sm" className="px-0" onClick={() => setHistoryOpen(false)}><ArrowLeft /> Voltar</Button> : <p className="text-sm capitalize text-muted-foreground">{new Date(`${current}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</p>}
            <Button variant="ghost" size="icon-sm" aria-label="Fechar detalhes" onClick={() => setOpen(false)}><X /></Button>
          </div>
          {historyOpen ? (
            <>
              <p className="mt-2 text-xs text-muted-foreground">Últimos 12 meses · mês atual em andamento</p>
              <div className="mt-4 h-48 w-full" aria-label="Gráfico da taxa de poupança dos últimos 12 meses">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                    <XAxis dataKey="key" tickFormatter={monthLabel} tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }} minTickGap={24} axisLine={false} tickLine={false} />
                    <YAxis width={48} tickFormatter={(v: number) => savingsPercent(v)} tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip labelFormatter={(label) => monthLabel(String(label))} formatter={(v: number) => [savingsPercent(v), "Taxa de poupança"]} contentStyle={{ background: "var(--color-popover)", color: "var(--color-foreground)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                    <Line type="linear" dataKey="rate" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {!history.some((row) => row.rate !== null) ? <p className="my-3 text-sm text-muted-foreground">Ainda não há receitas registradas para calcular a evolução.</p> : null}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs tabular-nums">
                  <caption className="sr-only">Receita, despesas, valor poupado e taxa de cada mês</caption>
                  <thead className="text-muted-foreground"><tr>{["Mês", "Receita", "Despesas", "Poupado", "Taxa"].map((label) => <th key={label} className="whitespace-nowrap border-b border-border px-2 py-3 font-medium first:pl-0">{label}</th>)}</tr></thead>
                  <tbody>{history.map((row) => <tr key={row.key} className="border-b border-border">
                    <th className="whitespace-nowrap py-3 pr-2 font-medium">{monthLabel(row.key)}</th>
                    <td className="whitespace-nowrap px-2 py-3">{row.hasData ? brl(row.income) : "—"}</td>
                    <td className="whitespace-nowrap px-2 py-3">{row.hasData ? brl(row.expenses) : "—"}</td>
                    <td className={cn("whitespace-nowrap px-2 py-3", row.saved < 0 && "text-destructive")}>{row.hasData ? brl(row.saved) : "—"}</td>
                    <td className={cn("whitespace-nowrap px-2 py-3", row.rate !== null && (row.rate < 0 ? "text-destructive" : "text-primary"))}>{savingsPercent(row.rate)}</td>
                  </tr>)}</tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">— indica mês sem lançamentos ou taxa não calculável por falta de receita.</p>
            </>
          ) : (
            <>
              <p className={cn("mt-4 text-3xl font-semibold tabular-nums", month.rate !== null && (month.rate < 0 ? "text-destructive" : "text-primary"))}>{savingsPercent(month.rate)}</p>
              {status ? <p className="mt-2 text-sm text-muted-foreground">{status}. {month.rate === null ? "A taxa precisa de receita maior que zero." : ""}</p> : null}
              <dl className="mt-4 divide-y divide-border text-sm">
                {[["Receita", month.income], ["Despesas de consumo", month.expenses], ["Valor poupado", month.saved]].map(([label, amount]) => <div key={String(label)} className="flex items-center justify-between gap-3 py-3"><dt className="text-muted-foreground">{label}</dt><dd className={cn("font-semibold tabular-nums", Number(amount) < 0 && "text-destructive")}>{month.hasData ? brl(Number(amount)) : "—"}</dd></div>)}
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">(Receita − despesas de consumo) ÷ receita × 100 · pagamentos de fatura não contam (as compras do cartão já contaram) · mês em andamento</p>
              <Button variant="link" className="mt-4 px-0" onClick={() => setHistoryOpen(true)}>Ver histórico completo <ArrowRight /></Button>
            </>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
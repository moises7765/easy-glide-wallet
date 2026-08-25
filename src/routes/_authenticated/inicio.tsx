import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { PageHeader, Panel, ProgressBar, StatCard } from "@/components/finance-ui";
import {
  brl,
  brlShort,
  cardInvoice,
  monthKey,
  monthLabel,
  nextMonthKeys,
  num,
  pct,
  remainingOf,
  addMonths,
} from "@/lib/finance";
import { useEmergencyFund, useRows } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/inicio")({
  head: () => ({
    meta: [
      { title: "Início — Fluxo Finanças" },
      { name: "description", content: "Painel com saldo, gastos do mês, patrimônio e metas." },
      { property: "og:title", content: "Início — Fluxo Finanças" },
      { property: "og:description", content: "Painel com saldo, gastos do mês, patrimônio e metas." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: transactions = [] } = useRows("transactions");
  const { data: categories = [] } = useRows("categories");
  const { data: cards = [] } = useRows("cards");
  const { data: purchases = [] } = useRows("installment_purchases");
  const { data: assets = [] } = useRows("assets");
  const { data: goals = [] } = useRows("goals");
  const { data: fund } = useEmergencyFund();

  const current = monthKey(new Date());

  const stats = useMemo(() => {
    const income = transactions
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + num(t.amount), 0);
    const expense = transactions
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + num(t.amount), 0);
    const monthIn = transactions
      .filter((t) => t.type === "income" && monthKey(t.date) === current)
      .reduce((s, t) => s + num(t.amount), 0);
    const monthOut = transactions
      .filter((t) => t.type === "expense" && monthKey(t.date) === current)
      .reduce((s, t) => s + num(t.amount), 0);
    const netWorth = assets.reduce((s, a) => s + num(a.value), 0);
    const committed = purchases.reduce((s, p) => s + remainingOf(p).total, 0);
    return { balance: income - expense, monthIn, monthOut, netWorth, committed };
  }, [transactions, assets, purchases, current]);

  const byCategory = useMemo(() => {
    const map = new Map<string, { name: string; color: string; value: number }>();
    transactions
      .filter((t) => t.type === "expense" && monthKey(t.date) === current)
      .forEach((t) => {
        const cat = categories.find((c) => c.id === t.category_id);
        const key = cat?.id ?? "none";
        const entry = map.get(key) ?? {
          name: cat?.name ?? "Sem categoria",
          color: cat?.color ?? "#64748B",
          value: 0,
        };
        entry.value += num(t.amount);
        map.set(key, entry);
      });
    return [...map.values()].sort((a, b) => b.value - a.value);
  }, [transactions, categories, current]);

  const flow = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const key = monthKey(addMonths(new Date(), i - 11));
      const entrada = transactions

        .filter((t) => t.type === "income" && monthKey(t.date) === key)
        .reduce((s, t) => s + num(t.amount), 0);
      const saida = transactions
        .filter((t) => t.type === "expense" && monthKey(t.date) === key)
        .reduce((s, t) => s + num(t.amount), 0);
      return { mes: monthLabel(key), entrada, saida, saldo: entrada - saida };
    });
  }, [transactions]);

  const fundPct = pct(num(fund?.current_amount), num(fund?.target_amount));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Início"
        subtitle={new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
      />

      <div className="px-5">
        <Panel className="bg-gradient-to-br from-primary/15 to-transparent">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">Saldo total</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">
            {brl(stats.balance)}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Entrou</p>
              <p className="font-semibold text-primary tabular-nums">{brl(stats.monthIn)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Saiu</p>
              <p className="font-semibold text-destructive tabular-nums">{brl(stats.monthOut)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sobrou</p>
              <p className="font-semibold tabular-nums">{brl(stats.monthIn - stats.monthOut)}</p>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5">
        <StatCard label="Patrimônio" value={brl(stats.netWorth)} />
        <StatCard
          label="Comprometido"
          value={brl(stats.committed)}
          tone="negative"
          hint="parcelas a pagar"
        />
      </div>

      <div className="px-5">
        <Panel>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Fluxo dos últimos 6 meses</p>
            <span className="text-xs text-muted-foreground">entradas x saídas</span>
          </div>
          <div className="mt-3 h-36">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={flow} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-destructive)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--color-destructive)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => brl(v)}
                />
                <Area
                  type="monotone"
                  dataKey="entrada"
                  stroke="var(--color-primary)"
                  fill="url(#gIn)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="saida"
                  stroke="var(--color-destructive)"
                  fill="url(#gOut)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            {flow.map((f) => (
              <span key={f.mes}>{f.mes}</span>
            ))}
          </div>
        </Panel>
      </div>

      {byCategory.length > 0 ? (
        <div className="px-5">
          <Panel>
            <p className="text-sm font-medium">Gastos do mês</p>
            <div className="mt-2 flex items-center gap-4">
              <div className="h-32 w-32 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byCategory}
                      dataKey="value"
                      innerRadius={38}
                      outerRadius={60}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {byCategory.map((c) => (
                        <Cell key={c.name} fill={c.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-popover)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                      formatter={(v: number) => brl(v)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 space-y-1.5">
                {byCategory.slice(0, 5).map((c) => (
                  <li key={c.name} className="flex items-center gap-2 text-sm">
                    <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                    <span className="flex-1 truncate text-muted-foreground">{c.name}</span>
                    <span className="tabular-nums">{brlShort(c.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        </div>
      ) : null}

      <div className="px-5">
        <Panel>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Reserva de emergência</p>
            <Link to="/reserva" className="text-xs text-primary">
              Editar
            </Link>
          </div>
          <ProgressBar current={num(fund?.current_amount)} target={num(fund?.target_amount)} />
          <p className="mt-2 text-xs text-muted-foreground">
            {fundPct >= 100 ? "Meta alcançada" : `Faltam ${brl(num(fund?.target_amount) - num(fund?.current_amount))}`}
          </p>
        </Panel>
      </div>

      {cards.length > 0 ? (
        <div className="px-5">
          <Panel>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Cartões</p>
              <Link to="/cartoes" className="text-xs text-primary">
                Ver todos
              </Link>
            </div>
            <ul className="mt-3 space-y-3">
              {cards.map((card) => {
                const invoice = cardInvoice(card.id, current, transactions, purchases);
                const future = nextMonthKeys(3, addMonths(new Date(), 1)).reduce(
                  (s, k) => s + cardInvoice(card.id, k, transactions, purchases),
                  0,
                );
                return (
                  <li key={card.id} className="flex items-center gap-3">
                    <span className="h-8 w-8 rounded-lg" style={{ background: card.color }} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{card.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Próximas 3 faturas {brl(future)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums">{brl(invoice)}</p>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      ) : null}

      {goals.length > 0 ? (
        <div className="px-5">
          <Panel>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Metas</p>
              <Link to="/metas" className="text-xs text-primary">
                Ver todas
              </Link>
            </div>
            <ul className="mt-2 space-y-4">
              {goals.slice(0, 3).map((g) => (
                <li key={g.id}>
                  <p className="text-sm">{g.name}</p>
                  <ProgressBar current={num(g.current_amount)} target={num(g.target_amount)} />
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { PageHeader, Panel, ProgressBar } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brl, num } from "@/lib/finance";
import { useEmergencyFund, useMonthTransactions, useUpdate } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/reserva")({
  head: () => ({
    meta: [
      { title: "Reserva de emergência — Fluxo Finanças" },
      { name: "description", content: "Acompanhe quantos meses de segurança sua reserva cobre." },
      { property: "og:title", content: "Reserva de emergência — Fluxo Finanças" },
      {
        property: "og:description",
        content: "Acompanhe quantos meses de segurança sua reserva cobre.",
      },
    ],
  }),
  component: EmergencyPage,
});

function EmergencyPage() {
  const { data: fund } = useEmergencyFund();
  const { expense } = useMonthTransactions();
  const update = useUpdate("emergency_fund", "Reserva atualizada");

  const current = num(fund?.current_amount);
  const monthly = num(fund?.monthly_cost) || expense;
  const months = num(fund?.target_months) || 6;
  const target = monthly * months;
  const covered = monthly > 0 ? current / monthly : 0;

  const [amount, setAmount] = useState<string>("");

  async function addAmount(delta: number) {
    if (!fund) return;
    await update.mutateAsync({
      id: fund.id,
      values: { current_amount: Math.max(0, current + delta) },
    });
    setAmount("");
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Reserva de emergência" subtitle={`${covered.toFixed(1)} meses cobertos`} />

      <div className="space-y-4 px-5">
        <Panel>
          <p className="text-sm text-muted-foreground">Guardado</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{brl(current)}</p>
          <ProgressBar current={current} target={target} />
          <p className="mt-2 text-xs text-muted-foreground">
            Meta de {brl(target)} ({months} meses de {brl(monthly)})
          </p>
        </Panel>

        <Panel>
          <p className="text-sm font-medium">Movimentar reserva</p>
          <Input
            className="mt-3 h-12"
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              className="h-11 flex-1 rounded-full"
              disabled={!amount}
              onClick={() => addAmount(-Number(amount))}
            >
              Retirar
            </Button>
            <Button
              className="h-11 flex-1 rounded-full font-semibold"
              disabled={!amount}
              onClick={() => addAmount(Number(amount))}
            >
              Depositar
            </Button>
          </div>
        </Panel>

        <Panel>
          <p className="text-sm font-medium">Configuração da meta</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Custo mensal</Label>
              <Input
                className="mt-1"
                type="number"
                step="0.01"
                defaultValue={monthly}
                onBlur={(e) =>
                  fund &&
                  update.mutate({ id: fund.id, values: { monthly_cost: Number(e.target.value) } })
                }
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Meses de meta</Label>
              <Input
                className="mt-1"
                type="number"
                min={1}
                defaultValue={months}
                onBlur={(e) =>
                  fund &&
                  update.mutate({ id: fund.id, values: { target_months: Number(e.target.value) } })
                }
              />
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { PageHeader, Panel, ProgressBar } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brl, num } from "@/lib/finance";
import { useEmergencyFund, useSaveFund } from "@/lib/queries";

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
  const save = useSaveFund();
  const [amount, setAmount] = useState("");

  const current = num(fund?.current_amount);
  const monthlyExpense = num(fund?.monthly_expense);
  const monthsTarget = num(fund?.months_target) || 6;
  const target = num(fund?.target_amount) || monthlyExpense * monthsTarget;
  const covered = monthlyExpense > 0 ? current / monthlyExpense : 0;

  function persist(values: Partial<{
    current_amount: number;
    target_amount: number;
    months_target: number;
    monthly_expense: number;
  }>) {
    const next = {
      current_amount: current,
      target_amount: target,
      months_target: monthsTarget,
      monthly_expense: monthlyExpense,
      ...values,
    };
    if (values.months_target !== undefined || values.monthly_expense !== undefined) {
      next.target_amount = next.months_target * next.monthly_expense;
    }
    save.mutate(next);
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
            Meta de {brl(target)} ({monthsTarget} meses de {brl(monthlyExpense)})
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
              onClick={() => {
                persist({ current_amount: Math.max(0, current - Number(amount)) });
                setAmount("");
              }}
            >
              Retirar
            </Button>
            <Button
              className="h-11 flex-1 rounded-full font-semibold"
              disabled={!amount}
              onClick={() => {
                persist({ current_amount: current + Number(amount) });
                setAmount("");
              }}
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
                defaultValue={monthlyExpense}
                onBlur={(e) => persist({ monthly_expense: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Meses de meta</Label>
              <Input
                className="mt-1"
                type="number"
                min={1}
                defaultValue={monthsTarget}
                onBlur={(e) => persist({ months_target: Number(e.target.value) })}
              />
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

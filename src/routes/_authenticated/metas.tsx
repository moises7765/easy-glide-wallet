import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";

import { BottomSheet, EmptyState, PageHeader, Panel, ProgressBar } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brl, num, parseDate, type Goal } from "@/lib/finance";
import { useCreate, useRemove, useRows, useUpdate } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/metas")({
  head: () => ({
    meta: [
      { title: "Metas — Fluxo Finanças" },
      { name: "description", content: "Acompanhe o progresso das suas metas financeiras." },
      { property: "og:title", content: "Metas — Fluxo Finanças" },
      { property: "og:description", content: "Acompanhe o progresso das suas metas financeiras." },
    ],
  }),
  component: GoalsPage,
});

type GoalForm = { name: string; target_amount: number; current_amount: number; deadline: string | null };
const EMPTY: GoalForm = { name: "", target_amount: 0, current_amount: 0, deadline: null };

function GoalsPage() {
  const { data: goals = [] } = useRows("goals");
  const [editing, setEditing] = useState<Goal | "new" | null>(null);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Metas"
        subtitle={`${goals.length} metas ativas`}
        action={
          <Button size="sm" className="rounded-full" onClick={() => setEditing("new")}>
            <Plus className="mr-1 h-4 w-4" /> Meta
          </Button>
        }
      />

      {goals.length === 0 ? (
        <div className="px-5">
          <EmptyState title="Sem metas ainda" description="Crie sua primeira meta financeira." />
        </div>
      ) : null}

      <div className="space-y-3 px-5">
        {goals.map((g) => {
          const missing = Math.max(0, num(g.target_amount) - num(g.current_amount));
          return (
            <Panel key={g.id}>
              <button type="button" className="w-full text-left" onClick={() => setEditing(g)}>
                <div className="flex items-start justify-between">
                  <p className="font-medium">{g.name}</p>
                  {g.deadline ? (
                    <span className="text-xs text-muted-foreground">
                      {parseDate(g.deadline).toLocaleDateString("pt-BR", {
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  ) : null}
                </div>
                <ProgressBar current={num(g.current_amount)} target={num(g.target_amount)} />
                <p className="mt-2 text-xs text-muted-foreground">Faltam {brl(missing)}</p>
              </button>
            </Panel>
          );
        })}
      </div>

      <GoalSheet goal={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function GoalSheet({ goal, onClose }: { goal: Goal | "new" | null; onClose: () => void }) {
  const create = useCreate("goals", "Meta criada");
  const update = useUpdate("goals", "Meta atualizada");
  const remove = useRemove("goals", "Meta excluída");
  const existing = goal && goal !== "new" ? goal : null;
  const source: GoalForm = existing
    ? {
        name: existing.name,
        target_amount: num(existing.target_amount),
        current_amount: num(existing.current_amount),
        deadline: existing.deadline,
      }
    : EMPTY;
  const [form, setForm] = useState<GoalForm>(source);
  const key = existing ? existing.id : "new";
  const [loadedKey, setLoadedKey] = useState(key);
  if (goal && loadedKey !== key) {
    setLoadedKey(key);
    setForm(source);
  }
  if (!goal) return null;

  return (
    <BottomSheet open onOpenChange={(v) => !v && onClose()} title={existing ? "Editar meta" : "Nova meta"}>
      <div className="space-y-4">
        <div>
          <Label className="text-xs text-muted-foreground">Nome</Label>
          <Input
            className="mt-1"
            value={form.name}
            placeholder="Ex: Comprar uma moto"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Objetivo</Label>
            <Input
              className="mt-1"
              type="number"
              step="0.01"
              value={form.target_amount}
              onChange={(e) => setForm({ ...form, target_amount: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Acumulado</Label>
            <Input
              className="mt-1"
              type="number"
              step="0.01"
              value={form.current_amount}
              onChange={(e) => setForm({ ...form, current_amount: Number(e.target.value) })}
            />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Prazo</Label>
          <Input
            className="mt-1"
            type="date"
            value={form.deadline ?? ""}
            onChange={(e) => setForm({ ...form, deadline: e.target.value || null })}
          />
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
              if (existing) await update.mutateAsync({ id: existing.id, values: form });
              else await create.mutateAsync(form);
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
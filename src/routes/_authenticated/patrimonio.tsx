import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { BottomSheet, EmptyState, PageHeader, Panel, Row } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ASSET_KINDS, brl, monthLabel, monthKey, num, toISODate, type Asset } from "@/lib/finance";
import { useCreate, useRemove, useRows, useUpdate } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/patrimonio")({
  head: () => ({
    meta: [
      { title: "Patrimônio — Fluxo Finanças" },
      { name: "description", content: "Cadastre bens e acompanhe a evolução do seu patrimônio." },
      { property: "og:title", content: "Patrimônio — Fluxo Finanças" },
      { property: "og:description", content: "Cadastre bens e acompanhe a evolução do seu patrimônio." },
    ],
  }),
  component: NetWorthPage,
});

type AssetForm = { name: string; kind: string; value: number };
const EMPTY: AssetForm = { name: "", kind: "bank", value: 0 };

function NetWorthPage() {
  const { data: assets = [] } = useRows("assets");
  const { data: snapshots = [] } = useRows("net_worth_snapshots");
  const [editing, setEditing] = useState<Asset | "new" | null>(null);

  const total = assets.reduce((s, a) => s + num(a.value), 0);

  // Registra automaticamente o valor do dia para gerar o histórico.
  useEffect(() => {
    if (assets.length === 0) return;
    const today = toISODate(new Date());
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase
        .from("net_worth_snapshots")
        .upsert({ user_id: data.user.id, date: today, total }, { onConflict: "user_id,date" })
        .then(() => undefined);
    });
  }, [total, assets.length]);

  const chart = useMemo(
    () =>
      snapshots.map((s) => ({
        label: monthLabel(monthKey(s.date)),
        total: num(s.total),
      })),
    [snapshots],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Patrimônio"
        subtitle={brl(total)}
        action={
          <Button size="sm" className="rounded-full" onClick={() => setEditing("new")}>
            <Plus className="mr-1 h-4 w-4" /> Bem
          </Button>
        }
      />

      {chart.length > 1 ? (
        <div className="px-5">
          <Panel>
            <p className="text-sm font-medium">Evolução</p>
            <div className="mt-3 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart}>
                  <defs>
                    <linearGradient id="gNet" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
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
                    dataKey="total"
                    stroke="var(--color-primary)"
                    fill="url(#gNet)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      ) : null}

      <div className="px-5">
        {assets.length === 0 ? (
          <EmptyState title="Nenhum bem cadastrado" description="Adicione contas, investimentos e bens." />
        ) : (
          <Panel className="divide-y divide-border p-0">
            {assets.map((a) => (
              <Row
                key={a.id}
                title={a.name}
                subtitle={ASSET_KINDS.find((k) => k.value === a.kind)?.label ?? a.kind}
                right={brl(num(a.value))}
                onClick={() => setEditing(a)}
              />
            ))}
          </Panel>
        )}
      </div>

      <AssetSheet asset={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function AssetSheet({ asset, onClose }: { asset: Asset | "new" | null; onClose: () => void }) {
  const create = useCreate("assets", "Bem adicionado");
  const update = useUpdate("assets", "Bem atualizado");
  const remove = useRemove("assets", "Bem excluído");
  const existing = asset && asset !== "new" ? asset : null;
  const source: AssetForm = existing
    ? { name: existing.name, kind: existing.kind, value: num(existing.value) }
    : EMPTY;
  const [form, setForm] = useState<AssetForm>(source);
  const key = existing ? existing.id : "new";
  const [loadedKey, setLoadedKey] = useState(key);
  if (asset && loadedKey !== key) {
    setLoadedKey(key);
    setForm(source);
  }
  if (!asset) return null;

  return (
    <BottomSheet open onOpenChange={(v) => !v && onClose()} title={existing ? "Editar bem" : "Novo bem"}>
      <div className="space-y-4">
        <div>
          <Label className="text-xs text-muted-foreground">Nome</Label>
          <Input
            className="mt-1"
            value={form.name}
            placeholder="Ex: Conta Nubank"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Tipo</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {ASSET_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setForm({ ...form, kind: k.value })}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm",
                  form.kind === k.value
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Valor</Label>
          <Input
            className="mt-1"
            type="number"
            step="0.01"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
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
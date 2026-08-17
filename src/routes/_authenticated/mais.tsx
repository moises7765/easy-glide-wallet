import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, CreditCard, LogOut, PiggyBank, Target, Wallet } from "lucide-react";

import { PageHeader, Panel } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { brl, num } from "@/lib/finance";
import { useEmergencyFund, useRows, useUser } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/mais")({
  head: () => ({
    meta: [
      { title: "Mais — Fluxo Finanças" },
      { name: "description", content: "Patrimônio, reserva, parcelamentos e conta." },
      { property: "og:title", content: "Mais — Fluxo Finanças" },
      { property: "og:description", content: "Patrimônio, reserva, parcelamentos e conta." },
    ],
  }),
  component: MorePage,
});

function MorePage() {
  const { data: user } = useUser();
  const { data: assets = [] } = useRows("assets");
  const { data: purchases = [] } = useRows("installment_purchases");
  const { data: fund } = useEmergencyFund();

  const netWorth = assets.reduce((s, a) => s + num(a.value), 0);

  const items = [
    {
      to: "/patrimonio" as const,
      icon: Wallet,
      label: "Patrimônio",
      value: brl(netWorth),
    },
    {
      to: "/reserva" as const,
      icon: PiggyBank,
      label: "Reserva de emergência",
      value: brl(num(fund?.current_amount)),
    },
    {
      to: "/parcelamentos" as const,
      icon: CreditCard,
      label: "Parcelamentos",
      value: `${purchases.length}`,
    },
    { to: "/metas" as const, icon: Target, label: "Metas", value: "" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Mais" subtitle={user?.email ?? ""} />

      <div className="space-y-4 px-5">
        <Panel className="divide-y divide-border p-0">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 px-4 py-4 transition-colors active:bg-secondary/60"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary">
                <item.icon className="h-4 w-4 text-primary" />
              </span>
              <span className="flex-1 text-sm font-medium">{item.label}</span>
              <span className="text-sm tabular-nums text-muted-foreground">{item.value}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </Panel>

        <Button
          variant="outline"
          className="h-12 w-full rounded-full text-destructive"
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/auth";
          }}
        >
          <LogOut className="mr-2 h-4 w-4" /> Sair da conta
        </Button>
      </div>
    </div>
  );
}
import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { CreditCard, Home, LayoutGrid, Plus, Receipt, Target } from "lucide-react";
import { useState } from "react";

import { QuickAdd } from "@/components/QuickAdd";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppLayout,
});

const TABS = [
  { to: "/inicio", label: "Início", icon: Home },
  { to: "/lancamentos", label: "Lançamentos", icon: Receipt },
  { to: "/cartoes", label: "Cartões", icon: CreditCard },
  { to: "/metas", label: "Metas", icon: Target },
  { to: "/mais", label: "Mais", icon: LayoutGrid },
] as const;

function AppLayout() {
  const [quickOpen, setQuickOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="mx-auto min-h-screen w-full max-w-md pb-32">
      <Outlet />

      <button
        type="button"
        onClick={() => setQuickOpen(true)}
        aria-label="Novo lançamento"
        className="fixed bottom-24 left-1/2 z-40 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_30px_-8px_rgba(0,0,0,0.8)] transition-transform active:scale-95"
      >
        <Plus className="h-7 w-7" />
      </button>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md items-center justify-between px-3 pt-2 pb-6">
          {TABS.map((tab) => {
            const active = pathname.startsWith(tab.to);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-1 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <QuickAdd open={quickOpen} onOpenChange={setQuickOpen} />
    </div>
  );
}
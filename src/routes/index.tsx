import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fluxo — Controle Financeiro Pessoal" },
      {
        name: "description",
        content: "Organize gastos, receitas, cartões, patrimônio e metas em um só lugar.",
      },
      { property: "og:title", content: "Fluxo — Controle Financeiro Pessoal" },
      {
        property: "og:description",
        content: "Organize gastos, receitas, cartões, patrimônio e metas em um só lugar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IndexRedirect,
});

function IndexRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    void import("@/integrations/supabase/client").then(async ({ supabase }) => {
      const { data } = await supabase.auth.getUser();
      if (active) {
        await navigate({ to: data.user ? "/inicio" : "/auth", replace: true });
      }
    });

    return () => {
      active = false;
    };
  }, [navigate]);

  return <main className="min-h-screen bg-background" aria-label="Carregando" />;
}

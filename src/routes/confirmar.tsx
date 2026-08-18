import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/confirmar")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Confirmando e-mail — Fluxo Finanças" },
      { name: "description", content: "Confirmação do seu e-mail no Fluxo Finanças." },
      { property: "og:title", content: "Confirmando e-mail — Fluxo Finanças" },
      { property: "og:description", content: "Confirmação do seu e-mail no Fluxo Finanças." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConfirmPage,
});

function ConfirmPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Confirmando seu e-mail...");

  useEffect(() => {
    let active = true;

    async function run() {
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get("token_hash");
      const type = params.get("type");

      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: (type as "signup") ?? "signup",
        });
        if (error && active) {
          setMessage("Link inválido ou expirado. Peça um novo e-mail de confirmação.");
          setTimeout(() => navigate({ to: "/auth" }), 2500);
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session) {
        navigate({ to: "/inicio" });
      } else {
        setMessage("E-mail confirmado. Faça login para continuar.");
        setTimeout(() => navigate({ to: "/auth" }), 1800);
      }
    }

    void run();
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <p className="text-sm text-muted-foreground">{message}</p>
    </main>
  );
}

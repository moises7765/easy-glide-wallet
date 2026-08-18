import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/redefinir-senha")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Redefinir senha — Fluxo Finanças" },
      { name: "description", content: "Defina uma nova senha para sua conta no Fluxo Finanças." },
      { property: "og:title", content: "Redefinir senha — Fluxo Finanças" },
      {
        property: "og:description",
        content: "Defina uma nova senha para sua conta no Fluxo Finanças.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Validando link de recuperação...");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function run() {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const tokenHash = url.searchParams.get("token_hash");
      const code = url.searchParams.get("code");

      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
        if (error) {
          if (active) setStatus("Link inválido ou expirado. Peça uma nova recuperação de senha.");
          return;
        }
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          if (active) setStatus("Link inválido ou expirado. Peça uma nova recuperação de senha.");
          return;
        }
      } else if (hash.get("access_token") && hash.get("refresh_token")) {
        const { error } = await supabase.auth.setSession({
          access_token: hash.get("access_token")!,
          refresh_token: hash.get("refresh_token")!,
        });
        if (error) {
          if (active) setStatus("Link inválido ou expirado. Peça uma nova recuperação de senha.");
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session) {
        setReady(true);
      } else {
        setStatus("Link inválido ou expirado. Peça uma nova recuperação de senha.");
      }
    }

    void run();
    return () => {
      active = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("As senhas não coincidem");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Senha atualizada com sucesso");
      navigate({ to: "/inicio" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a senha");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm fade-up">
        <div className="mb-10">
          <div className="mb-5 h-11 w-11 rounded-2xl bg-primary" />
          <h1 className="text-3xl font-semibold tracking-tight">Nova senha</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Defina uma nova senha para acessar sua conta.
          </p>
        </div>

        {ready ? (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="new-password" className="text-xs text-muted-foreground">
                Nova senha
              </Label>
              <Input
                id="new-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 h-12"
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label htmlFor="confirm-password" className="text-xs text-muted-foreground">
                Confirmar senha
              </Label>
              <Input
                id="confirm-password"
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 h-12"
                autoComplete="new-password"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-full font-semibold"
            >
              Salvar nova senha
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">{status}</p>
        )}

        <button
          type="button"
          onClick={() => navigate({ to: "/auth" })}
          className="mt-6 w-full text-sm text-muted-foreground"
        >
          Voltar para o login
        </button>
      </div>
    </main>
  );
}
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — Fluxo Finanças" },
      { name: "description", content: "Acesse seu controle financeiro pessoal com segurança." },
      { property: "og:title", content: "Entrar — Fluxo Finanças" },
      {
        property: "og:description",
        content: "Acesse seu controle financeiro pessoal com segurança.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/inicio" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/confirmar` },
        });
        if (error) throw error;
        if (!data.session && data.user && (data.user.identities?.length ?? 0) === 0) {
          toast.info("Este e-mail já tem conta. Faça login ou recupere a senha.");
          setMode("signin");
          return;
        }
        if (!data.session) {
          setPendingEmail(email);
          toast.success("Confira seu e-mail para confirmar a conta.");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/inicio" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível entrar");
    } finally {
      setLoading(false);
    }
  }

  async function resendConfirmation() {
    if (!pendingEmail) return;
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingEmail,
      options: { emailRedirectTo: `${window.location.origin}/confirmar` },
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Enviamos outro e-mail de confirmação.");
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Não foi possível entrar com o Google");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/inicio" });
  }

  return (
    <main className="flex min-h-screen flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm fade-up">
        <div className="mb-10">
          <div className="mb-5 h-11 w-11 rounded-2xl bg-primary" />
          <h1 className="text-3xl font-semibold tracking-tight">Fluxo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Todo o controle da sua vida financeira em um só lugar.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="email" className="text-xs text-muted-foreground">
              E-mail
            </Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-12"
              autoComplete="email"
            />
          </div>
          <div>
            <Label htmlFor="password" className="text-xs text-muted-foreground">
              Senha
            </Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 h-12"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </div>
          <Button type="submit" disabled={loading} className="h-12 w-full rounded-full font-semibold">
            {mode === "signin" ? "Entrar" : "Criar conta"}
          </Button>
        </form>

        <Button
          type="button"
          variant="outline"
          onClick={google}
          className="mt-3 h-12 w-full rounded-full"
        >
          Continuar com Google
        </Button>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-6 w-full text-sm text-muted-foreground"
        >
          {mode === "signin" ? "Não tem conta? Criar agora" : "Já tenho conta"}
        </button>
      </div>
    </main>
  );
}
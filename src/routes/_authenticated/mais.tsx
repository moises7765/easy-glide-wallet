import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, ChevronRight, CreditCard, FileUp, LogOut, PiggyBank, Target, Wallet } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { ImportStatement } from "@/components/ImportStatement";

import { PageHeader, Panel } from "@/components/finance-ui";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { brl, num } from "@/lib/finance";
import { useEmergencyFund, useProfile, useRows, useUser } from "@/lib/queries";

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
  const [importOpen, setImportOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { email } = useUser();
  const { data: profile } = useProfile();
  const { data: assets = [] } = useRows("assets");
  const { data: purchases = [] } = useRows("installment_purchases");
  const { data: fund } = useEmergencyFund();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const netWorth = assets.reduce((s, a) => s + num(a.value), 0);

  async function updateAvatarUrl(path: string | null) {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Sessão expirada");
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: path })
      .eq("id", auth.user.id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["profiles"] });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Escolha uma imagem (JPG, PNG, etc.)");
      return;
    }
    setUploading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sessão expirada");

      const ext = file.name.split(".").pop() || "jpg";
      const path = `${auth.user.id}/${Date.now()}.${ext}`;

      if (profile?.avatar_url) {
        await supabase.storage.from("avatars").remove([profile.avatar_url]);
      }

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      await updateAvatarUrl(path);
      toast.success("Foto de perfil atualizada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar foto");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeAvatar() {
    if (!profile?.avatar_url) return;
    setUploading(true);
    try {
      await supabase.storage.from("avatars").remove([profile.avatar_url]);
      await updateAvatarUrl(null);
      toast.success("Foto de perfil removida");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover foto");
    } finally {
      setUploading(false);
    }
  }

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
      <PageHeader title="Mais" subtitle={email ?? ""} />

      <div className="space-y-4 px-5">
        <Panel className="flex flex-col items-center gap-3 p-6 text-center">
          <UserAvatar
            name={profile?.display_name ?? email}
            avatarUrl={profile?.avatar_url}
            className="h-20 w-20"
          />
          <div className="space-y-0.5">
            <p className="text-base font-semibold">{profile?.display_name ?? email}</p>
            <p className="text-sm text-muted-foreground">{email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="mr-1.5 h-4 w-4" />
              {profile?.avatar_url ? "Alterar foto" : "Adicionar foto"}
            </Button>
            {profile?.avatar_url && (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full text-muted-foreground"
                disabled={uploading}
                onClick={removeAvatar}
              >
                Remover
              </Button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handleFileChange}
          />
        </Panel>

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

          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors active:bg-secondary/60"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary">
              <FileUp className="h-4 w-4 text-primary" />
            </span>
            <span className="flex-1 text-sm font-medium">Importar extrato</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
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

      <ImportStatement open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
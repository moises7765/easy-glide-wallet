"use client";

import { useEffect, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

function initials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0] + parts[1]![0]).toUpperCase();
}

export function UserAvatar({
  name,
  avatarUrl,
  className,
}: {
  name?: string | null;
  avatarUrl?: string | null;
  className?: string;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!avatarUrl) {
      setSignedUrl(null);
      return;
    }
    let active = true;
    supabase.storage
      .from("avatars")
      .createSignedUrl(avatarUrl, 3600)
      .then(({ data, error }) => {
        if (active && !error && data?.signedUrl) setSignedUrl(data.signedUrl);
      });
    return () => {
      active = false;
    };
  }, [avatarUrl]);

  return (
    <Avatar className={cn("h-11 w-11 border border-border/60", className)}>
      <AvatarImage src={signedUrl ?? undefined} alt={name ?? "Foto de perfil"} />
      <AvatarFallback className="bg-secondary text-sm font-medium text-foreground">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

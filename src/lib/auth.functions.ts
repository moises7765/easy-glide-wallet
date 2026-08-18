import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Após uma falha de login, informa apenas se a conta usa exclusivamente
 * um provedor social (Google). Nunca revela existência de conta em outros casos.
 */
export const checkSignInMethod = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ email: z.string().email() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) return { oauthOnly: false as const, providers: [] as string[] };

    const email = data.email.trim().toLowerCase();
    const user = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (!user) return { oauthOnly: false as const, providers: [] as string[] };

    const providers = (user.identities ?? []).map((i) => i.provider);
    const oauthOnly = providers.length > 0 && !providers.includes("email");
    return { oauthOnly, providers: oauthOnly ? providers : [] };
  });
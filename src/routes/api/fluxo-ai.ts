import { createOpenAI } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

import type { Database } from "@/integrations/supabase/types";
import { createLovableAiRunFetch } from "@/lib/ai-gateway.server";
import { buildFluxoAiContext, FLUXO_AI_INSTRUCTIONS } from "@/lib/fluxo-ai.server";

type ChatBody = { messages?: unknown };

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export const Route = createFileRoute("/api/fluxo-ai")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authorization = request.headers.get("authorization");
        if (!authorization?.startsWith("Bearer ")) return errorResponse("Sua sessão expirou. Entre novamente.", 401);
        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
        const aiKey = process.env["LOVABLE_API_KEY"];
        if (!url || !key) return errorResponse("A conexão com seus dados não está configurada.", 500);
        if (!aiKey) return errorResponse("O Fluxo IA ainda não está configurado neste ambiente.", 503);

        const token = authorization.slice(7);
        if (token.split(".").length !== 3) return errorResponse("Sua sessão é inválida.", 401);
        const supabase = createClient<Database>(url, key, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
        const userId = claims?.claims?.sub;
        if (claimsError || !userId) return errorResponse("Sua sessão expirou. Entre novamente.", 401);

        const body = (await request.json()) as ChatBody;
        if (!Array.isArray(body.messages)) return errorResponse("Envie uma mensagem para continuar.", 400);
        const financialContext = await buildFluxoAiContext(supabase, userId);
        const initialRunId = request.headers.get("X-Lovable-AIG-Run-ID");
        const run = createLovableAiRunFetch(initialRunId);
        const lovable = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey: aiKey,
          headers: { "Lovable-API-Key": aiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          fetch: run.fetch,
        });

        try {
          const result = streamText({
            model: lovable.responses("openai/gpt-6-astra"),
            system: `${FLUXO_AI_INSTRUCTIONS}\n\nDados atuais do usuário (JSON):\n${financialContext}`,
            messages: await convertToModelMessages(body.messages as UIMessage[]),
            providerOptions: {
              openai: {
                forceReasoning: true,
                reasoningEffort: "medium",
                reasoningSummary: "auto",
                store: false,
                include: ["reasoning.encrypted_content"],
              },
            },
            abortSignal: request.signal,
          });
          const response = result.toUIMessageStreamResponse({
            originalMessages: body.messages as UIMessage[],
            sendReasoning: true,
          });
          const headers = new Headers(response.headers);
          const runId = run.getRunId();
          if (runId) headers.set("X-Lovable-AIG-Run-ID", runId);
          return new Response(response.body, { status: response.status, headers });
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return new Response(null, { status: 499 });
          throw error;
        }
      },
    },
  },
});
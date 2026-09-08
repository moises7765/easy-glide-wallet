import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

/**
 * Disparo diário dos avisos de fatura (chamado pelo agendador às 08:00 Brasília).
 * Protegido por segredo: Authorization: Bearer <INVOICE_ALERTS_CRON_SECRET>.
 */
export const Route = createFileRoute("/api/public/hooks/invoice-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["INVOICE_ALERTS_CRON_SECRET"];
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!secret || !token || token !== secret) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const dryRun = new URL(request.url).searchParams.get("dry") === "1";
        try {
          const { runInvoiceAlerts } = await import("@/lib/invoice-push.server");
          const result = await runInvoiceAlerts({ dryRun });
          return Response.json({ ok: true, ...result });
        } catch (e) {
          console.error("[invoice-alerts]", e);
          return Response.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
        }
      },
    },
  },
});

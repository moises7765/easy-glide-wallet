/**
 * Envio diário (08:00 Brasília) dos avisos de fatura via Web Push.
 * Executado pelo endpoint /api/public/hooks/invoice-alerts (chamado pelo agendador).
 * Controle de duplicidade: tabela invoice_alert_log (único por cartão/fatura/marco).
 */
import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildCardInvoices, type Card, type InstallmentPurchase, type Transaction } from "@/lib/finance";
import { alertsForInvoice, type InvoiceAlert } from "@/lib/invoice-notifications";

/** "Hoje" no calendário de São Paulo, como Date local à meia-noite (compatível com finance.ts). */
export function todayInSaoPaulo(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return new Date(get("year"), get("month") - 1, get("day"));
}

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

export type RunResult = {
  date: string;
  usersChecked: number;
  alertsDue: number;
  sent: number;
  skippedAlreadySent: number;
  failed: number;
  removedSubscriptions: number;
};

export async function runInvoiceAlerts(opts: { dryRun?: boolean } = {}): Promise<RunResult> {
  const vapid = {
    subject: process.env["VAPID_SUBJECT"] ?? "mailto:contato@fluxofinancas.app",
    publicKey: process.env["VAPID_PUBLIC_KEY"],
    privateKey: process.env["VAPID_PRIVATE_KEY"],
  };
  if (!vapid.publicKey || !vapid.privateKey) throw new Error("VAPID keys not configured");

  const today = todayInSaoPaulo();
  const result: RunResult = {
    date: today.toISOString().slice(0, 10),
    usersChecked: 0,
    alertsDue: 0,
    sent: 0,
    skippedAlreadySent: 0,
    failed: 0,
    removedSubscriptions: 0,
  };

  const { data: subs, error: subsErr } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth");
  if (subsErr) throw subsErr;
  const subsByUser = new Map<string, Sub[]>();
  for (const s of subs ?? []) subsByUser.set(s.user_id, [...(subsByUser.get(s.user_id) ?? []), s]);
  if (subsByUser.size === 0) return result;

  const userIds = [...subsByUser.keys()];
  const { data: cards, error: cardsErr } = await supabaseAdmin
    .from("cards")
    .select("*")
    .in("user_id", userIds)
    .eq("invoice_alerts_enabled", true);
  if (cardsErr) throw cardsErr;
  if (!cards || cards.length === 0) return result;

  const usersWithCards = [...new Set(cards.map((c) => c.user_id))];
  result.usersChecked = usersWithCards.length;

  const [{ data: txs }, { data: purchases }, { data: payments }] = await Promise.all([
    supabaseAdmin
      .from("transactions")
      .select("*")
      .in("user_id", usersWithCards)
      .eq("type", "expense")
      .not("card_id", "is", null),
    supabaseAdmin.from("installment_purchases").select("*").in("user_id", usersWithCards),
    supabaseAdmin.from("card_invoice_payments").select("card_id,invoice_key,paid_at").in("user_id", usersWithCards),
  ]);

  const txByUser = groupBy((txs ?? []) as Transaction[], (t) => t.user_id);
  const purchByUser = groupBy((purchases ?? []) as InstallmentPurchase[], (p) => p.user_id);
  const cardsByUser = groupBy(cards as Card[], (c) => c.user_id);

  for (const userId of usersWithCards) {
    const userSubs = subsByUser.get(userId) ?? [];
    const due: InvoiceAlert[] = [];
    for (const card of cardsByUser.get(userId) ?? []) {
      const invoices = buildCardInvoices(
        card,
        txByUser.get(userId) ?? [],
        purchByUser.get(userId) ?? [],
        payments ?? [],
        today,
      );
      for (const inv of invoices) due.push(...alertsForInvoice(card.id, card.name, inv));
    }
    result.alertsDue += due.length;

    for (const alert of due) {
      if (opts.dryRun) continue;
      // Reserva o marco antes de enviar: se já existe, outro disparo já cuidou dele.
      const { data: logged, error: logErr } = await supabaseAdmin
        .from("invoice_alert_log")
        .upsert(
          { user_id: userId, card_id: alert.cardId, invoice_key: alert.invoiceKey, alert_offset: alert.offset },
          { onConflict: "card_id,invoice_key,alert_offset", ignoreDuplicates: true },
        )
        .select("id");
      if (logErr) {
        console.error("[invoice-alerts] log error", logErr.message);
        result.failed++;
        continue;
      }
      if (!logged || logged.length === 0) {
        result.skippedAlreadySent++;
        continue;
      }

      const payload = JSON.stringify({ title: alert.title, body: alert.body, tag: alert.id, url: "/cartoes" });
      let delivered = 0;
      for (const sub of userSubs) {
        const subscription: PushSubscription = {
          endpoint: sub.endpoint,
          expirationTime: null,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        };
        try {
          const req = await buildPushPayload({ data: payload, options: { ttl: 60 * 60 * 12, urgency: "high" } }, subscription, vapid);
          const res = await fetch(sub.endpoint, req);
          if (res.ok) {
            delivered++;
          } else if (res.status === 404 || res.status === 410) {
            await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
            result.removedSubscriptions++;
          } else {
            console.error("[invoice-alerts] push failed", res.status, await res.text().catch(() => ""));
          }
        } catch (e) {
          console.error("[invoice-alerts] push error", e instanceof Error ? e.message : e);
        }
      }
      if (delivered > 0) result.sent++;
      else {
        result.failed++;
        // Nenhum aparelho recebeu: libera o marco para a próxima tentativa.
        await supabaseAdmin
          .from("invoice_alert_log")
          .delete()
          .match({ card_id: alert.cardId, invoice_key: alert.invoiceKey, alert_offset: alert.offset });
      }
    }
  }

  return result;
}

function groupBy<T>(items: T[], key: (t: T) => string) {
  const map = new Map<string, T[]>();
  for (const it of items) map.set(key(it), [...(map.get(key(it)) ?? []), it]);
  return map;
}

/**
 * Avisos de vencimento de fatura.
 *
 * Navegadores (e o PWA no iPhone) não permitem agendar notificações locais
 * confiáveis com o app fechado — não há Web Push configurado neste projeto.
 * Então: quando o app está aberto (ou volta ao primeiro plano) disparamos a
 * notificação do sistema, se permitida, e SEMPRE mostramos o aviso dentro do
 * app como fallback. Cada fatura/marco é notificado uma única vez.
 */

import type { CardInvoice } from "@/lib/finance";

/** Dias antes do vencimento em que avisamos. 0 = no dia. */
export const ALERT_OFFSETS = [5, 1, 0] as const;

const STORAGE_KEY = "fluxo:invoice-alerts-sent";
export const PERMISSION_KEY = "fluxo:invoice-alerts-enabled";

export type InvoiceAlert = {
  /** cardId:invoiceKey:offset — dedupe */
  id: string;
  cardName: string;
  invoiceKey: string;
  amount: number;
  dueDate: Date;
  daysToDue: number;
  title: string;
  body: string;
};

const notificationsSupported = () => typeof window !== "undefined" && "Notification" in window;

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return "unsupported" as const;
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  return Notification.requestPermission();
}

function readSent(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeSent(ids: string[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-200)));
  } catch {
    /* storage cheio/indisponível — apenas ignora */
  }
}

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/** Alertas devidos hoje para uma fatura ainda NÃO paga. */
export function alertsForInvoice(
  cardId: string,
  cardName: string,
  invoice: CardInvoice,
): InvoiceAlert[] {
  if (invoice.paid || invoice.amount <= 0.005) return [];
  const build = (offset: number, title: string, body: string): InvoiceAlert => ({
    id: `${cardId}:${invoice.key}:${offset}`,
    cardName,
    invoiceKey: invoice.key,
    amount: invoice.amount,
    dueDate: invoice.dueDate,
    daysToDue: invoice.daysToDue,
    title,
    body,
  });

  const day = invoice.dueDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  if (invoice.overdue) {
    return [build(-1, `Fatura ${cardName} vencida`, `${money(invoice.amount)} venceu em ${day}.`)];
  }
  const offset = ALERT_OFFSETS.find((o) => invoice.daysToDue <= o);
  if (offset === undefined) return [];
  const when =
    offset === 0 ? "vence hoje" : offset === 1 ? "vence amanhã" : `vence em ${invoice.daysToDue} dias`;
  return [build(offset, `Fatura ${cardName} ${when}`, `${money(invoice.amount)} · vencimento ${day}.`)];
}

/** Dispara notificações do sistema ainda não enviadas e devolve todos os alertas ativos. */
export function dispatchAlerts(alerts: InvoiceAlert[], systemEnabled: boolean) {
  const sent = new Set(readSent());
  const pending = alerts.filter((a) => !sent.has(a.id));

  if (systemEnabled && notificationPermission() === "granted") {
    for (const alert of pending) {
      try {
        new Notification(alert.title, { body: alert.body, tag: alert.id });
        sent.add(alert.id);
      } catch {
        /* alguns navegadores exigem service worker — cai no aviso in-app */
      }
    }
    writeSent([...sent]);
  }

  return alerts;
}

/** Limpa marcações de faturas já pagas para não travar avisos futuros. */
export function clearAlertsFor(cardId: string, invoiceKey: string) {
  writeSent(readSent().filter((id) => !id.startsWith(`${cardId}:${invoiceKey}:`)));
}

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

export type NotifyState = "granted" | "denied" | "default" | "unsupported";

/** Diagnóstico do ambiente para explicar ao usuário o que dá (ou não dá) para fazer. */
export type NotifyEnv = {
  state: NotifyState;
  /** true quando ainda dá para abrir o prompt do navegador. */
  canRequest: boolean;
  /** iOS/iPadOS: notificações só existem com o app instalado na tela de início. */
  needsInstall: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  /** Motivo legível quando não há suporte. */
  reason?: string;
};

const notificationsSupported = () =>
  typeof window !== "undefined" &&
  "Notification" in window &&
  typeof window.Notification?.requestPermission === "function";

function detectIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  const iPadOS = /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
  return iOSDevice || iPadOS;
}

function detectStandalone() {
  if (typeof window === "undefined") return false;
  const displayMode = window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return displayMode || iosStandalone;
}

export function notificationEnvironment(): NotifyEnv {
  const isIOS = detectIOS();
  const isStandalone = detectStandalone();

  if (!notificationsSupported()) {
    return {
      state: "unsupported",
      canRequest: false,
      needsInstall: isIOS && !isStandalone,
      isIOS,
      isStandalone,
      reason:
        isIOS && !isStandalone
          ? "No iPhone, avisos do sistema só funcionam com o app instalado na tela de início (Compartilhar → Adicionar à Tela de Início)."
          : "Este navegador não oferece notificações do sistema.",
    };
  }

  const state = Notification.permission as NotifyState;
  return {
    state,
    canRequest: state === "default",
    needsInstall: false,
    isIOS,
    isStandalone,
  };
}

export function notificationPermission(): NotifyState {
  return notificationEnvironment().state;
}

/**
 * Pede permissão. Só abre o prompt quando o estado é 'default' — nenhum código
 * consegue reverter 'denied'; nesse caso o usuário precisa liberar nas
 * configurações do navegador/sistema.
 */
export async function requestNotificationPermission(): Promise<NotifyState> {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission as NotifyState;
  try {
    const result = await Notification.requestPermission();
    return result as NotifyState;
  } catch {
    // Safari antigo usa callback em vez de Promise.
    return new Promise<NotifyState>((resolve) => {
      try {
        Notification.requestPermission((r) => resolve(r as NotifyState));
      } catch {
        resolve("denied");
      }
    });
  }
}

/** Instruções de como reabilitar quando o usuário bloqueou. */
export function howToUnblock(env: NotifyEnv): string {
  if (env.isIOS) {
    return "Ajustes → Notificações → Fluxo Finanças e ative “Permitir notificações”. Se não aparecer, remova e reinstale o app na tela de início.";
  }
  return "No navegador, toque no cadeado/ícone ao lado do endereço → Permissões → Notificações → Permitir. Depois recarregue a página.";
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
  const offset = [...ALERT_OFFSETS].sort((a, b) => a - b).find((o) => invoice.daysToDue <= o);
  if (offset === undefined) return [];
  const when =
    offset === 0 ? "vence hoje" : offset === 1 ? "vence amanhã" : `vence em ${invoice.daysToDue} dias`;
  return [build(offset, `Fatura ${cardName} ${when}`, `${money(invoice.amount)} · vencimento ${day}.`)];
}

/**
 * Dispara notificações do sistema ainda não enviadas e devolve todos os alertas ativos.
 * O aviso dentro do app é sempre mostrado (fallback), então nada se perde quando
 * a permissão está bloqueada ou o ambiente não suporta notificações.
 */
export async function dispatchAlerts(alerts: InvoiceAlert[], systemEnabled: boolean) {
  const sent = new Set(readSent());
  const pending = alerts.filter((a) => !sent.has(a.id));
  if (pending.length === 0) return alerts;

  if (systemEnabled && notificationPermission() === "granted") {
    // Alguns ambientes (iOS PWA) só aceitam notificação via service worker.
    let registration: ServiceWorkerRegistration | undefined;
    try {
      registration = (await navigator.serviceWorker?.getRegistration()) ?? undefined;
    } catch {
      registration = undefined;
    }

    for (const alert of pending) {
      const options: NotificationOptions = { body: alert.body, tag: alert.id, icon: "/icons/icon-192.png" };
      try {
        if (registration?.showNotification) {
          await registration.showNotification(alert.title, options);
        } else {
          new Notification(alert.title, options);
        }
        sent.add(alert.id);
      } catch {
        /* cai no aviso in-app */
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

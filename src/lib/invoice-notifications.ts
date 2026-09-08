/**
 * Avisos de vencimento de fatura.
 *
 * O envio real acontece no servidor, todos os dias às 08:00 (Brasília), via
 * Web Push — funciona com o app fechado quando o aparelho está inscrito
 * (PWA instalado + permissão concedida). O aviso dentro do app permanece
 * como fallback e é apenas informativo: abrir Cartões NÃO dispara nada.
 */

import { supabase } from "@/integrations/supabase/client";
import type { CardInvoice } from "@/lib/finance";

/** Dias antes do vencimento em que avisamos. 0 = no dia. */
export const ALERT_OFFSETS = [5, 1, 0] as const;

/** Chave pública VAPID (publicável) — a privada fica só no servidor. */
export const VAPID_PUBLIC_KEY =
  "BEUdM0gqOWEbh_p_xpFVN_H4Ez1_4B1Iu4Be1u7Z-6H_3n2GPZ6JigLzQ0QklegFBAjvzmnPekQB1wDyHcg4y6E";

const SW_PATH = "/push-sw.js";

export type InvoiceAlert = {
  /** cardId:invoiceKey:offset — dedupe */
  id: string;
  cardId: string;
  offset: number;
  cardName: string;
  invoiceKey: string;
  amount: number;
  dueDate: Date;
  daysToDue: number;
  title: string;
  body: string;
};

export type NotifyState = "granted" | "denied" | "default" | "unsupported" | "unavailable";

/** Diagnóstico do ambiente para explicar ao usuário o que dá (ou não dá) para fazer. */
export type NotifyEnv = {
  state: NotifyState;
  /** true quando ainda dá para abrir o prompt do navegador. */
  canRequest: boolean;
  /** iOS/iPadOS: notificações só existem com o app instalado na tela de início. */
  needsInstall: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  /** Preview do Lovable / iframe: o domínio não expõe a permissão de notificações. */
  isEmbedded: boolean;
  /** Web Push (service worker + PushManager) disponível neste navegador. */
  pushSupported: boolean;
  /** Motivo legível quando não há suporte. */
  reason?: string;
};

const notificationsSupported = () =>
  typeof window !== "undefined" &&
  "Notification" in window &&
  typeof window.Notification?.requestPermission === "function";

const pushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  window.isSecureContext;

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

/** Preview do Lovable (iframe ou domínio de preview): pedir permissão ali não vale. */
function detectEmbedded() {
  if (typeof window === "undefined") return false;
  let inIframe = false;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true;
  }
  const host = window.location?.hostname ?? "";
  const previewHost =
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    (host.endsWith(".lovable.app") && host.includes("preview")) ||
    host.endsWith(".lovableproject.com") ||
    host.endsWith(".lovableproject-dev.com") ||
    host.endsWith(".lovable.dev");
  return inIframe || previewHost;
}

export function notificationEnvironment(): NotifyEnv {
  const isIOS = detectIOS();
  const isStandalone = detectStandalone();
  const isEmbedded = detectEmbedded();
  const base = { needsInstall: false, isIOS, isStandalone, isEmbedded, pushSupported: pushSupported() };

  if (!notificationsSupported()) {
    return {
      ...base,
      state: isEmbedded ? "unavailable" : "unsupported",
      canRequest: false,
      needsInstall: isIOS && !isStandalone,
      reason: isEmbedded
        ? "Notificações nativas ficam indisponíveis no Preview. Abra o app publicado (ou instale na Tela de Início) para ativar."
        : isIOS && !isStandalone
          ? "No iPhone, avisos do sistema só funcionam com o app instalado na tela de início (Compartilhar → Adicionar à Tela de Início)."
          : "Este navegador não oferece notificações do sistema.",
    };
  }

  const permission = Notification.permission as "granted" | "denied" | "default";

  if (isEmbedded && permission !== "granted") {
    return {
      ...base,
      state: "unavailable",
      canRequest: false,
      reason:
        "Notificações nativas indisponíveis neste ambiente (Preview). Instale/abra o app publicado como PWA para ativar. Os lembretes continuam aqui dentro do app.",
    };
  }

  if (isIOS && !isStandalone && permission !== "granted") {
    return {
      ...base,
      state: "unavailable",
      canRequest: false,
      needsInstall: true,
      reason:
        "No iPhone, notificações só funcionam com o app instalado na Tela de Início (Compartilhar → Adicionar à Tela de Início). Enquanto isso, os lembretes aparecem aqui dentro do app.",
    };
  }

  return {
    ...base,
    state: permission,
    canRequest: permission === "default",
  };
}

export function notificationPermission(): NotifyState {
  return notificationEnvironment().state;
}

/**
 * Pede permissão. Só abre o prompt quando o estado é 'default' — nenhum código
 * consegue reverter 'denied'.
 */
export async function requestNotificationPermission(): Promise<NotifyState> {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission as NotifyState;
  try {
    const result = await Notification.requestPermission();
    return result as NotifyState;
  } catch {
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

/* ------------------------------------------------------------------------- *
 * Web Push: inscrição deste aparelho
 * ------------------------------------------------------------------------- */

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function swRegistration() {
  const existing = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_PATH, { scope: "/" });
}

export type PushStatus = "subscribed" | "none" | "unsupported";

/** Este aparelho está inscrito para receber os avisos com o app fechado? */
export async function pushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return "unsupported";
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    const sub = await reg?.pushManager.getSubscription();
    return sub ? "subscribed" : "none";
  } catch {
    return "none";
  }
}

/**
 * Registra o service worker de push, cria a subscription e guarda no backend
 * vinculada ao usuário logado (protegido por RLS).
 */
export async function enablePushOnThisDevice(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: "Este navegador não suporta Web Push." };
  if (Notification.permission !== "granted") {
    return { ok: false, reason: "Permissão de notificação não concedida." };
  }
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, reason: "Faça login para ativar os avisos." };

  try {
    const reg = await swRegistration();
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));
    const json = sub.toJSON();
    const p256dh = json.keys?.["p256dh"];
    const auth = json.keys?.["auth"];
    if (!json.endpoint || !p256dh || !auth) {
      return { ok: false, reason: "Não foi possível obter a inscrição do navegador." };
    }
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: json.endpoint,
        p256dh,
        auth,
        user_agent: navigator.userAgent.slice(0, 200),
      },
      { onConflict: "endpoint" },
    );
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao inscrever este aparelho." };
  }
}

/** Remove a inscrição deste aparelho (navegador + backend). */
export async function disablePushOnThisDevice() {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
  } catch {
    /* ignora */
  }
}

/* ------------------------------------------------------------------------- *
 * Texto dos alertas (compartilhado entre app e servidor)
 * ------------------------------------------------------------------------- */

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const dayMonth = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Alertas devidos hoje para uma fatura ainda NÃO paga. */
export function alertsForInvoice(
  cardId: string,
  cardName: string,
  invoice: CardInvoice,
): InvoiceAlert[] {
  if (invoice.paid || invoice.amount <= 0.005) return [];
  const build = (offset: number, title: string, body: string): InvoiceAlert => ({
    id: `${cardId}:${invoice.key}:${offset}`,
    cardId,
    offset,
    cardName,
    invoiceKey: invoice.key,
    amount: invoice.amount,
    dueDate: invoice.dueDate,
    daysToDue: invoice.daysToDue,
    title,
    body,
  });

  const day = dayMonth(invoice.dueDate);
  const body = `${cardName} • ${money(invoice.amount)} • vencimento ${day}`;

  if (invoice.overdue) return [build(-1, "Sua fatura venceu", body)];
  const offset = [...ALERT_OFFSETS].sort((a, b) => a - b).find((o) => invoice.daysToDue <= o);
  if (offset === undefined) return [];
  const title =
    offset === 0
      ? "Sua fatura vence hoje"
      : offset === 1
        ? "Sua fatura vence amanhã"
        : `Sua fatura vence em ${invoice.daysToDue} dias`;
  return [build(offset, title, body)];
}

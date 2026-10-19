/**
 * Foco seguro em campos dentro de gavetas inferiores no iPhone.
 *
 * Problema: focar um campo enquanto a gaveta ainda está entrando (fora da tela)
 * faz o iOS rolar a página para "mostrar" o campo quando o teclado sobe — a
 * gaveta termina deslocada e sobra espaço vazio.
 *
 * Solução:
 * 1. `primeKeyboard()` — chamado DENTRO do toque do usuário (ex.: botão +):
 *    foca um campo auxiliar invisível que já está na área visível. O teclado
 *    abre na hora (o iOS só abre teclado em resposta a um toque) sem rolar nada.
 * 2. `focusWhenDrawerSettles()` — espera a gaveta montar e terminar a animação
 *    de entrada; só então passa o foco para o campo real (já visível, acima do
 *    teclado) e remove o auxiliar. A troca de foco entre campos mantém o teclado.
 */

const PROXY_ID = "drawer-keyboard-proxy";

function isTouchDevice() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer: coarse)").matches);
}

export function primeKeyboard(inputMode: "decimal" | "text" = "text") {
  if (!isTouchDevice()) return;
  let proxy = document.getElementById(PROXY_ID) as HTMLInputElement | null;
  if (!proxy) {
    proxy = document.createElement("input");
    proxy.id = PROXY_ID;
    proxy.type = "text";
    proxy.tabIndex = -1;
    proxy.setAttribute("aria-hidden", "true");
    proxy.setAttribute("autocomplete", "off");
    // Fixo no topo da área visível: o iOS não precisa rolar para mostrá-lo.
    // 16px evita o zoom automático do iOS em campos com fonte pequena.
    Object.assign(proxy.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "1px",
      height: "1px",
      opacity: "0",
      border: "0",
      padding: "0",
      fontSize: "16px",
      pointerEvents: "none",
    });
    document.body.appendChild(proxy);
  }
  proxy.inputMode = inputMode;
  proxy.focus({ preventScroll: true });
}

export function releaseKeyboardProxy() {
  document.getElementById(PROXY_ID)?.remove();
}

/**
 * Aguarda o campo existir e a gaveta que o contém terminar de animar, então foca
 * sem rolar a página. Retorna uma função para cancelar (ex.: gaveta fechada antes).
 */
export function focusWhenDrawerSettles(getTarget: () => HTMLElement | null, maxFrames = 60) {
  let cancelled = false;
  let frame = 0;
  let tries = 0;

  const focusNow = (target: HTMLElement) => {
    if (cancelled) return;
    target.focus({ preventScroll: true });
    releaseKeyboardProxy();
  };

  const waitForTarget = () => {
    if (cancelled) return;
    const target = getTarget();
    if (!target) {
      if (++tries > maxFrames) return releaseKeyboardProxy();
      frame = requestAnimationFrame(waitForTarget);
      return;
    }
    const drawer = target.closest<HTMLElement>("[data-vaul-drawer]");
    const running = drawer?.getAnimations?.() ?? [];
    if (running.length === 0) return focusNow(target);
    void Promise.allSettled(running.map((animation) => animation.finished)).then(() => focusNow(target));
  };

  frame = requestAnimationFrame(waitForTarget);
  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
    releaseKeyboardProxy();
  };
}

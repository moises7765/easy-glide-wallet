import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "@/lib/utils";

/**
 * Gaveta inferior base.
 *
 * `repositionInputs` do vaul fica desligado: ele grava `height`/`bottom` inline no
 * iOS usando uma heurística de teclado que dessincroniza (altura inicial guardada
 * de uma abertura anterior, troca Despesa/Receita, "Mais detalhes"), deixando a
 * gaveta deslocada e com grandes áreas vazias. Em vez disso, `DrawerContent`
 * ancora a gaveta na área visível real (visualViewport) via variáveis CSS.
 */
const Drawer = ({
  shouldScaleBackground = false,
  repositionInputs = false,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root
    shouldScaleBackground={shouldScaleBackground}
    repositionInputs={repositionInputs}
    {...props}
  />
);
Drawer.displayName = "Drawer";

const DrawerTrigger = DrawerPrimitive.Trigger;

const DrawerPortal = DrawerPrimitive.Portal;

const DrawerClose = DrawerPrimitive.Close;

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/80", className)}
    {...props}
  />
));
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

/** Rola apenas o container interno da gaveta para mostrar o campo focado. */
function revealInDrawerScroller(target: HTMLElement) {
  const scroller = target.closest<HTMLElement>("[data-drawer-scroll]");
  if (!scroller) return;
  const area = scroller.getBoundingClientRect();
  const field = target.getBoundingClientRect();
  const gap = 16;
  if (field.bottom > area.bottom - gap) {
    scroller.scrollTop += field.bottom - area.bottom + gap;
  } else if (field.top < area.top + gap) {
    scroller.scrollTop -= area.top + gap - field.top;
  }
}

function isTextField(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  if (el.tagName !== "INPUT") return false;
  const type = (el as HTMLInputElement).type;
  return !["checkbox", "radio", "range", "color", "file", "image", "button", "submit", "reset"].includes(type);
}

/**
 * Mantém a gaveta dentro da área realmente visível (acima do teclado) usando
 * visualViewport. Funciona mesmo se o Safari rolar a página ao abrir o teclado:
 * a borda inferior fica sempre em `offsetTop + height` do viewport visual.
 */
function useVisualViewportAnchor(el: HTMLElement | null) {
  React.useLayoutEffect(() => {
    if (!el) return;
    const vv = window.visualViewport;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const initialScroll = { x: window.scrollX, y: window.scrollY };
    let frame = 0;

    const apply = () => {
      const viewportHeight = vv?.height ?? window.innerHeight;
      const keyboard = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      el.style.setProperty("--drawer-keyboard", `${Math.round(keyboard)}px`);
      el.style.setProperty("--drawer-viewport", `${Math.round(viewportHeight)}px`);
      el.dataset["keyboard"] = keyboard > 80 ? "open" : "closed";
      const active = document.activeElement;
      if (keyboard > 80 && isTextField(active) && el.contains(active)) revealInDrawerScroller(active);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (isTextField(event.target as Element)) {
        // espera o teclado/viewport assentarem antes de medir
        window.setTimeout(schedule, 60);
      }
    };

    apply();
    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    el.addEventListener("focusin", onFocusIn);

    return () => {
      cancelAnimationFrame(frame);
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      el.removeEventListener("focusin", onFocusIn);
      // No PWA o vaul não restaura a rolagem; se o teclado deslocou a página,
      // volta para onde o usuário estava (evita espaço vazio após fechar).
      if (standalone) {
        requestAnimationFrame(() => {
          if (window.scrollY !== initialScroll.y || window.scrollX !== initialScroll.x) {
            window.scrollTo(initialScroll.x, initialScroll.y);
          }
        });
      }
    };
  }, [el]);
}

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ className, children, ...props }, forwardedRef) => {
  // Estado (não ref): o Portal monta o conteúdo depois do primeiro render.
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const setRef = React.useCallback(
    (element: HTMLDivElement | null) => {
      setNode(element);
      if (typeof forwardedRef === "function") forwardedRef(element);
      else if (forwardedRef) forwardedRef.current = element;
    },
    [forwardedRef],
  );
  useVisualViewportAnchor(node);

  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        ref={setRef}
        className={cn(
          "drawer-viewport-anchor fixed inset-x-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background",
          className,
        )}
        {...props}
      >
        <div className="mx-auto mt-4 h-2 w-[100px] shrink-0 rounded-full bg-muted" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
});
DrawerContent.displayName = "DrawerContent";

const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)} {...props} />
);
DrawerHeader.displayName = "DrawerHeader";

const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />
);
DrawerFooter.displayName = "DrawerFooter";

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};

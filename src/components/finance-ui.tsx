import type { ReactNode } from "react";

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { brl, pct } from "@/lib/finance";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-3 px-5 pt-4 pb-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("surface fade-up p-4", className)}>{children}</section>;
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "negative";
  icon?: ReactNode;
}) {
  return (
    <div className="surface fade-up p-4">
      <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {icon}
        {label}
      </div>
      <p
        className={cn(
          "mt-2 text-xl font-semibold tabular-nums",
          tone === "positive" && "text-primary",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function ProgressBar({
  current,
  target,
  color,
}: {
  current: number;
  target: number;
  color?: string;
}) {
  const value = pct(current, target);
  return (
    <div className="mt-3">
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${value}%`, ...(color ? { background: color } : {}) }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">
          {brl(current)} / {brl(target)}
        </span>
        <span className="font-semibold text-foreground tabular-nums">{value.toFixed(0)}%</span>
      </div>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="surface fade-up px-5 py-10 text-center">
      <p className="font-medium">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh] border-border bg-popover">
        <DrawerHeader className="pb-2 text-left">
          <DrawerTitle className="text-lg">{title}</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-8">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}

export function Row({
  title,
  subtitle,
  right,
  rightSub,
  onClick,
  leading,
  tone,
}: {
  title: string;
  subtitle?: string;
  right?: string;
  rightSub?: string;
  onClick?: () => void;
  leading?: ReactNode;
  tone?: "positive" | "negative";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-accent"
    >
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="text-right">
        {right ? (
          <p
            className={cn(
              "text-sm font-semibold tabular-nums",
              tone === "positive" && "text-primary",
              tone === "negative" && "text-destructive",
            )}
          >
            {right}
          </p>
        ) : null}
        {rightSub ? <p className="text-xs text-muted-foreground">{rightSub}</p> : null}
      </div>
    </button>
  );
}
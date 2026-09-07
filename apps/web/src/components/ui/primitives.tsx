import clsx from "clsx";

export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx("rounded-lg border border-border bg-surface", className)}
      {...rest}
    />
  );
}

type BadgeTone = "neutral" | "accent" | "danger" | "warning";

const badgeToneClasses: Record<BadgeTone, string> = {
  neutral: "bg-border/60 text-ink-muted",
  accent: "bg-accent-soft text-accent",
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        badgeToneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Renders a price with tabular figures, so digits line up down a column
 * the way they would on a printed price tag or ledger. */
export function Money({ value, className }: { value: number; className?: string }) {
  return (
    <span className={clsx("font-mono tabular-nums", className)}>
      ${value.toFixed(2)}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent text-ink-faint",
        className,
      )}
    />
  );
}

export function PageSpinner() {
  return (
    <div className="flex h-40 items-center justify-center">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong px-6 py-14 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
      {message}
    </div>
  );
}

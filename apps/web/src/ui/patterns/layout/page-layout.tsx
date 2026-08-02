import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  back,
  status,
}: {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
  readonly back?: { readonly href: string; readonly label: string };
  readonly status?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4">
      {back === undefined ? null : (
        <div>
          <Link
            href={back.href}
            className="touch-target -ml-2 inline-flex items-center gap-1.5 rounded-button px-2 text-body-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {back.label}
          </Link>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="text-heading font-bold">{title}</h1>
            {status}
          </div>
          {description === undefined ? null : (
            <p className="mt-1 max-w-2xl text-body-sm text-ink-muted">{description}</p>
          )}
        </div>
        {actions}
      </div>
    </header>
  );
}

export function PageActions({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
      {children}
    </div>
  );
}

export function Section({
  title,
  description,
  id,
  children,
  contained = false,
}: {
  readonly title: string;
  readonly description?: string;
  readonly id?: string;
  readonly children: ReactNode;
  readonly contained?: boolean;
}) {
  return (
    <section
      id={id}
      className={contained ? "rounded-card border border-border bg-surface p-4" : "grid gap-3"}
    >
      <h2 className="text-subheading font-semibold">{title}</h2>
      {description === undefined ? null : (
        <p className="mt-1 text-body-sm text-ink-muted">{description}</p>
      )}
      <div className={contained ? "mt-3" : undefined}>{children}</div>
    </section>
  );
}

export function LinkButton({
  href,
  children,
  secondary = false,
}: {
  readonly href: string;
  readonly children: ReactNode;
  readonly secondary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "touch-target inline-flex min-h-[52px] flex-1 items-center justify-center rounded-button border px-4 sm:min-h-11 sm:flex-none",
        "text-label font-semibold transition-colors",
        secondary
          ? "border-border bg-surface text-ink hover:border-border-strong"
          : "border-transparent bg-brand text-white hover:bg-brand-hover",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

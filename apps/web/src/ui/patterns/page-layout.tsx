import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-heading font-bold">{title}</h1>
        {description === undefined ? null : (
          <p className="mt-1 max-w-2xl text-body-sm text-ink-muted">{description}</p>
        )}
      </div>
      {actions}
    </header>
  );
}

export function PageActions({ children }: { readonly children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

export function Section({
  title,
  description,
  id,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly id?: string;
  readonly children: ReactNode;
}) {
  return (
    <section id={id} className="rounded-card border border-border bg-surface p-4">
      <h2 className="text-subheading font-semibold">{title}</h2>
      {description === undefined ? null : (
        <p className="mt-1 text-body-sm text-ink-muted">{description}</p>
      )}
      <div className="mt-3">{children}</div>
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
        "touch-target inline-flex items-center justify-center rounded-button border px-4",
        "text-label font-semibold transition-colors",
        secondary
          ? "border-border bg-surface text-ink hover:border-border-strong"
          : "border-transparent bg-leaf text-white hover:bg-leaf-hover",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

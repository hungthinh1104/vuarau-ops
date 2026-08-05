"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/ui/primitives/button.tsx";

export type PageFrameSize = "narrow" | "standard" | "wide";

const PAGE_FRAME_CLASS: Readonly<Record<PageFrameSize, string>> = {
  narrow: "max-w-[800px]",
  standard: "max-w-[1120px]",
  wide: "max-w-[1320px]",
};

export function PageFrame({
  size = "standard",
  children,
}: {
  readonly size?: PageFrameSize;
  readonly children: ReactNode;
}) {
  return <div className={`mx-auto w-full ${PAGE_FRAME_CLASS[size]}`}>{children}</div>;
}

export function DetailLayout({
  children,
  aside,
}: {
  readonly children: ReactNode;
  readonly aside?: ReactNode;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,20rem)] xl:items-start">
      <div className="min-w-0">{children}</div>
      {aside === undefined ? null : (
        <aside className="min-w-0 xl:sticky xl:top-[5rem]">{aside}</aside>
      )}
    </div>
  );
}

export function SummaryRail({
  title = "Tóm tắt",
  children,
}: {
  readonly title?: string;
  readonly children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="grid gap-3 rounded-card border border-border bg-surface p-4"
    >
      <h2 className="text-label font-semibold text-ink-muted">{title}</h2>
      {children}
    </section>
  );
}

export function DirectoryToolbar({
  search,
  filters,
  actions,
}: {
  readonly search: ReactNode;
  readonly filters?: ReactNode;
  readonly actions?: ReactNode;
}) {
  return (
    <div className="grid gap-3 border-y border-border py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div className="min-w-0">{search}</div>
      {filters === undefined && actions === undefined ? null : (
        <div className="flex flex-wrap items-end gap-2">
          {filters}
          {actions}
        </div>
      )}
    </div>
  );
}

export function MobileRecordCard({
  href,
  children,
}: {
  readonly href: string;
  readonly children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[64px] items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
    >
      {children}
    </Link>
  );
}

export function DisclosureSection({
  title,
  description,
  children,
  defaultOpen = false,
  open,
  onOpenChange,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;
  const contentId = useId();
  const toggle = () => {
    const next = !isOpen;
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };
  return (
    <section className="group rounded-card border border-border bg-surface">
      <Button
        tone="link"
        type="button"
        aria-controls={contentId}
        aria-expanded={isOpen}
        onClick={toggle}
        className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden"
      >
        <span>{title}</span>
        <span
          aria-hidden="true"
          className={`text-ink-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          ↓
        </span>
      </Button>
      <div id={contentId} hidden={!isOpen} className="border-t border-border px-4 py-4">
        {description === undefined ? null : (
          <p className="mb-3 text-body-sm text-ink-muted">{description}</p>
        )}
        {children}
      </div>
    </section>
  );
}

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

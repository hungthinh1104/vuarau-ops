"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { useWorkspaceChrome } from "./workspace-chrome.tsx";

export type ActionDockProps = {
  readonly label: string;
  readonly summary: ReactNode;
  readonly primary: ReactNode;
  readonly secondary?: ReactNode;
  readonly feedback?: ReactNode;
};

/**
 * The single decision surface for a mobile transaction. Mounting this dock
 * temporarily replaces the global mobile navigation so the worker never has to
 * choose between navigating away and completing the current command.
 */
export function ActionDock({ label, summary, primary, secondary, feedback }: ActionDockProps) {
  const chrome = useWorkspaceChrome();

  useLayoutEffect(() => {
    if (chrome === null) return;
    return chrome.registerActionDock();
  }, [chrome]);

  return (
    <section
      data-action-dock="true"
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 lg:sticky lg:bottom-0 lg:z-10 lg:mx-[-1.5rem] lg:px-6"
    >
      <div className="mx-auto grid max-w-[1320px] gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        {feedback === undefined ? null : <div className="lg:col-span-2">{feedback}</div>}
        <div className="min-w-0">{summary}</div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {secondary}
          {primary}
        </div>
      </div>
    </section>
  );
}

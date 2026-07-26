import type { ReactNode } from "react";

export type EmptyStateProps = {
  readonly title: string;
  /** What this emptiness means. Not "no data" — what the reader should conclude. */
  readonly description?: string;
  /** The one thing to do about it, when there is one. */
  readonly action?: ReactNode;
};

/**
 * Empty is **not** an error, and it is not loading that stopped.
 *
 * A customer with no account entries has a balance of exactly 0 ₫, classification
 * `settled`, and an empty timeline. That is a fact worth stating plainly — "Khách
 * này chưa có giao dịch nào" — rather than a blank panel that reads as a failure
 * (UI state catalog §1).
 */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-border bg-surface px-4 py-8 text-center">
      <p className="text-subheading font-semibold text-ink">{title}</p>
      {description !== undefined ? (
        <p className="max-w-prose text-body-sm text-ink-muted">{description}</p>
      ) : null}
      {action !== undefined ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

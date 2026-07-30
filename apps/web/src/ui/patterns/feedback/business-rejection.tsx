import type { DomainError } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { messageForCode } from "@/ui/copy.ts";
import { formatMoney } from "@/ui/format.ts";

export type BusinessRejectionProps = {
  readonly error: DomainError;
  /** The valid next action, when there is one. A rejection with no way forward is a dead end. */
  readonly action?: ReactNode;
};

/**
 * A rule said no. The shape was fine; the request does not make sense here.
 *
 * Attached to the **action**, never to a field. `SALE_EMPTY`,
 * `SALE_ALREADY_VOIDED`, `PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT` — no input is
 * wrong, and highlighting one sends the user hunting for a typo that does not
 * exist (UI state catalog §2).
 *
 * The copy comes from the **code**, never from `error.message`. Messages are
 * English today, will become Vietnamese, and will be reworded; the code is the
 * contract. The server's message is kept as a diagnostic line, small and last, for
 * the support conversation rather than the worker.
 */
export function BusinessRejection({ error, action }: BusinessRejectionProps) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-card border border-danger/40 bg-danger-soft px-4 py-3"
    >
      <p className="text-label font-semibold text-danger">Không thực hiện được</p>
      <p className="text-body-sm text-ink">{messageForCode(error.code, error.message)}</p>

      {/* `details` carries the specifics so the client never parses prose. The one
          that matters most: how much can actually still be reversed. */}
      <RejectionDetail error={error} />

      {action !== undefined ? <div className="mt-1 flex justify-end">{action}</div> : null}

      <p className="text-caption font-mono text-ink-muted">{error.code}</p>
    </div>
  );
}

function RejectionDetail({ error }: { error: DomainError }) {
  if (error.code === "PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT") {
    const remaining = error.details?.["remaining"];
    const currency = error.details?.["currency"];
    if (typeof remaining === "number" && currency === "VND") {
      return (
        <p className="tabular text-body-sm text-ink">
          Chỉ còn hoàn được {formatMoney({ amountMinor: remaining, currency })}.
        </p>
      );
    }
  }

  if (error.code === "SALE_LINE_INVALID") {
    const lineIndex = error.details?.["lineIndex"];
    if (typeof lineIndex === "number") {
      return <p className="text-body-sm text-ink">Dòng số {lineIndex + 1} chưa hợp lệ.</p>;
    }
  }

  return null;
}

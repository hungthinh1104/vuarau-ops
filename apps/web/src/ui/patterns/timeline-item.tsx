import type { AccountTimelineEntryDto } from "@vuarau/domain-contracts";
import { describeBalance, formatInstant, formatRecordedGap, formatSignedMoney } from "../format.ts";

export type TimelineItemProps = {
  readonly entry: AccountTimelineEntryDto;
  /** Display name for `entry.actorId`, resolved by the caller. */
  readonly actorName?: string;
};

const SOURCE_COPY = {
  sale_posting: "Chốt đơn",
  sale_void: "Hoàn tác đơn",
  payment: "Thu tiền",
  payment_reversal: "Hoàn tiền",
  manual_adjustment: "Điều chỉnh công nợ",
} as const;

/**
 * One line of the customer account timeline — the recovery surface.
 *
 * When a customer disputes a total, this list is the answer, so every line carries
 * what somebody checking it needs: what moved the money, who did it, when it
 * happened, when it was written down if that differs, and the balance afterwards.
 *
 * `runningBalance` and `classification` are server-computed. A client that added
 * these up itself would one day add them up differently, and then the screen and
 * the book disagree about money.
 *
 * The compensating pairs stay. A voided sale appears as `+total` then `−total`,
 * never as an absence — removing either would make the arithmetic unfollowable
 * (BR-ACCOUNT-005).
 */
export function TimelineItem({ entry, actorName }: TimelineItemProps) {
  const recordedGap = formatRecordedGap(entry.transactionTime, entry.recordedAt);
  const balance = describeBalance(entry.runningBalance, entry.classification);
  const increases = entry.amount.amountMinor > 0;

  return (
    <li className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-label font-semibold text-ink">{SOURCE_COPY[entry.source.type]}</span>
        <span
          className={`tabular text-subheading font-semibold ${
            increases ? "text-ink" : "text-leaf"
          }`}
        >
          {formatSignedMoney(entry.amount)}
        </span>
      </div>

      <p className="text-body-sm text-ink-muted">{entry.source.label}</p>

      {entry.reason !== null ? (
        // The text somebody disputing this balance six months later actually
        // needs (BR-SALE-014, BR-ACCOUNT-003).
        <p className="text-body-sm text-ink">{entry.reason}</p>
      ) : null}

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-caption text-ink-muted">
        <span>{formatInstant(entry.transactionTime)}</span>
        {/* Only when the two differ: a back-dated or offline-captured entry.
            When they agree, showing both is noise. */}
        {recordedGap !== null ? <span>{recordedGap}</span> : null}
        <span>{actorName ?? entry.actorId}</span>
        <span className="ml-auto tabular">
          {balance.label} {balance.amount ?? ""}
        </span>
      </div>
    </li>
  );
}

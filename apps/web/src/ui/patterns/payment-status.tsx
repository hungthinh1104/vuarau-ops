import type { Money, PaymentStatus as PaymentStatusValue } from "@vuarau/domain-contracts";
import { Badge, type BadgeTone } from "../primitives/badge.tsx";
import { formatMoney } from "../format.ts";
import { PAYMENT_STATUS_COPY } from "../copy.ts";

export type PaymentStatusProps = {
  readonly status: PaymentStatusValue;
  readonly amount: Money;
  readonly reversedAmount: Money;
  /**
   * `amount − reversedAmount`, **as computed by the server** (UC-PAYMENT-003).
   * Passed in rather than subtracted here: a client that subtracts wrongly offers
   * to reverse money that is not there.
   */
  readonly remainingReversibleAmount: Money;
};

const STATUS_TONE: Readonly<Record<PaymentStatusValue, BadgeTone>> = {
  recorded: "positive",
  partially_reversed: "warning",
  reversed: "danger",
};

/**
 * All three numbers when anything has been reversed, and one when nothing has.
 *
 * Partial reversal is normal — a customer overpaid and took some cash back — and
 * "hoàn 200.000 trong 500.000" and "hoàn 200.000" are different facts of which
 * only the first is useful. Showing the original and the remaining is what lets
 * somebody check the arithmetic against the paper book.
 */
export function PaymentStatus({
  status,
  amount,
  reversedAmount,
  remainingReversibleAmount,
}: PaymentStatusProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[status]}>{PAYMENT_STATUS_COPY[status]}</Badge>
        <span className="tabular text-subheading font-semibold text-ink">
          {formatMoney(amount)}
        </span>
      </div>

      {status !== "recorded" ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
          <dt className="text-ink-muted">Đã thu</dt>
          <dd className="tabular text-right text-ink">{formatMoney(amount)}</dd>

          <dt className="text-ink-muted">Đã hoàn</dt>
          <dd className="tabular text-right text-danger">{formatMoney(reversedAmount)}</dd>

          <dt className="text-ink-muted">Còn hoàn được</dt>
          <dd className="tabular text-right font-semibold text-ink">
            {formatMoney(remainingReversibleAmount)}
          </dd>
        </dl>
      ) : null}
    </div>
  );
}

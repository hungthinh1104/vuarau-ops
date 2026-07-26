import type { BalanceClassification, Money } from "@vuarau/domain-contracts";
import { describeBalance, formatSignedMoney } from "../format.ts";

export type MoneyImpactProps = {
  readonly currentBalance: Money;
  readonly currentClassification: BalanceClassification;
  /** Signed: positive increases what the customer owes. */
  readonly change: Money;
  readonly changeLabel: string;
  /**
   * The balance **after**, computed by the server as part of the preview — never
   * `current + change` worked out here.
   *
   * This is the rule that keeps the pattern honest. The moment a component adds
   * two amounts to show a consequence, the screen has its own opinion about a
   * balance, and one day it will be a different opinion from the ledger's
   * (ADR-0003). If a caller has no server-computed projection, it should not be
   * showing one.
   */
  readonly resultingBalance: Money;
  readonly resultingClassification: BalanceClassification;
};

/**
 * The three-line consequence shown before a financial confirmation, exactly as
 * design.md specifies it:
 *
 *     Nợ hiện tại          11.350.000₫
 *     Tăng thêm             1.350.000₫
 *     Nợ sau giao dịch     12.700.000₫
 *
 * The last line is visually strongest, because it is the one somebody is agreeing
 * to. Both balance lines are worded by their classification, so a transaction that
 * pushes an account into credit reads "Vựa nợ khách" rather than a negative debt.
 */
export function MoneyImpact({
  currentBalance,
  currentClassification,
  change,
  changeLabel,
  resultingBalance,
  resultingClassification,
}: MoneyImpactProps) {
  const before = describeBalance(currentBalance, currentClassification);
  const after = describeBalance(resultingBalance, resultingClassification);

  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 rounded-card bg-surface-muted px-4 py-3">
      <dt className="text-body-sm text-ink-muted">{before.label} hiện tại</dt>
      <dd className="tabular text-right text-body text-ink">{before.amount ?? "0 ₫"}</dd>

      <dt className="text-body-sm text-ink-muted">{changeLabel}</dt>
      <dd
        className={`tabular text-right text-body ${
          change.amountMinor < 0 ? "text-leaf" : "text-ink"
        }`}
      >
        {formatSignedMoney(change)}
      </dd>

      <dt className="border-t border-border pt-2 text-label font-semibold text-ink">
        {after.label} sau giao dịch
      </dt>
      <dd className="tabular border-t border-border pt-2 text-right text-heading font-bold text-ink">
        {after.amount ?? "0 ₫"}
      </dd>
    </dl>
  );
}

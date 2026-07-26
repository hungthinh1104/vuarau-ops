import type { BalanceClassification, Money } from "@vuarau/domain-contracts";
import { classifyBalance } from "@vuarau/domain-contracts";
import { MoneyImpact } from "./money-impact.tsx";

export type BalancePreviewProps = {
  readonly currentBalance: Money;
  readonly currentClassification: BalanceClassification;
  /** Signed. Negative reduces what the customer owes. */
  readonly change: Money;
  readonly changeLabel: string;
};

/**
 * What the balance **would** become, computed on the client and labelled as a
 * prediction.
 *
 * This is the one place the browser does arithmetic on money, and it is worth
 * being explicit about why that is acceptable here and nowhere else.
 *
 * The number is **advisory**. It is never written, never sent, and never
 * displayed after the command returns — the server's answer replaces it. Its only
 * job is to let somebody see the consequence *before* deciding, which design.md
 * requires ("show debt impact before confirmation") and which no endpoint offers:
 * there is no `payment.preview`, and inventing one would mean a round trip per
 * keystroke on a connection that drops.
 *
 * The classification is **not** predicted locally. `classifyBalance` comes from
 * `domain-contracts` — the same implementation every server read uses
 * (BR-ACCOUNT-009) — so a preview that crosses zero says "Vựa nợ khách" for
 * exactly the same reason the committed balance will.
 *
 * The arithmetic itself is integer addition of minor units, which is the one
 * money operation with no rounding rule to get wrong. Anything with a rounding
 * rule — a line total, a compensation — stays in the kernel.
 */
export function BalancePreview({
  currentBalance,
  currentClassification,
  change,
  changeLabel,
}: BalancePreviewProps) {
  const resulting: Money = {
    amountMinor: currentBalance.amountMinor + change.amountMinor,
    currency: currentBalance.currency,
  };
  const resultingClassification = classifyBalance(resulting);

  return (
    <div className="flex flex-col gap-2">
      <MoneyImpact
        currentBalance={currentBalance}
        currentClassification={currentClassification}
        change={change}
        changeLabel={changeLabel}
        resultingBalance={resulting}
        resultingClassification={resultingClassification}
      />

      {/* Overpayment is valid and expected (BR-ACCOUNT-007), so this explains
          rather than warns. A customer who hands over more than they owe has not
          done anything wrong, and a red banner would say they had. */}
      {resultingClassification === "customer_credit" &&
      currentClassification !== "customer_credit" ? (
        <p className="rounded-card border border-info/30 bg-info-soft px-3 py-2 text-body-sm text-info">
          Khách trả dư. Phần dư thành tiền vựa nợ lại khách, sẽ trừ vào đơn sau.
        </p>
      ) : null}

      <p className="text-caption text-ink-muted">
        Số dự kiến. Số chính thức sẽ hiện sau khi ghi nhận.
      </p>
    </div>
  );
}

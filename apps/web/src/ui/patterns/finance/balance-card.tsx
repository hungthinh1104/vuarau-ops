import type { BalanceClassification, Money } from "@vuarau/domain-contracts";
import { describeBalance, formatInstant } from "@/ui/format.ts";
import { Skeleton } from "@/ui/primitives/skeleton.tsx";

export type BalanceCardProps = {
  readonly customerName: string;
  /**
   * `null` means the balance has not arrived. It is a **separate state**, not a
   * zero — see the loading branch below for why that distinction is the whole
   * point of this component.
   */
  readonly balance: Money | null;
  readonly classification: BalanceClassification | null;
  readonly lastEntryTransactionTime?: string | null;
};

const TONE_CLASS = {
  receivable: "text-ink",
  settled: "text-leaf",
  credit: "text-info",
} as const;

/**
 * The answer to "Anh Tuấn nợ bao nhiêu?" — the question the product exists to
 * answer, and the one place a rendering mistake costs real money.
 *
 * Two rules, both structural rather than remembered:
 *
 * **It never shows a number while loading.** A worker who reads a `0 ₫`
 * placeholder as a balance collects nothing from somebody who owes twelve
 * million. The loading branch renders a skeleton and returns; there is no path
 * through this component that formats a balance it does not have.
 *
 * **It never shows a credit as a negative debt.** The wording comes from
 * `classification`, which the server computed (BR-ACCOUNT-009), and `describeBalance`
 * never inspects the sign. A customer who paid ahead reads "Vựa nợ khách
 * 500.000 ₫", not "nợ −500.000 ₫" — the second sends somebody to collect money
 * from a person the depot owes.
 */
export function BalanceCard({
  customerName,
  balance,
  classification,
  lastEntryTransactionTime,
}: BalanceCardProps) {
  const isLoading = balance === null || classification === null;

  return (
    <section
      aria-label={`Công nợ của ${customerName}`}
      className="rounded-card border border-border bg-surface p-4"
    >
      <p className="text-body-sm text-ink-muted">{customerName}</p>

      {isLoading ? (
        <div className="mt-2">
          <Skeleton width="w-40" height="h-8" label="Đang tải công nợ" />
        </div>
      ) : (
        <BalanceAmount balance={balance} classification={classification} />
      )}

      {!isLoading && lastEntryTransactionTime != null ? (
        <p className="mt-2 text-caption text-ink-muted">
          Giao dịch gần nhất: {formatInstant(lastEntryTransactionTime)}
        </p>
      ) : null}
    </section>
  );
}

function BalanceAmount({
  balance,
  classification,
}: {
  balance: Money;
  classification: BalanceClassification;
}) {
  const described = describeBalance(balance, classification);

  return (
    <div className="mt-1">
      <p className="text-label font-semibold text-ink-muted">{described.label}</p>
      <p className={`tabular text-display font-bold ${TONE_CLASS[described.tone]}`}>
        {/* `settled` has no amount: "Hết nợ" says it, and "0 ₫" reads like a
            placeholder that failed to fill in. */}
        {described.amount ?? "—"}
      </p>
    </div>
  );
}

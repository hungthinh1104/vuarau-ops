import type { ReactNode } from "react";

export type ConfirmationLine = {
  readonly label: string;
  readonly value: string;
};

export type ConfirmationSummaryProps = {
  readonly subject: string;
  readonly lines: readonly ConfirmationLine[];
  /** What this does to the books, in a sentence. Not a restatement of the lines. */
  readonly consequence: string;
  /** Shown in amber. For a threshold breach or an override, not for every action. */
  readonly warning?: string;
  /** The reason field, when the command requires one (void, reversal, adjustment). */
  readonly reason?: ReactNode;
  /** The impact preview. Rendered above the command button, never below it. */
  readonly impact?: ReactNode;
  /**
   * The command button. Its label names the command — "Ghi nhận thanh toán" —
   * because "Lưu" and "OK" tell nobody what they just agreed to (design.md).
   */
  readonly action: ReactNode;
};

/**
 * The last thing somebody sees before money moves.
 *
 * design.md lists what it must contain — subject, transaction lines, amount,
 * business consequence, warning, reason when required, explicit command button —
 * and the ordering here is that list, because the order is the argument: what is
 * being done, to what, with what effect, and only then the button.
 */
export function ConfirmationSummary({
  subject,
  lines,
  consequence,
  warning,
  reason,
  impact,
  action,
}: ConfirmationSummaryProps) {
  return (
    <section
      aria-label={`Xác nhận: ${subject}`}
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4"
    >
      <div>
        <h3 className="text-subheading font-semibold text-ink">{subject}</h3>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
          {lines.map((line) => (
            <div key={line.label} className="contents">
              <dt className="text-ink-muted">{line.label}</dt>
              <dd className="tabular text-right text-ink">{line.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {impact}

      <p className="text-body-sm text-ink">{consequence}</p>

      {warning !== undefined ? (
        <p className="rounded-card border border-warning/30 bg-warning-soft px-3 py-2 text-body-sm text-warning">
          {warning}
        </p>
      ) : null}

      {reason}

      <div className="flex justify-end">{action}</div>
    </section>
  );
}

import type { Money } from "@vuarau/domain-contracts";
import { formatMoney, formatSignedMoney } from "../format.ts";

export type MoneyValueTone = "neutral" | "danger" | "success" | "warning";

export type MoneyValueProps = {
  readonly value: Money | number;
  /**
   * If a number is provided without a currency, it defaults to VND.
   * A full Money object is preferred for safety.
   */
  readonly currency?: "VND";
  /**
   * Whether to explicitly show the sign (+ or −) before the value.
   * Useful for ledger lines or previewing impacts.
   */
  readonly showSign?: boolean;
  /**
   * Visual tone must be explicitly supplied by the caller/domain context.
   * It must never be inferred solely from whether the numeric value is positive or negative.
   */
  readonly tone?: MoneyValueTone;
  readonly className?: string;
};

const TONE_CLASSES: Record<MoneyValueTone, string> = {
  neutral: "text-ink",
  danger: "text-danger-strong",
  success: "text-leaf-strong",
  warning: "text-warning-strong",
};

/**
 * Renders tabular numerals and canonical monetary formatting.
 *
 * Neutral by default. Visual tone must be explicitly supplied by the caller/domain context
 * and must never be inferred solely from whether the numeric value is positive or negative.
 */
export function MoneyValue({
  value,
  currency = "VND",
  showSign = false,
  tone = "neutral",
  className,
}: MoneyValueProps) {
  const money: Money = typeof value === "number" ? { amountMinor: value, currency } : value;

  const formatted = showSign ? formatSignedMoney(money) : formatMoney(money);

  return (
    <span className={["tabular-nums", TONE_CLASSES[tone], className].filter(Boolean).join(" ")}>
      {formatted}
    </span>
  );
}

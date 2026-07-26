import type { BalanceClassification, Money, Quantity } from "@vuarau/domain-contracts";
import { CURRENCY_EXPONENT, QUANTITY_SCALE, UNIT_LABEL_VI } from "@vuarau/domain-contracts";

/**
 * Presentation only. Nothing here decides anything.
 *
 * The line between this file and the backend is not "simple vs complex" — it is
 * **arithmetic that affects money vs. rendering of a number that has already been
 * decided**. Line totals, balances, remaining reversible amounts and balance
 * classifications all arrive computed (ADR-0003); this turns them into Vietnamese
 * text and nothing more.
 *
 * The one calculation that does appear — dividing by the currency exponent — is
 * not a business rule, it is the definition of the unit, and it is here so that
 * exactly one place in the browser knows it.
 */

const VI = "vi-VN";

/** `875000` → `"875.000"`. Sign is not rendered; callers decide what it means. */
function groupDigits(minor: number, exponent: number): string {
  const magnitude = Math.abs(minor) / 10 ** exponent;
  return new Intl.NumberFormat(VI, {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(magnitude);
}

/**
 * `{ amountMinor: 875000, currency: "VND" }` → `"875.000 ₫"`.
 *
 * Never abbreviated to `875k` or `12,5tr`. A transactional amount that a worker
 * has to check against a paper book must be readable digit for digit; the
 * abbreviation is for dashboards, and this product does not start with one.
 */
export function formatMoney(money: Money): string {
  return `${groupDigits(money.amountMinor, CURRENCY_EXPONENT[money.currency])} ₫`;
}

/** With an explicit sign, for a ledger line or a preview of an impact. */
export function formatSignedMoney(money: Money): string {
  const sign = money.amountMinor < 0 ? "−" : money.amountMinor > 0 ? "+" : "";
  return `${sign}${formatMoney(money)}`;
}

/** `{ valueScaled: 12500, unit: "kg" }` → `"12,5 kg"`. */
export function formatQuantity(quantity: Quantity): string {
  const value = quantity.valueScaled / QUANTITY_SCALE;
  const text = new Intl.NumberFormat(VI, { maximumFractionDigits: 3 }).format(value);
  return `${text} ${UNIT_LABEL_VI[quantity.unit]}`;
}

/**
 * A balance, worded by its **classification** and never by its sign.
 *
 * This is the single most dangerous formatting decision in the product. A
 * customer who paid ahead has a balance of `−500.000 ₫`, and rendering that as
 * "nợ −500.000" sends a worker to collect money from somebody the depot owes.
 * `classification` comes from the server (BR-ACCOUNT-009) precisely so that this
 * function never has to look at the sign — and it does not.
 */
export function describeBalance(
  balance: Money,
  classification: BalanceClassification,
): { label: string; amount: string | null; tone: "receivable" | "settled" | "credit" } {
  switch (classification) {
    case "receivable":
      return { label: "Còn nợ", amount: formatMoney(balance), tone: "receivable" };
    case "settled":
      // Said plainly rather than shown as "0 ₫", which reads like a placeholder.
      return { label: "Hết nợ", amount: null, tone: "settled" };
    case "customer_credit":
      return { label: "Vựa nợ khách", amount: formatMoney(balance), tone: "credit" };
  }
}

const DATE_TIME = new Intl.DateTimeFormat(VI, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const DATE_ONLY = new Intl.DateTimeFormat(VI, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatInstant(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return DATE_ONLY.format(new Date(iso));
}

/**
 * Both timestamps, and only when they differ.
 *
 * `transactionTime` is when it happened; `recordedAt` is when we wrote it down
 * (docs/07-data/time-semantics.md). They differ when a sale was back-dated or
 * captured offline, and that gap is exactly what somebody reconciling a
 * disputed balance needs to see. When they agree, showing both is noise.
 */
export function formatRecordedGap(transactionTime: string, recordedAt: string): string | null {
  const happened = new Date(transactionTime).getTime();
  const written = new Date(recordedAt).getTime();
  // A second of clock jitter between the two is not a back-dated entry.
  return Math.abs(written - happened) < 1_000 ? null : `Ghi lúc ${formatInstant(recordedAt)}`;
}

import type { CurrencyCode, Money, Quantity, Unit } from "@vuarau/domain-contracts";
import { CURRENCY_EXPONENT, QUANTITY_SCALE } from "@vuarau/domain-contracts";

/**
 * Turning typed text into an **exact integer**, or refusing.
 *
 * Money is an integer count of the currency's smallest unit and quantity is an
 * integer count of milli-units (ADR-0006). A browser that parses "12.5" into a
 * float and hands it over has reintroduced exactly the rounding error integer
 * money was chosen to avoid, and it does so silently.
 *
 * So parsing is strict rather than forgiving: text that does not land exactly on
 * a whole minor unit is **rejected with a reason**, never rounded. Rounding is a
 * business rule; it lives in the domain kernel, in one place, with a test
 * (BR-SALE-004), and this file does not get a second copy of it.
 */

export type ParseResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

/** Accepts `1.234.567`, `1234567`, `1 234 567`. Vietnamese groups with `.`. */
function normalise(raw: string): string {
  return raw.replaceAll(".", "").replaceAll(" ", "").replaceAll(" ", "").replace(",", ".");
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

/** Empty is `null`, not an error: a field nobody has filled in yet is not wrong. */
export function parseMoneyText(raw: string, currency: CurrencyCode): ParseResult<Money | null> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: null };

  const text = normalise(trimmed);
  if (!NUMERIC.test(text)) {
    return { ok: false, reason: "Chỉ nhập số. Ví dụ: 875.000" };
  }

  const exponent = CURRENCY_EXPONENT[currency];
  const scaled = Number(text) * 10 ** exponent;
  if (!Number.isInteger(scaled)) {
    return exponent === 0
      ? { ok: false, reason: "Tiền đồng không có số lẻ. Ví dụ: 875.000" }
      : { ok: false, reason: `Tối đa ${exponent} chữ số thập phân.` };
  }

  return { ok: true, value: { amountMinor: scaled, currency } };
}

export function parseQuantityText(raw: string, unit: Unit): ParseResult<Quantity | null> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: null };

  const text = normalise(trimmed);
  if (!NUMERIC.test(text)) {
    return { ok: false, reason: "Chỉ nhập số. Ví dụ: 12,5" };
  }

  const scaled = Number(text) * QUANTITY_SCALE;
  if (!Number.isInteger(scaled)) {
    return { ok: false, reason: "Tối đa 3 chữ số sau dấu phẩy." };
  }

  return { ok: true, value: { valueScaled: scaled, unit } };
}

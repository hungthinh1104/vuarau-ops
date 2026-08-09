import type { CurrencyCode, Money, Quantity, Unit } from "@vuarau/domain-contracts";
import { CURRENCY_EXPONENT, QUANTITY_SCALE } from "@vuarau/domain-contracts";

export type ParseResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

function normalise(raw: string): string {
  return raw.replaceAll(".", "").replaceAll(" ", "").replaceAll(" ", "").replace(",", ".");
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

function parseScaledInteger(text: string, fractionDigits: number): number | null {
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = unsigned.split(".");
  if (fraction.length > fractionDigits) return null;

  // Use BigInt while parsing user input. Multiplying a Number here would make
  // a valid-looking large amount approximate before the safe-integer guard can
  // reject it.
  const digits = `${whole}${fraction.padEnd(fractionDigits, "0")}`.replace(/^0+(?=\d)/, "");
  const magnitude = BigInt(digits || "0");
  const signed = negative ? -magnitude : magnitude;
  const value = Number(signed);
  return Number.isSafeInteger(value) ? value : null;
}

export function parseMoneyText(raw: string, currency: CurrencyCode): ParseResult<Money | null> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: null };

  const text = normalise(trimmed);
  if (!NUMERIC.test(text)) return { ok: false, reason: "Chỉ nhập số. Ví dụ: 875.000" };

  const exponent = CURRENCY_EXPONENT[currency];
  const scaled = parseScaledInteger(text, exponent);
  if (scaled === null && text.includes(".")) {
    return exponent === 0
      ? { ok: false, reason: "Tiền đồng không có số lẻ. Ví dụ: 875.000" }
      : { ok: false, reason: `Tối đa ${exponent} chữ số thập phân.` };
  }
  if (scaled === null) {
    return { ok: false, reason: "Số tiền quá lớn hoặc không còn chính xác." };
  }

  return { ok: true, value: { amountMinor: scaled, currency } };
}

export function parseQuantityText(raw: string, unit: Unit): ParseResult<Quantity | null> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: null };

  const text = normalise(trimmed);
  if (!NUMERIC.test(text)) return { ok: false, reason: "Chỉ nhập số. Ví dụ: 12,5" };

  const scaled = parseScaledInteger(text, 3);
  if (scaled === null && text.includes(".")) {
    return { ok: false, reason: "Tối đa 3 chữ số sau dấu phẩy." };
  }
  if (scaled === null) {
    return { ok: false, reason: "Số lượng quá lớn hoặc không còn chính xác." };
  }

  return { ok: true, value: { valueScaled: scaled, unit } };
}

/** A stable raw value for controlled inputs when editing an existing quantity. */
export function formatQuantityInput(quantity: Quantity): string {
  const negative = quantity.valueScaled < 0;
  const magnitude = Math.abs(quantity.valueScaled);
  const whole = Math.floor(magnitude / QUANTITY_SCALE);
  const fraction = String(magnitude % QUANTITY_SCALE)
    .padStart(3, "0")
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction.length === 0 ? "" : `,${fraction}`}`;
}

/** A stable raw value for controlled money inputs when editing an existing amount. */
export function formatMoneyInput(money: Money): string {
  if (CURRENCY_EXPONENT[money.currency] === 0) return String(money.amountMinor);
  return String(money.amountMinor / 10 ** CURRENCY_EXPONENT[money.currency]).replace(".", ",");
}

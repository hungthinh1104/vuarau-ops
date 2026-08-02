import type { CurrencyCode, Money, Quantity, Unit } from "@vuarau/domain-contracts";
import { CURRENCY_EXPONENT, QUANTITY_SCALE } from "@vuarau/domain-contracts";

export type ParseResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

function normalise(raw: string): string {
  return raw.replaceAll(".", "").replaceAll(" ", "").replaceAll(" ", "").replace(",", ".");
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

export function parseMoneyText(raw: string, currency: CurrencyCode): ParseResult<Money | null> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: null };

  const text = normalise(trimmed);
  if (!NUMERIC.test(text)) return { ok: false, reason: "Chỉ nhập số. Ví dụ: 875.000" };

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
  if (!NUMERIC.test(text)) return { ok: false, reason: "Chỉ nhập số. Ví dụ: 12,5" };

  const scaled = Number(text) * QUANTITY_SCALE;
  if (!Number.isInteger(scaled)) return { ok: false, reason: "Tối đa 3 chữ số sau dấu phẩy." };

  return { ok: true, value: { valueScaled: scaled, unit } };
}

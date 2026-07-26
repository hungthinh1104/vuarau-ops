import { z } from "zod";

/**
 * Money is an integer count of the currency's smallest unit, never a float.
 *
 * For VND the smallest unit is the đồng itself (exponent 0) — there are no xu in
 * circulation. The `currency` field is carried explicitly anyway so that a
 * currency with an exponent can be added without rewriting every ledger row.
 *
 * See docs/07-data/data-model.md and ADR-0006.
 */

export const CURRENCY_CODES = ["VND"] as const;
export const currencyCodeSchema = z.enum(CURRENCY_CODES);
export type CurrencyCode = z.infer<typeof currencyCodeSchema>;

/** Decimal places between the minor unit and the display unit, per currency. */
export const CURRENCY_EXPONENT: Readonly<Record<CurrencyCode, number>> = {
  VND: 0,
};

export const DEFAULT_CURRENCY: CurrencyCode = "VND";

/**
 * Signed on purpose: a ledger entry that reduces debt is negative, and a debt
 * summary may legitimately be negative (customer credit).
 *
 * Command payloads use this schema even where only a positive amount is
 * meaningful. Schemas validate *shape*; the domain validates *policy*
 * (ADR-0003). A `z.int().positive()` here would refuse a zero payment with the
 * generic `INVALID_COMMAND_PAYLOAD` and shadow `PAYMENT_AMOUNT_INVALID`, which is
 * the stable code BR-PAYMENT-001 promises and the client branches on.
 */
export const moneySchema = z.object({
  amountMinor: z.int(),
  currency: currencyCodeSchema,
});
export type Money = z.infer<typeof moneySchema>;

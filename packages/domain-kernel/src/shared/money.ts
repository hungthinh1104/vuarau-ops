import type { CurrencyCode, Money } from "@vuarau/domain-contracts";

/**
 * Raised when a persisted or derived money value cannot be represented exactly
 * by the number-based DTO contract. Application boundaries translate this into
 * the stable PERSISTED_NUMBER_OUT_OF_RANGE rejection; callers must never see a
 * rounded balance.
 */
export class ExactMoneyArithmeticError extends RangeError {
  readonly field: string;

  constructor(field = "money.amount_minor") {
    super("Money arithmetic exceeds the exact integer range.");
    this.name = "ExactMoneyArithmeticError";
    this.field = field;
  }
}

/** Raised when a derived integer quantity cannot be represented exactly. */
export class ExactIntegerArithmeticError extends RangeError {
  readonly field: string;

  constructor(field = "integer.aggregate") {
    super("Integer arithmetic exceeds the exact supported range.");
    this.name = "ExactIntegerArithmeticError";
    this.field = field;
  }
}

/**
 * Integer money arithmetic. Every operation here is exact — there is no rounding
 * in this file, because addition and subtraction of integers do not need any.
 * The one place rounding happens is `quantity.ts` (BR-SALE-004).
 */

export function money(amountMinor: number, currency: CurrencyCode): Money {
  return { amountMinor, currency };
}

export function zeroMoney(currency: CurrencyCode): Money {
  return { amountMinor: 0, currency };
}

/**
 * Adding two amounts in different currencies is always a bug, and one that would
 * otherwise produce a plausible-looking number. Callers check currency agreement
 * before calling and turn a mismatch into a rejection code with context; by the
 * time we are here, disagreement means the check was skipped.
 */
function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(
      `Currency mismatch in money arithmetic: ${a.currency} vs ${b.currency}. ` +
        "Callers must reject mismatched currencies before reaching this point.",
    );
  }
}

function assertSafeAmount(amountMinor: number, field: string): void {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new ExactMoneyArithmeticError(field);
  }
}

function exactResult(value: bigint, field: string): number {
  if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ExactMoneyArithmeticError(field);
  }
  const result = Number(value);
  assertSafeAmount(result, field);
  return result;
}

export function addMoney(a: Money, b: Money, field = "money.amount_minor"): Money {
  assertSameCurrency(a, b);
  if (!Number.isSafeInteger(a.amountMinor) || !Number.isSafeInteger(b.amountMinor)) {
    throw new ExactMoneyArithmeticError(field);
  }
  const amountMinor = exactResult(BigInt(a.amountMinor) + BigInt(b.amountMinor), field);
  return { amountMinor, currency: a.currency };
}

export function subtractMoney(a: Money, b: Money, field = "money.amount_minor"): Money {
  assertSameCurrency(a, b);
  if (!Number.isSafeInteger(a.amountMinor) || !Number.isSafeInteger(b.amountMinor)) {
    throw new ExactMoneyArithmeticError(field);
  }
  const amountMinor = exactResult(BigInt(a.amountMinor) - BigInt(b.amountMinor), field);
  return { amountMinor, currency: a.currency };
}

export function negateMoney(a: Money): Money {
  if (!Number.isSafeInteger(a.amountMinor)) {
    throw new ExactMoneyArithmeticError("money.amount_minor");
  }
  const amountMinor = exactResult(-BigInt(a.amountMinor), "money.amount_minor");
  return { amountMinor, currency: a.currency };
}

/** Exact integer arithmetic for aggregates that are not represented as Money yet. */
export function sumExactIntegers(values: readonly number[]): number | null {
  let total = 0n;
  for (const value of values) {
    if (!Number.isSafeInteger(value)) return null;
    total += BigInt(value);
    if (total < BigInt(Number.MIN_SAFE_INTEGER) || total > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null;
    }
  }
  return Number(total);
}

export function subtractExactIntegers(left: number, right: number): number | null {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) return null;
  const result = BigInt(left) - BigInt(right);
  if (result < BigInt(Number.MIN_SAFE_INTEGER) || result > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }
  return Number(result);
}

export function exactIntegerSum(values: readonly number[], field = "integer.aggregate"): number {
  const result = sumExactIntegers(values);
  if (result === null) throw new ExactIntegerArithmeticError(field);
  return result;
}

export function exactIntegerDifference(
  left: number,
  right: number,
  field = "integer.difference",
): number {
  const result = subtractExactIntegers(left, right);
  if (result === null) throw new ExactIntegerArithmeticError(field);
  return result;
}

export function sumMoney(amounts: readonly Money[], currency: CurrencyCode): Money {
  const total = sumMoneyExact(amounts, currency);
  if (total === null) {
    throw new ExactMoneyArithmeticError("money.aggregate.amount_minor");
  }
  return total;
}

/**
 * Returns null instead of approximating when an aggregate crosses the safe
 * integer boundary. Command decisions use this form so the caller can return
 * a controlled domain refusal; the throwing form above remains for internal
 * arithmetic whose inputs have already passed an aggregate boundary.
 */
export function sumMoneyExact(amounts: readonly Money[], currency: CurrencyCode): Money | null {
  let amountMinor = 0n;
  for (const next of amounts) {
    assertSameCurrency({ amountMinor: Number(amountMinor), currency }, next);
    if (!Number.isSafeInteger(next.amountMinor)) return null;
    amountMinor += BigInt(next.amountMinor);
    if (
      amountMinor < BigInt(Number.MIN_SAFE_INTEGER) ||
      amountMinor > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      return null;
    }
  }
  return { amountMinor: Number(amountMinor), currency };
}

export function isPositiveMoney(a: Money): boolean {
  return a.amountMinor > 0;
}

export function isZeroMoney(a: Money): boolean {
  return a.amountMinor === 0;
}

export function moneyEquals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amountMinor === b.amountMinor;
}

/** Returns a negative number when `a < b`, zero when equal, positive when `a > b`. */
export function compareMoney(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return a.amountMinor < b.amountMinor ? -1 : a.amountMinor > b.amountMinor ? 1 : 0;
}

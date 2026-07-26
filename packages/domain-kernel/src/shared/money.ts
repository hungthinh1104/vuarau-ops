import type { CurrencyCode, Money } from "@vuarau/domain-contracts";

/**
 * Integer money arithmetic. Every operation here is exact — there is no rounding
 * in this file, because addition and subtraction of integers do not need any.
 * The one place rounding happens is `quantity.ts` (BR-ORDER-004).
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

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

export function negateMoney(a: Money): Money {
  return { amountMinor: -a.amountMinor, currency: a.currency };
}

export function sumMoney(amounts: readonly Money[], currency: CurrencyCode): Money {
  return amounts.reduce<Money>((total, next) => addMoney(total, next), zeroMoney(currency));
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
  return a.amountMinor - b.amountMinor;
}

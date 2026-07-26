import type { Money, Quantity } from "@vuanha/domain-contracts";
import { QUANTITY_SCALE } from "@vuanha/domain-contracts";

/**
 * BR-ORDER-004 — the only division in the system, and therefore the only place a
 * rounding decision is made.
 *
 *     lineTotal = roundHalfUp(quantity.valueScaled × unitPrice.amountMinor / 1000)
 *
 * Half-up, because that is what a market trader does by hand, and because
 * "round half to even" would surprise everyone who checks the arithmetic on paper.
 */

/**
 * Naively this is `(scaled × price + 500) / 1000`, but that intermediate product
 * can exceed `Number.MAX_SAFE_INTEGER` for large quantities of expensive goods,
 * and silently lose precision — in a money calculation.
 *
 * Splitting the quantity into whole units and a sub-unit remainder keeps both
 * products small: the remainder is < 1000 by construction, and the whole-unit
 * product is the same magnitude as the answer itself.
 */
export function calculateLineTotal(quantity: Quantity, unitPrice: Money): Money {
  const wholeUnits = Math.floor(quantity.valueScaled / QUANTITY_SCALE);
  const remainder = quantity.valueScaled % QUANTITY_SCALE;

  const wholePart = wholeUnits * unitPrice.amountMinor;
  const fractionalPart = roundHalfUp(remainder * unitPrice.amountMinor, QUANTITY_SCALE);

  return {
    amountMinor: wholePart + fractionalPart,
    currency: unitPrice.currency,
  };
}

/**
 * Integer half-up division for non-negative numerators. Both order quantities and
 * unit prices are non-negative (BR-ORDER-003), so the negative case cannot arise
 * and is not silently given a rounding direction it was never assigned.
 */
export function roundHalfUp(numerator: number, denominator: number): number {
  if (numerator < 0) {
    throw new Error(
      `roundHalfUp received a negative numerator (${numerator}); ` +
        "no rounding direction is defined for negative amounts in this system.",
    );
  }
  return Math.floor((numerator + denominator / 2) / denominator);
}

/**
 * Guards the calculation against magnitudes where JavaScript integers stop being
 * exact. Realistic depot amounts sit six orders of magnitude below this; a value
 * that trips it is a data-entry error or an attack, and either way must not be
 * turned into an approximate debt.
 */
export function isExactMoneyAmount(amountMinor: number): boolean {
  return Number.isSafeInteger(amountMinor);
}

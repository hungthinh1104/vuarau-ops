import { z } from "zod";
import type { Money } from "./money.ts";

/**
 * Quantities are integers in milli-units (scale 1000), never floats.
 *
 * A depot sells 1.5 kg of rau and half a thùng of cà chua. Representing that as a
 * float and multiplying by a unit price reintroduces exactly the rounding error
 * that integer money was chosen to avoid. 1.5 kg is stored as
 * `{ valueScaled: 1500, unit: "kg" }`.
 *
 * Line total arithmetic and its rounding rule are at the foot of this file
 * (BR-SALE-004), re-exported by the kernel.
 */

export const QUANTITY_SCALE = 1000;

/**
 * Units actually used on a Vietnamese wholesale vegetable depot floor.
 * Enum values are ASCII for storage; Vietnamese display labels live beside them
 * so that no layer has to invent its own translation table.
 */
export const UNITS = ["kg", "gram", "lang", "bo", "thung", "ro", "kien", "cai"] as const;
export const unitSchema = z.enum(UNITS);
export type Unit = z.infer<typeof unitSchema>;

export const UNIT_LABEL_VI: Readonly<Record<Unit, string>> = {
  kg: "kg",
  gram: "gram",
  lang: "lạng",
  bo: "bó",
  thung: "thùng",
  ro: "rổ",
  kien: "kiện",
  cai: "cái",
};

/**
 * Units are deliberately NOT convertible to one another here. `lang` is 100 g by
 * dictionary definition but a `bo` of rau muống has no fixed mass, and a depot
 * prices per-unit-as-sold. Conversion is a pricing/inventory concern and is out
 * of scope for this slice — see docs/09-decisions/decision-backlog.md ASM-011.
 */
export const quantitySchema = z.object({
  /**
   * Positivity is enforced by the domain (BR-SALE-003), not here, so that a
   * zero-quantity line is refused with `SALE_LINE_INVALID` and the index of the
   * line that is wrong — not a generic schema error.
   */
  valueScaled: z.int(),
  unit: unitSchema,
});
export type Quantity = z.infer<typeof quantitySchema>;

/**
 * BR-SALE-004 — the only division in the system, and therefore the only place a
 * rounding decision is made.
 *
 *     lineTotal = roundHalfUp(quantity.valueScaled × unitPrice.amountMinor / 1000)
 *
 * Half-up, because that is what a market trader does by hand, and because "round
 * half to even" would surprise everyone who checks the arithmetic on paper.
 *
 * It lives here, beside the role table and `classifyBalance`, for the same
 * reason those do: it involves no aggregate state, and the API and the browser
 * must agree on it **exactly**. A worker reads the line total aloud to the
 * customer before the sale is posted, so a second implementation in the browser
 * is a number the customer is told and a different number they are charged. The
 * kernel re-exports this, so there is one copy and every caller reaches it.
 *
 * Naively this is `(scaled × price + 500) / 1000`, but that intermediate product
 * can exceed `Number.MAX_SAFE_INTEGER` for large quantities of expensive goods,
 * and silently lose precision — in a money calculation. Splitting the quantity
 * into whole units and a sub-unit remainder keeps both products small: the
 * remainder is < 1000 by construction, and the whole-unit product is the same
 * magnitude as the answer itself.
 */
export function calculateLineTotal(quantity: Quantity, unitPrice: Money): Money {
  const wholeUnits = Math.floor(quantity.valueScaled / QUANTITY_SCALE);
  const remainder = quantity.valueScaled % QUANTITY_SCALE;

  const wholePart = wholeUnits * unitPrice.amountMinor;
  const fractionalPart = roundHalfUp(remainder * unitPrice.amountMinor, QUANTITY_SCALE);

  return { amountMinor: wholePart + fractionalPart, currency: unitPrice.currency };
}

/**
 * Integer half-up division for non-negative numerators. Both sale quantities and
 * unit prices are non-negative (BR-SALE-003), so the negative case cannot arise
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

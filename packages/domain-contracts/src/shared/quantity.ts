import { z } from "zod";

/**
 * Quantities are integers in milli-units (scale 1000), never floats.
 *
 * A depot sells 1.5 kg of rau and half a thùng of cà chua. Representing that as a
 * float and multiplying by a unit price reintroduces exactly the rounding error
 * that integer money was chosen to avoid. 1.5 kg is stored as
 * `{ valueScaled: 1500, unit: "kg" }`.
 *
 * Line total arithmetic and its rounding rule live in
 * `@vuarau/domain-kernel/shared/quantity` (BR-SALE-004).
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
   * zero-quantity line is refused with `ORDER_LINE_INVALID` and the index of the
   * line that is wrong — not a generic schema error.
   */
  valueScaled: z.int(),
  unit: unitSchema,
});
export type Quantity = z.infer<typeof quantitySchema>;

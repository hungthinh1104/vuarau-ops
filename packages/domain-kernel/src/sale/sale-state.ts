import type { SaleDueState, SaleFinancialState, IsoInstant } from "@vuarau/domain-contracts";
import type { SaleState } from "../shared/state.ts";

/**
 * The two states a sale has that are **not** stored (state catalog).
 *
 * Both are derived at read time from data that already exists. Storing either
 * would create a row something has to keep true — and in the void case, keeping
 * it true would mean updating a sale the system has promised never to update.
 */

/**
 * BR-SALE-013. `null` for a draft: a draft has no financial effect, so it has no
 * financial state to report.
 */
export function saleFinancialState(sale: SaleState): SaleFinancialState | null {
  if (sale.status !== "posted") {
    return null;
  }
  return sale.voidRecord === null ? "active" : "voided";
}

/**
 * BR-SALE-017. `no_due_date` is not a synonym for `overdue`: most depot sales
 * carry no term, and treating "no date agreed" as "late" would put nearly every
 * customer on a chase list the day they buy.
 *
 * `asOf` is passed in rather than read, because the kernel reads no clock.
 */
export function saleDueState(sale: SaleState, asOf: IsoInstant): SaleDueState {
  if (sale.dueAt === null) {
    return "no_due_date";
  }
  return Date.parse(sale.dueAt) < Date.parse(asOf) ? "overdue" : "due";
}

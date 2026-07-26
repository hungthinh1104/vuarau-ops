import type {
  CurrencyCode,
  Money,
  OrderLineId,
  ProductId,
  Quantity,
} from "@vuanha/domain-contracts";
import type { OrderLineState } from "../shared/state.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";
import { calculateLineTotal, isExactMoneyAmount } from "../shared/quantity.ts";
import { sumMoney } from "../shared/money.ts";

/**
 * The line fields every caller has, whether it came off the wire or out of the
 * database. Validation and totalling are the same in both directions, so they are
 * written once (BR-ORDER-001, BR-ORDER-003, BR-ORDER-009).
 */
export type OrderLineLike = {
  readonly lineId: OrderLineId;
  readonly productId: ProductId;
  readonly productName: string;
  readonly quantity: Quantity;
  readonly unitPrice: Money;
};

/**
 * Validates every line and computes its total.
 *
 * Runs on creation *and* again on confirmation. Re-validating at confirm time is
 * not redundant: the rows have been in the database in between, and confirmation
 * is the step that turns them into a debt.
 */
export function validateOrderLines(
  lines: readonly OrderLineLike[],
  currency: CurrencyCode,
): DomainResult<readonly OrderLineState[]> {
  const validated: OrderLineState[] = [];

  for (const [index, line] of lines.entries()) {
    const invalid = (problem: string) =>
      err<readonly OrderLineState[]>(
        "ORDER_LINE_INVALID",
        `Order line ${index} is invalid: ${problem}.`,
        {
          lineIndex: index,
          lineId: line.lineId,
          problem,
        },
      );

    if (line.productName.trim().length === 0) {
      return invalid("product name is blank");
    }
    if (!Number.isInteger(line.quantity.valueScaled) || line.quantity.valueScaled <= 0) {
      return invalid("quantity must be a positive integer number of milli-units");
    }
    if (!Number.isInteger(line.unitPrice.amountMinor) || line.unitPrice.amountMinor < 0) {
      return invalid("unit price must be a non-negative integer");
    }
    if (line.unitPrice.currency !== currency) {
      return err<readonly OrderLineState[]>(
        "ORDER_CURRENCY_MISMATCH",
        `Order line ${index} is priced in ${line.unitPrice.currency} but the order is in ${currency}.`,
        {
          lineIndex: index,
          lineId: line.lineId,
          expected: currency,
          actual: line.unitPrice.currency,
        },
      );
    }

    const lineTotal = calculateLineTotal(line.quantity, line.unitPrice);
    if (!isExactMoneyAmount(lineTotal.amountMinor)) {
      return invalid("quantity × unit price exceeds the exact-integer range");
    }

    validated.push({
      lineId: line.lineId,
      productId: line.productId,
      productName: line.productName,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal,
    });
  }

  return ok(validated);
}

/** BR-ORDER-001. The only way an order total is ever produced. */
export function calculateOrderTotal(
  lines: readonly OrderLineState[],
  currency: CurrencyCode,
): Money {
  return sumMoney(
    lines.map((line) => line.lineTotal),
    currency,
  );
}

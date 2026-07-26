import type { ConfirmOrderCommand, IsoInstant } from "@vuarau/domain-contracts";
import type { Decision, LedgerEntryDraft } from "../shared/effects.ts";
import type { OrderState } from "../shared/state.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";
import { calculateOrderTotal, validateOrderLines } from "./order-lines.ts";

export type ConfirmOrderInput = {
  readonly command: ConfirmOrderCommand;
  readonly order: OrderState;
  readonly recordedAt: IsoInstant;
};

/**
 * T-ORDER-002 — the moment a customer starts owing money.
 *
 * Check order matters. The version is checked first (BR-ORDER-006): if another
 * worker has already confirmed this order, the caller's view is stale, and
 * "someone else changed this" is a more truthful answer than "already confirmed".
 *
 * A network retry never reaches here — the idempotency layer answers it with the
 * original result (BR-COMMAND-001). Anything arriving at this function is a
 * genuine second attempt.
 */
export function decideConfirmOrder({
  command,
  order,
  recordedAt,
}: ConfirmOrderInput): DomainResult<Decision<OrderState>> {
  if (command.expectedVersion !== order.version) {
    return err(
      "ORDER_VERSION_CONFLICT",
      `Order was modified by someone else: expected version ${command.expectedVersion}, found ${order.version}.`,
      { orderId: order.id, expectedVersion: command.expectedVersion, actualVersion: order.version },
    );
  }

  if (order.status === "confirmed") {
    return err("ORDER_ALREADY_CONFIRMED", "This order has already been confirmed.", {
      orderId: order.id,
      status: order.status,
    });
  }

  if (order.status === "cancelled") {
    return err("ORDER_CANCELLED", "This order was cancelled and cannot be confirmed.", {
      orderId: order.id,
      status: order.status,
    });
  }

  if (order.lines.length === 0) {
    return err("ORDER_EMPTY", "An order cannot be confirmed without at least one line.", {
      orderId: order.id,
    });
  }

  // Re-validated and re-totalled at confirmation: these rows have been sitting in
  // the database, and this is the step that turns them into a debt (BR-ORDER-001).
  const lines = validateOrderLines(order.lines, order.currency);
  if (!lines.ok) {
    return err(lines.error.code, lines.error.message, lines.error.details);
  }

  const totalAmount = calculateOrderTotal(lines.value, order.currency);

  const confirmed: OrderState = {
    ...order,
    status: "confirmed",
    lines: lines.value,
    totalAmount,
    version: order.version + 1,
    confirmedAt: command.occurredAt,
  };

  // BR-ORDER-007 — exactly one entry, for exactly the order total.
  const ledgerEntry: LedgerEntryDraft = {
    workspaceId: order.workspaceId,
    customerId: order.customerId,
    amount: totalAmount,
    sourceType: "order_confirmation",
    sourceId: order.id,
    reversalOfEntryId: null,
    reasonCode: null,
    reason: null,
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    commandId: command.commandId,
  };

  return ok({
    aggregate: confirmed,
    ledgerEntries: [ledgerEntry],
    audit: {
      aggregateType: "order",
      aggregateId: order.id,
      action: "order.confirmed",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { status: order.status, version: order.version },
      after: {
        status: confirmed.status,
        version: confirmed.version,
        totalMinor: totalAmount.amountMinor,
        currency: order.currency,
      },
      reason: null,
    },
  });
}

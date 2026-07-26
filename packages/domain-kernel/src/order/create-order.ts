import type { CreateOrderCommand, IsoInstant } from "@vuanha/domain-contracts";
import type { Decision } from "../shared/effects.ts";
import type { OrderState } from "../shared/state.ts";
import type { DomainResult } from "../shared/result.ts";
import { ok } from "../shared/result.ts";
import { calculateOrderTotal, validateOrderLines } from "./order-lines.ts";

export type CreateOrderInput = {
  readonly command: CreateOrderCommand;
  /** Server clock, read once per command and passed in — the kernel reads no clock. */
  readonly recordedAt: IsoInstant;
};

/**
 * T-ORDER-001 — creates a draft order.
 *
 * A draft may be empty (BR-ORDER-002 applies at confirmation, not here) and moves
 * no money: `ledgerEntries` is always empty. Debt arises at confirmation (ASM-002).
 */
export function decideCreateOrder({
  command,
  recordedAt,
}: CreateOrderInput): DomainResult<Decision<OrderState>> {
  const { payload } = command;

  const lines = validateOrderLines(payload.lines, payload.currency);
  if (!lines.ok) {
    return lines;
  }

  const totalAmount = calculateOrderTotal(lines.value, payload.currency);

  const order: OrderState = {
    id: payload.orderId,
    workspaceId: command.workspaceId,
    customerId: payload.customerId,
    status: "draft",
    currency: payload.currency,
    lines: lines.value,
    totalAmount,
    note: payload.note,
    version: 1,
    transactionTime: command.occurredAt,
    recordedAt,
    confirmedAt: null,
    cancelledAt: null,
  };

  return ok({
    aggregate: order,
    ledgerEntries: [],
    audit: {
      aggregateType: "order",
      aggregateId: order.id,
      action: "order.created",
      transactionTime: command.occurredAt,
      recordedAt,
      before: null,
      after: {
        status: order.status,
        lineCount: order.lines.length,
        totalMinor: totalAmount.amountMinor,
        currency: order.currency,
      },
      reason: null,
    },
  });
}

import type { Capability, OrderCapabilities } from "@vuanha/domain-contracts";
import { ALLOWED, denied } from "@vuanha/domain-contracts";
import type { OrderState } from "../shared/state.ts";
import { validateOrderLines } from "./order-lines.ts";

/**
 * Capabilities are computed from the same checks `decideConfirmOrder` performs,
 * so a greyed-out button and a server refusal always agree (ADR-0003).
 *
 * They are a rendering hint, never a substitute for validation: by the time the
 * user taps, another worker may have confirmed the order.
 */
export function canConfirmOrder(order: OrderState): Capability {
  if (order.status === "confirmed") {
    return denied("ORDER_ALREADY_CONFIRMED", { orderId: order.id });
  }
  if (order.status === "cancelled") {
    return denied("ORDER_CANCELLED", { orderId: order.id });
  }
  if (order.lines.length === 0) {
    return denied("ORDER_EMPTY", { orderId: order.id });
  }

  const lines = validateOrderLines(order.lines, order.currency);
  if (!lines.ok) {
    return denied(lines.error.code, lines.error.details ?? {});
  }

  return ALLOWED;
}

export function orderCapabilities(order: OrderState): OrderCapabilities {
  return {
    confirm: canConfirmOrder(order),
    // T-ORDER-003/004 are documented but not implemented (ASM-005). The UI learns
    // this from the server rather than hard-coding a roadmap.
    cancel: denied("COMMAND_NOT_AVAILABLE", { command: "CancelOrder" }),
    // Amending a confirmed order is ASM-010; correction goes through
    // AdjustCustomerDebt for now.
    adjust: denied("COMMAND_NOT_AVAILABLE", { command: "AmendOrder" }),
  };
}

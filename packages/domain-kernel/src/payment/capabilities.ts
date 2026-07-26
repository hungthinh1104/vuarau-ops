import type { Capability, PaymentCapabilities } from "@vuanha/domain-contracts";
import { ALLOWED, denied } from "@vuanha/domain-contracts";
import type { PaymentState } from "../shared/state.ts";

/** Same check `decideReversePayment` makes, so the button and the server agree. */
export function canReversePayment(payment: PaymentState): Capability {
  if (payment.status === "reversed") {
    return denied("PAYMENT_ALREADY_REVERSED", { paymentId: payment.id });
  }
  return ALLOWED;
}

export function paymentCapabilities(payment: PaymentState): PaymentCapabilities {
  return { reverse: canReversePayment(payment) };
}

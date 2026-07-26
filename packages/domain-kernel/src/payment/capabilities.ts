import type {
  Capability,
  PaymentCapabilities,
  PaymentId,
  PaymentStatus,
} from "@vuarau/domain-contracts";
import { ALLOWED, denied } from "@vuarau/domain-contracts";
import type { PaymentState } from "../shared/state.ts";

/**
 * The facts a payment capability needs, which is less than a whole payment. A
 * list row has the status and the id and nothing else; naming the dependency lets
 * both callers share one implementation rather than a list growing its own.
 */
export type PaymentCapabilityFacts = {
  readonly paymentId: PaymentId;
  readonly status: PaymentStatus;
};

/** Same check `decideReversePayment` makes, so the button and the server agree. */
export function canReversePaymentFacts(facts: PaymentCapabilityFacts): Capability {
  if (facts.status === "reversed") {
    return denied("PAYMENT_ALREADY_REVERSED", { paymentId: facts.paymentId });
  }
  return ALLOWED;
}

export function canReversePayment(payment: PaymentState): Capability {
  return canReversePaymentFacts({ paymentId: payment.id, status: payment.status });
}

export function paymentCapabilities(payment: PaymentState): PaymentCapabilities {
  return { reverse: canReversePayment(payment) };
}

/** For list rows, which hold facts rather than a whole aggregate. */
export function paymentSummaryCapabilities(facts: PaymentCapabilityFacts): PaymentCapabilities {
  return { reverse: canReversePaymentFacts(facts) };
}

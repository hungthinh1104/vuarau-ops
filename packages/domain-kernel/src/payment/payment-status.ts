import type { Money, PaymentStatus } from "@vuarau/domain-contracts";
import type { PaymentState } from "../shared/state.ts";
import { subtractMoney } from "../shared/money.ts";

/**
 * BR-PAYMENT-008 — the payment status is a *consequence* of `reversedAmount`,
 * computed here and nowhere else.
 *
 * No command sets a status. That is what stops the stored column and the reversed
 * amount from drifting apart, which is the failure mode a `setPaymentStatus`
 * endpoint would guarantee.
 */
export function derivePaymentStatus(amount: Money, reversedAmount: Money): PaymentStatus {
  if (reversedAmount.amountMinor <= 0) {
    return "recorded";
  }
  if (reversedAmount.amountMinor >= amount.amountMinor) {
    return "reversed";
  }
  return "partially_reversed";
}

/** BR-PAYMENT-003 — how much of this payment can still be undone. */
export function remainingReversibleAmount(payment: PaymentState): Money {
  return subtractMoney(payment.amount, payment.reversedAmount);
}

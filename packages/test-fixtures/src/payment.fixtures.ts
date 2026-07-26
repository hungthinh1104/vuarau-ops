import type { PaymentState } from "@vuarau/domain-kernel";
import {
  CUSTOMER_ID,
  FULLY_REVERSED_PAYMENT_ID,
  PARTIALLY_REVERSED_PAYMENT_ID,
  PAYMENT_ID,
  WORKSPACE_ID,
} from "./ids.fixtures.ts";
import { LATER_RECORDED_AT, LATER_TRANSACTION_TIME } from "./time.fixtures.ts";
import { vnd } from "./customer.fixtures.ts";

export const PAYMENT_AMOUNT = vnd(500_000);

/** A clean payment: nothing reversed, fully reversible. */
export const recordedPayment: PaymentState = {
  id: PAYMENT_ID,
  workspaceId: WORKSPACE_ID,
  customerId: CUSTOMER_ID,
  amount: PAYMENT_AMOUNT,
  method: "cash",
  payerName: null,
  note: null,
  status: "recorded",
  reversedAmount: vnd(0),
  version: 1,
  transactionTime: LATER_TRANSACTION_TIME,
  recordedAt: LATER_RECORDED_AT,
};

/**
 * CASE-PAYMENT-010: 500 000 ₫ recorded, 200 000 ₫ already reversed.
 * 300 000 ₫ remains reversible — the boundary BR-PAYMENT-003 defends.
 */
export const partiallyReversedPayment: PaymentState = {
  ...recordedPayment,
  id: PARTIALLY_REVERSED_PAYMENT_ID,
  status: "partially_reversed",
  reversedAmount: vnd(200_000),
  version: 2,
};

export const PARTIALLY_REVERSED_REMAINING = vnd(300_000);

/** Terminal. Any further reversal is `PAYMENT_ALREADY_REVERSED` (BR-PAYMENT-006). */
export const fullyReversedPayment: PaymentState = {
  ...recordedPayment,
  id: FULLY_REVERSED_PAYMENT_ID,
  status: "reversed",
  reversedAmount: PAYMENT_AMOUNT,
  version: 2,
};

/** A payment belonging to a customer who paid on someone else's behalf. */
export const paymentByThirdParty: PaymentState = {
  ...recordedPayment,
  payerName: "Tài xế anh Hùng",
};

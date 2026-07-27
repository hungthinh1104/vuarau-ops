import type { PaymentDto, PaymentSummaryDto } from "@vuarau/domain-contracts";
import {
  CUSTOMER_WITH_DEBT_ID,
  FULLY_REVERSED_PAYMENT_ID,
  PARTIALLY_REVERSED_PAYMENT_ID,
  PAYMENT_ID,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures/ids";
import { LATER_RECORDED_AT, LATER_TRANSACTION_TIME } from "@vuarau/test-fixtures/time";
import { vnd } from "./session.fixtures.ts";

const ALLOWED = { allowed: true } as const;

export const paymentRecorded: PaymentDto = {
  id: PAYMENT_ID,
  workspaceId: WORKSPACE_ID,
  customerId: CUSTOMER_WITH_DEBT_ID,
  amount: vnd(500_000),
  currency: "VND",
  method: "cash",
  payerName: null,
  note: null,
  status: "recorded",
  reversedAmount: vnd(0),
  remainingReversibleAmount: vnd(500_000),
  version: 1,
  transactionTime: LATER_TRANSACTION_TIME,
  recordedAt: LATER_RECORDED_AT,
  capabilities: { reverse: ALLOWED },
};

/**
 * The three-number case: 500.000 collected, 200.000 handed back, 300.000 still
 * reversible.
 *
 * "Hoàn 200.000 trong 500.000" and "hoàn 200.000" are different facts and only the
 * first is useful, which is why the fixture carries all three. `remainingReversible`
 * is the server's arithmetic (UC-PAYMENT-003) — a client that subtracted wrongly
 * would offer to reverse money that is not there.
 */
export const paymentPartiallyReversed: PaymentDto = {
  ...paymentRecorded,
  id: PARTIALLY_REVERSED_PAYMENT_ID,
  status: "partially_reversed",
  reversedAmount: vnd(200_000),
  remainingReversibleAmount: vnd(300_000),
  version: 2,
  payerName: "Anh Dũng (con chị Lan)",
};

/** Terminal. The reverse control is disabled, with the code the command would return. */
export const paymentReversed: PaymentDto = {
  ...paymentRecorded,
  id: FULLY_REVERSED_PAYMENT_ID,
  status: "reversed",
  reversedAmount: vnd(500_000),
  remainingReversibleAmount: vnd(0),
  version: 3,
  capabilities: {
    reverse: {
      allowed: false,
      reasonCode: "PAYMENT_ALREADY_REVERSED",
      details: { paymentId: FULLY_REVERSED_PAYMENT_ID },
    },
  },
};

function summaryOf(payment: PaymentDto): PaymentSummaryDto {
  return {
    id: payment.id,
    workspaceId: payment.workspaceId,
    customerId: payment.customerId,
    customerDisplayName: "Chị Lan — chợ Bình Điền",
    amount: payment.amount,
    reversedAmount: payment.reversedAmount,
    remainingReversibleAmount: payment.remainingReversibleAmount,
    method: payment.method,
    payerName: payment.payerName,
    note: payment.note,
    status: payment.status,
    version: payment.version,
    transactionTime: payment.transactionTime,
    recordedAt: payment.recordedAt,
    capabilities: payment.capabilities,
  };
}

export const paymentPage: readonly PaymentSummaryDto[] = [
  summaryOf(paymentRecorded),
  summaryOf(paymentPartiallyReversed),
  summaryOf(paymentReversed),
];

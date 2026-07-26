import type { IsoInstant, RecordCustomerPaymentCommand } from "@vuarau/domain-contracts";
import type { Decision, AccountEntryDraft } from "../shared/effects.ts";
import type { PaymentState } from "../shared/state.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";
import { negateMoney, zeroMoney } from "../shared/money.ts";

export type RecordPaymentInput = {
  readonly command: RecordCustomerPaymentCommand;
  readonly recordedAt: IsoInstant;
};

/**
 * T-PAY-001 — money received.
 *
 * Note what this function is *not* given: the customer's current balance. There is
 * deliberately no overpayment guard (ASM-001) — a customer paying ahead is a real
 * business event, and refusing it would leave no record that it happened.
 */
export function decideRecordPayment({
  command,
  recordedAt,
}: RecordPaymentInput): DomainResult<Decision<PaymentState>> {
  const { payload } = command;

  if (!Number.isInteger(payload.amount.amountMinor) || payload.amount.amountMinor <= 0) {
    return err("PAYMENT_AMOUNT_INVALID", "A payment amount must be a positive whole number.", {
      amountMinor: payload.amount.amountMinor,
    });
  }

  const payment: PaymentState = {
    id: payload.paymentId,
    workspaceId: command.workspaceId,
    customerId: payload.customerId,
    amount: payload.amount,
    method: payload.method,
    payerName: payload.payerName,
    note: payload.note,
    status: "recorded",
    reversedAmount: zeroMoney(payload.amount.currency),
    version: 1,
    transactionTime: command.occurredAt,
    recordedAt,
  };

  // BR-PAYMENT-002 — exactly one entry, reducing what the customer owes.
  const ledgerEntry: AccountEntryDraft = {
    workspaceId: command.workspaceId,
    customerId: payload.customerId,
    amount: negateMoney(payload.amount),
    sourceType: "payment",
    sourceId: payload.paymentId,
    reversalOfEntryId: null,
    reasonCode: null,
    reason: null,
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    commandId: command.commandId,
  };

  return ok({
    aggregate: payment,
    accountEntries: [ledgerEntry],
    audit: {
      aggregateType: "payment",
      aggregateId: payment.id,
      action: "payment.recorded",
      transactionTime: command.occurredAt,
      recordedAt,
      before: null,
      after: {
        amountMinor: payment.amount.amountMinor,
        currency: payment.amount.currency,
        method: payment.method,
        payerName: payment.payerName,
      },
      reason: null,
    },
  });
}

import type {
  DebtLedgerEntryId,
  IsoInstant,
  ReverseCustomerPaymentCommand,
} from "@vuarau/domain-contracts";
import type { Decision, LedgerEntryDraft } from "../shared/effects.ts";
import type { PaymentState, PaymentWithReversal } from "../shared/state.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";
import { addMoney } from "../shared/money.ts";
import { derivePaymentStatus, remainingReversibleAmount } from "./payment-status.ts";

export type ReversePaymentInput = {
  readonly command: ReverseCustomerPaymentCommand;
  readonly payment: PaymentState;
  /**
   * The ledger entry this reversal compensates — the one the original payment
   * produced. Looked up by the application layer and passed in, because the
   * kernel does no I/O.
   */
  readonly originalLedgerEntryId: DebtLedgerEntryId;
  readonly recordedAt: IsoInstant;
};

/**
 * T-PAY-002/003/004 — undo a payment's financial effect without erasing it.
 *
 * The result is a reversal record plus a compensating ledger entry. It is never a
 * second payment (BR-PAYMENT-005): if it were, "how much has this customer paid
 * us" would have to know which payments are secretly negatives, and so would every
 * report built on it.
 */
export function decideReversePayment({
  command,
  payment,
  originalLedgerEntryId,
  recordedAt,
}: ReversePaymentInput): DomainResult<Decision<PaymentWithReversal>> {
  const { payload } = command;

  if (command.expectedVersion !== payment.version) {
    return err(
      "PAYMENT_VERSION_CONFLICT",
      `Payment was modified by someone else: expected version ${command.expectedVersion}, found ${payment.version}.`,
      {
        paymentId: payment.id,
        expectedVersion: command.expectedVersion,
        actualVersion: payment.version,
      },
    );
  }

  if (payment.status === "reversed") {
    return err("PAYMENT_ALREADY_REVERSED", "This payment has already been fully reversed.", {
      paymentId: payment.id,
    });
  }

  if (payload.reason.trim().length === 0) {
    return err("PAYMENT_REVERSAL_REASON_REQUIRED", "A payment reversal requires a reason.", {
      paymentId: payment.id,
    });
  }

  if (!Number.isInteger(payload.amount.amountMinor) || payload.amount.amountMinor <= 0) {
    return err("PAYMENT_AMOUNT_INVALID", "A reversal amount must be a positive whole number.", {
      amountMinor: payload.amount.amountMinor,
    });
  }

  if (payload.amount.currency !== payment.amount.currency) {
    return err(
      "PAYMENT_CURRENCY_MISMATCH",
      `Reversal is in ${payload.amount.currency} but the payment is in ${payment.amount.currency}.`,
      { expected: payment.amount.currency, actual: payload.amount.currency },
    );
  }

  const remaining = remainingReversibleAmount(payment);
  if (payload.amount.amountMinor > remaining.amountMinor) {
    return err(
      "PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT",
      `Cannot reverse ${payload.amount.amountMinor}: only ${remaining.amountMinor} remains reversible.`,
      {
        paymentId: payment.id,
        requested: payload.amount.amountMinor,
        remaining: remaining.amountMinor,
        currency: payment.amount.currency,
      },
    );
  }

  const reversedAmount = addMoney(payment.reversedAmount, payload.amount);
  const reason = payload.reason.trim();

  const updatedPayment: PaymentState = {
    ...payment,
    reversedAmount,
    status: derivePaymentStatus(payment.amount, reversedAmount),
    version: payment.version + 1,
  };

  const reversal = {
    id: payload.reversalId,
    workspaceId: command.workspaceId,
    paymentId: payment.id,
    amount: payload.amount,
    reason,
    transactionTime: command.occurredAt,
    recordedAt,
  };

  // One compensating entry, linked to what it offsets. Both survive (BR-ACCOUNT-005).
  const ledgerEntry: LedgerEntryDraft = {
    workspaceId: command.workspaceId,
    customerId: payment.customerId,
    amount: payload.amount,
    sourceType: "payment_reversal",
    sourceId: payload.reversalId,
    reversalOfEntryId: originalLedgerEntryId,
    reasonCode: null,
    reason,
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    commandId: command.commandId,
  };

  return ok({
    aggregate: { payment: updatedPayment, reversal },
    ledgerEntries: [ledgerEntry],
    audit: {
      aggregateType: "payment",
      aggregateId: payment.id,
      action: "payment.reversed",
      transactionTime: command.occurredAt,
      recordedAt,
      before: {
        status: payment.status,
        reversedMinor: payment.reversedAmount.amountMinor,
        version: payment.version,
      },
      after: {
        status: updatedPayment.status,
        reversedMinor: reversedAmount.amountMinor,
        version: updatedPayment.version,
      },
      reason,
    },
  });
}

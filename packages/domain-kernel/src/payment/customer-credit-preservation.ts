import type {
  CustomerPaymentCreditPreservationDto,
  IsoInstant,
  PreserveCustomerPaymentAsCreditCommand,
} from "@vuarau/domain-contracts";
import type { PaymentState } from "../shared/state.ts";
import type { AuditDraft } from "../shared/effects.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";
import { sumExactIntegers } from "../shared/money.ts";

/**
 * Customer-credit rows are append-only. The active amount is the sum of chain
 * tips; a correction replaces only its linked predecessor for read-time use.
 */
export function activeCustomerPaymentCreditAmount(
  preservations: readonly CustomerPaymentCreditPreservationDto[],
  excludePreservationId: string | null = null,
): number | null {
  return sumExactIntegers(
    preservations
      .filter(
        (preservation) =>
          !preservations.some((successor) => successor.relatedPreservationId === preservation.id),
      )
      .filter((preservation) => preservation.id !== excludePreservationId)
      .map((preservation) => preservation.amount.amountMinor),
  );
}

export type CustomerPaymentCreditPreservationContext = {
  readonly payment: PaymentState;
  readonly correctionTarget: CustomerPaymentCreditPreservationDto | null;
  readonly correctionTargetAlreadyCorrected: boolean;
  /** Available amount before the command's new preservation replaces its target. */
  readonly availableAmountMinor: number | null;
};

export function decidePreserveCustomerPaymentAsCredit(
  command: PreserveCustomerPaymentAsCreditCommand,
  context: CustomerPaymentCreditPreservationContext,
  recordedAt: IsoInstant,
): DomainResult<{ preservation: CustomerPaymentCreditPreservationDto; audit: AuditDraft }> {
  const { payload } = command;
  if (command.expectedVersion !== context.payment.version) {
    return err("PAYMENT_VERSION_CONFLICT", "Payment was modified by someone else.", {
      expectedVersion: command.expectedVersion,
      actualVersion: context.payment.version,
    });
  }
  if (payload.amount.amountMinor <= 0) {
    return err(
      "CUSTOMER_CREDIT_PRESERVATION_AMOUNT_INVALID",
      "Customer-credit preservation amount must be positive.",
    );
  }
  if (payload.amount.currency !== context.payment.amount.currency) {
    return err(
      "PAYMENT_CURRENCY_MISMATCH",
      "Customer-credit preservation currency must match the payment.",
    );
  }
  if (payload.caseKind === "preservation" && payload.relatedPreservationId !== null) {
    return err(
      "CUSTOMER_CREDIT_PRESERVATION_CORRECTION_LINK_INVALID",
      "A customer-credit preservation cannot link to an earlier preservation.",
    );
  }
  if (payload.caseKind === "correction" && payload.relatedPreservationId === null) {
    return err(
      "CUSTOMER_CREDIT_PRESERVATION_CORRECTION_TARGET_REQUIRED",
      "A customer-credit correction must identify the preservation it corrects.",
    );
  }
  if (payload.caseKind === "correction" && context.correctionTarget === null) {
    return err(
      "CUSTOMER_CREDIT_PRESERVATION_CORRECTION_TARGET_NOT_FOUND",
      "The customer-credit preservation being corrected was not found in this workspace.",
    );
  }
  if (payload.caseKind === "correction" && context.correctionTargetAlreadyCorrected) {
    return err(
      "CUSTOMER_CREDIT_PRESERVATION_TARGET_ALREADY_CORRECTED",
      "Only the current customer-credit chain tip may be corrected.",
    );
  }
  if (
    payload.caseKind === "correction" &&
    context.correctionTarget !== null &&
    context.correctionTarget.paymentId !== payload.paymentId
  ) {
    return err(
      "CUSTOMER_CREDIT_PRESERVATION_CORRECTION_PAYMENT_MISMATCH",
      "A customer-credit correction must preserve the original payment identity.",
    );
  }
  if (
    context.availableAmountMinor === null ||
    payload.amount.amountMinor > context.availableAmountMinor
  ) {
    return err(
      "CUSTOMER_CREDIT_PRESERVATION_EXCEEDS_UNALLOCATED",
      "Customer-credit preservation exceeds the payment's unallocated amount.",
      { availableAmountMinor: Math.max(0, context.availableAmountMinor ?? 0) },
    );
  }

  const preservation: CustomerPaymentCreditPreservationDto = {
    id: payload.preservationId,
    workspaceId: command.workspaceId,
    paymentId: context.payment.id,
    customerId: context.payment.customerId,
    amount: payload.amount,
    caseKind: payload.caseKind,
    relatedPreservationId: payload.relatedPreservationId,
    reason: payload.reason.trim(),
    evidenceReferences: [...payload.evidenceReferences],
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    commandId: command.commandId,
  };
  return ok({
    preservation,
    audit: {
      aggregateType: "customer_payment_credit_preservation",
      aggregateId: preservation.id,
      action: "payment.customer_credit_preserved",
      transactionTime: preservation.transactionTime,
      recordedAt,
      before: null,
      after: {
        paymentId: preservation.paymentId,
        customerId: preservation.customerId,
        amountMinor: preservation.amount.amountMinor,
        currency: preservation.amount.currency,
        caseKind: preservation.caseKind,
        relatedPreservationId: preservation.relatedPreservationId,
        ledgerEffect: "none",
      },
      reason: preservation.reason,
    },
  });
}

import type {
  PaymentAllocationDto,
  PaymentAllocationReversalDto,
  RecordPaymentAllocationCommand,
  ReversePaymentAllocationCommand,
  IsoInstant,
} from "@vuarau/domain-contracts";
import type { PaymentState, SaleState } from "../shared/state.ts";
import type { AuditDraft } from "../shared/effects.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";
import { subtractExactIntegers, sumExactIntegers } from "../shared/money.ts";

export type PaymentAllocationContext = {
  readonly payment: PaymentState;
  readonly sale: SaleState;
  readonly allocation: PaymentAllocationDto | null;
  readonly allocations: readonly PaymentAllocationDto[];
  readonly reversals: readonly PaymentAllocationReversalDto[];
  /** Amount already reserved by an explicit customer-credit fact. */
  readonly reservedCustomerCreditAmount?: number;
};

export type PaymentAllocationDecision<T> = {
  readonly value: T;
  readonly audit: AuditDraft;
};

export function calculateActivePaymentAllocationAmount(
  allocation: PaymentAllocationDto,
  reversals: readonly PaymentAllocationReversalDto[],
): number | null {
  const reversed = sumExactIntegers(
    reversals
      .filter((reversal) => reversal.allocationId === allocation.id)
      .map((reversal) => reversal.amount.amountMinor),
  );
  const remaining =
    reversed === null ? null : subtractExactIntegers(allocation.amount.amountMinor, reversed);
  return remaining === null ? null : Math.max(0, remaining);
}

function persistedRange(field: string): DomainResult<never> {
  return err(
    "PERSISTED_NUMBER_OUT_OF_RANGE",
    "Persisted monetary data is outside the supported exact range.",
    { field },
  );
}

function validateVersion(commandExpected: number, actual: number): DomainResult<null> {
  return commandExpected === actual
    ? ok(null)
    : err("PAYMENT_VERSION_CONFLICT", "Payment was modified by someone else.", {
        expectedVersion: commandExpected,
        actualVersion: actual,
      });
}

export function decideRecordPaymentAllocation(
  command: RecordPaymentAllocationCommand,
  context: PaymentAllocationContext,
  recordedAt: IsoInstant,
): DomainResult<PaymentAllocationDecision<PaymentAllocationDto>> {
  const version = validateVersion(command.expectedVersion, context.payment.version);
  if (!version.ok) return version;
  if (command.payload.amount.amountMinor <= 0) {
    return err("PAYMENT_ALLOCATION_AMOUNT_INVALID", "Allocation amount must be positive.");
  }
  if (command.payload.amount.currency !== context.payment.amount.currency) {
    return err("PAYMENT_ALLOCATION_CURRENCY_MISMATCH", "Allocation currency must match payment.");
  }
  if (command.payload.amount.currency !== context.sale.totalAmount.currency) {
    return err("PAYMENT_ALLOCATION_CURRENCY_MISMATCH", "Allocation currency must match sale.");
  }
  if (
    context.payment.workspaceId !== command.workspaceId ||
    context.sale.workspaceId !== command.workspaceId
  ) {
    return err("WORKSPACE_ACCESS_DENIED", "Allocation sources must belong to this workspace.");
  }
  if (context.payment.customerId !== context.sale.customerId) {
    return err(
      "PAYMENT_ALLOCATION_SALE_NOT_POSTED",
      "Payment and sale belong to different customers.",
    );
  }
  if (context.sale.status !== "posted") {
    return err(
      "PAYMENT_ALLOCATION_SALE_NOT_POSTED",
      "Only a posted sale can receive an allocation.",
    );
  }
  if (context.sale.voidRecord !== null) {
    return err("PAYMENT_ALLOCATION_SALE_VOIDED", "A voided sale cannot receive an allocation.");
  }

  const activeAllocations = context.allocations.map((allocation) =>
    calculateActivePaymentAllocationAmount(allocation, context.reversals),
  );
  if (activeAllocations.some((amount) => amount === null)) {
    return persistedRange("payment.allocation.amount_minor");
  }
  const allocatedPayment = sumExactIntegers(
    activeAllocations.filter((amount): amount is number => amount !== null),
  );
  const allocatedSale = sumExactIntegers(
    context.allocations.map((allocation, index) =>
      allocation.saleId === context.sale.id ? activeAllocations[index]! : 0,
    ),
  );
  const effectivePayment = subtractExactIntegers(
    context.payment.amount.amountMinor,
    context.payment.reversedAmount.amountMinor,
  );
  const remainingPayment =
    allocatedPayment === null || effectivePayment === null
      ? null
      : subtractExactIntegers(
          subtractExactIntegers(effectivePayment, allocatedPayment) ?? 0,
          context.reservedCustomerCreditAmount ?? 0,
        );
  const remainingSale =
    allocatedSale === null
      ? null
      : subtractExactIntegers(context.sale.totalAmount.amountMinor, allocatedSale);
  if (remainingPayment === null || remainingSale === null) {
    return persistedRange("payment.allocation.remaining_amount_minor");
  }
  if (command.payload.amount.amountMinor > remainingPayment) {
    return err(
      context.reservedCustomerCreditAmount !== undefined && context.reservedCustomerCreditAmount > 0
        ? "PAYMENT_ALLOCATION_WOULD_EXCEED_CUSTOMER_CREDIT"
        : "PAYMENT_ALLOCATION_EXCEEDS_PAYMENT",
      "Allocation exceeds the payment remaining amount.",
      {
        remainingAmountMinor: remainingPayment,
      },
    );
  }
  if (command.payload.amount.amountMinor > remainingSale) {
    return err(
      "PAYMENT_ALLOCATION_EXCEEDS_SALE",
      "Allocation exceeds the sale outstanding amount.",
      {
        remainingAmountMinor: remainingSale,
      },
    );
  }

  const allocation: PaymentAllocationDto = {
    id: command.payload.allocationId,
    workspaceId: command.workspaceId,
    customerId: context.payment.customerId,
    paymentId: context.payment.id,
    saleId: context.sale.id,
    amount: command.payload.amount,
    evidenceReferences: [...command.payload.evidenceReferences],
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    commandId: command.commandId,
  };
  return ok({
    value: allocation,
    audit: {
      aggregateType: "debt",
      aggregateId: allocation.id,
      action: "debt.payment_allocated",
      transactionTime: command.occurredAt,
      recordedAt: allocation.recordedAt,
      before: { paymentId: allocation.paymentId, saleId: allocation.saleId },
      after: { amountMinor: allocation.amount.amountMinor, currency: allocation.amount.currency },
      reason: null,
    },
  });
}

export function decideReversePaymentAllocation(
  command: ReversePaymentAllocationCommand,
  context: PaymentAllocationContext,
  recordedAt: IsoInstant,
): DomainResult<PaymentAllocationDecision<PaymentAllocationReversalDto>> {
  const version = validateVersion(command.expectedVersion, context.payment.version);
  if (!version.ok) return version;
  if (context.allocation === null) {
    return err("PAYMENT_ALLOCATION_NOT_FOUND", "No such payment allocation in this workspace.");
  }
  if (command.payload.amount.amountMinor <= 0) {
    return err("PAYMENT_ALLOCATION_AMOUNT_INVALID", "Reversal amount must be positive.");
  }
  if (command.payload.amount.currency !== context.allocation.amount.currency) {
    return err("PAYMENT_ALLOCATION_CURRENCY_MISMATCH", "Reversal currency must match allocation.");
  }
  const remaining = calculateActivePaymentAllocationAmount(context.allocation, context.reversals);
  if (remaining === null) {
    return persistedRange("payment.allocation.remaining_amount_minor");
  }
  if (command.payload.amount.amountMinor > remaining) {
    return err(
      "PAYMENT_ALLOCATION_REVERSAL_EXCEEDS_REMAINING",
      "Reversal exceeds the allocation remaining amount.",
      { remainingAmountMinor: remaining },
    );
  }
  if (command.payload.reason.trim().length === 0) {
    return err(
      "PAYMENT_ALLOCATION_REVERSAL_REASON_REQUIRED",
      "A reason is required to reverse an allocation.",
    );
  }
  const remainingAfterReversal = subtractExactIntegers(
    remaining,
    command.payload.amount.amountMinor,
  );
  if (remainingAfterReversal === null) {
    return persistedRange("payment.allocation.remaining_amount_minor");
  }
  const reversal: PaymentAllocationReversalDto = {
    id: command.payload.reversalId,
    workspaceId: command.workspaceId,
    customerId: context.allocation.customerId,
    allocationId: context.allocation.id,
    amount: command.payload.amount,
    reason: command.payload.reason.trim(),
    evidenceReferences: [...command.payload.evidenceReferences],
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    commandId: command.commandId,
  };
  return ok({
    value: reversal,
    audit: {
      aggregateType: "debt",
      aggregateId: reversal.id,
      action: "debt.payment_allocation_reversed",
      transactionTime: command.occurredAt,
      recordedAt: reversal.recordedAt,
      before: { allocationId: reversal.allocationId, amountMinor: remaining },
      after: { amountMinor: remainingAfterReversal },
      reason: reversal.reason,
    },
  });
}

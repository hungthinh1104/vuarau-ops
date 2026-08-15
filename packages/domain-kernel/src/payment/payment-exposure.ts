import { subtractExactIntegers, sumExactIntegers } from "../shared/money.ts";

/** One allocation and the append-only reversals that make its active amount. */
export type PaymentExposureAllocation = {
  readonly amountMinor: number;
  readonly reversedAmountMinor: number;
};

export type PaymentExposureInput = {
  readonly originalAmountMinor: number;
  readonly reversedAmountMinor: number;
  readonly allocations: readonly PaymentExposureAllocation[];
  readonly preservedCreditAmountMinor: number;
};

export type PaymentExposure = {
  readonly originalAmountMinor: number;
  readonly reversedAmountMinor: number;
  readonly effectiveAmountMinor: number;
  readonly allocatedAmountMinor: number;
  readonly preservedCreditAmountMinor: number;
  readonly availableAmountMinor: number;
};

export function deriveActivePaymentAmount(
  amountMinor: number,
  reversedAmountMinor: number,
): number | null {
  const remaining = subtractExactIntegers(amountMinor, reversedAmountMinor);
  return remaining === null ? null : Math.max(0, remaining);
}

/**
 * Canonical Payment exposure arithmetic (BR-PAYMENT-009).
 *
 * This owns only money meaning. Selection, correction-chain lookup and query
 * ordering remain with their bounded contexts. `null` is a fail-closed result
 * when persisted integer arithmetic cannot be represented exactly.
 */
export function derivePaymentExposure(input: PaymentExposureInput): PaymentExposure | null {
  const effectiveAmountMinor = deriveActivePaymentAmount(
    input.originalAmountMinor,
    input.reversedAmountMinor,
  );
  const activeAllocations = input.allocations.map((allocation) =>
    deriveActivePaymentAmount(allocation.amountMinor, allocation.reversedAmountMinor),
  );
  const allocatedAmountMinor = sumExactIntegers(
    activeAllocations.filter((amount): amount is number => amount !== null),
  );
  if (
    effectiveAmountMinor === null ||
    activeAllocations.some((amount) => amount === null) ||
    allocatedAmountMinor === null
  ) {
    return null;
  }
  const preservedCreditAmountMinor = Math.max(0, input.preservedCreditAmountMinor);
  const afterAllocation = subtractExactIntegers(effectiveAmountMinor, allocatedAmountMinor);
  const afterPreservedCredit =
    afterAllocation === null
      ? null
      : subtractExactIntegers(afterAllocation, preservedCreditAmountMinor);
  if (afterPreservedCredit === null) return null;
  return {
    originalAmountMinor: input.originalAmountMinor,
    reversedAmountMinor: input.reversedAmountMinor,
    effectiveAmountMinor,
    allocatedAmountMinor,
    preservedCreditAmountMinor,
    availableAmountMinor: Math.max(0, afterPreservedCredit),
  };
}

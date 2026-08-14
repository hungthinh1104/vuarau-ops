import {
  OPERATIONS_EXCEPTION_DEFINITIONS,
  type OperationsException,
  type OperationsExceptionKind,
  type FulfilmentRemainderOutcome,
} from "@vuarau/domain-contracts";

export type OperationsBoardExceptionFacts = {
  readonly id: string;
  readonly kind: "sale" | "purchase";
  readonly reference: string;
  readonly href: string;
  readonly amountMinor: number;
  readonly physicalState: string;
  readonly commercialState: string;
  readonly financialState: string;
  readonly returnedFulfilment: boolean;
  readonly unallocatedPayment: boolean;
  readonly unallocatedPaymentAmountMinor: number | null;
  /** A canonical source comparison found a mismatch; state labels are not enough. */
  readonly reconciliationVariance: boolean;
  /** A separate source fact; ordinary needs_delivery/in_delivery is not enough. */
  readonly fulfilmentRemainderUnresolved: boolean;
  readonly fulfilmentRemainderOutcome?: FulfilmentRemainderOutcome | null;
  /** A return settlement fact exists; goods-only resolution does not change money. */
  readonly returnSettlementResolved: boolean;
  readonly deliveryId: string | null;
};

function sourceFacts(
  input: OperationsBoardExceptionFacts,
  extra: readonly { key: string; value: string }[],
) {
  return [
    { key: "reference", value: input.reference },
    { key: "commercial_state", value: input.commercialState },
    { key: "physical_state", value: input.physicalState },
    { key: "financial_state", value: input.financialState },
    { key: "amount_minor", value: String(input.amountMinor) },
    ...extra,
  ];
}

function exception(
  input: OperationsBoardExceptionFacts,
  kind: OperationsExceptionKind,
  facts: readonly { key: string; value: string }[],
  href = input.href,
): OperationsException {
  const definition = OPERATIONS_EXCEPTION_DEFINITIONS[kind];
  return {
    kind,
    ...definition,
    source: { kind: input.kind, reference: input.reference, id: input.id },
    sourceFacts: sourceFacts(input, facts),
    unknown: definition.unknown,
    resolutionOptions: [...definition.resolutionOptions],
    nextAction: { label: definition.nextAction, href },
  };
}

/**
 * Bounded, explicit exception derivation shared by the in-memory and SQL
 * read-model adapters. It consumes already-derived state; it never invents a
 * business rule from UI labels.
 */
export function deriveOperationsBoardExceptions(
  input: OperationsBoardExceptionFacts,
): OperationsException[] {
  const result: OperationsException[] = [];
  if (
    input.kind === "sale" &&
    !input.returnedFulfilment &&
    !input.fulfilmentRemainderUnresolved &&
    (input.physicalState === "needs_delivery" || input.physicalState === "in_delivery")
  ) {
    result.push(
      exception(
        input,
        "outstanding_delivery",
        [{ key: "delivery_status", value: input.physicalState }],
        input.deliveryId === null ? input.href : `/deliveries/${input.deliveryId}`,
      ),
    );
  }
  if (input.kind === "sale" && input.returnedFulfilment && !input.returnSettlementResolved) {
    result.push(
      exception(
        input,
        "return_settlement_unresolved",
        [
          { key: "returned_fulfilment", value: "true" },
          { key: "delivery_id", value: input.deliveryId ?? "none" },
        ],
        input.deliveryId === null ? input.href : `/deliveries/${input.deliveryId}`,
      ),
    );
  }
  if (input.kind === "sale" && input.unallocatedPayment) {
    result.push(
      exception(input, "unallocated_payment", [
        {
          key: "unallocated_payment_amount_minor",
          value: String(input.unallocatedPaymentAmountMinor ?? 0),
        },
      ]),
    );
  }
  if (input.kind === "sale" && input.fulfilmentRemainderUnresolved) {
    result.push(
      exception(input, "fulfilment_remainder_unresolved", [
        { key: "remainder_status", value: "unresolved" },
        { key: "physical_state", value: input.physicalState },
      ]),
    );
  }
  if (input.reconciliationVariance) {
    result.push(
      exception(input, "reconciliation_variance", [
        { key: "reconciliation_status", value: "variance" },
        {
          key: "unallocated_payment_amount_minor",
          value: String(input.unallocatedPaymentAmountMinor ?? 0),
        },
      ]),
    );
  }
  return result;
}

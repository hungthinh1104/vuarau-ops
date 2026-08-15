import type { OperationsBoardDto } from "@vuarau/domain-contracts";
import { deriveOperationsBoardExceptions } from "@vuarau/domain-kernel";
import type { Store } from "../store.ts";
import { key } from "../store.ts";
import { latestTimestamp } from "./dashboard-helpers.ts";
import { paymentUnallocatedAmount } from "./dashboard-order-state.ts";

type OperationsBoardRow = OperationsBoardDto["page"]["items"][number];

export function paymentOperationsBoardRows(
  store: Store,
  workspaceId: string,
  asOf: string,
): OperationsBoardRow[] {
  const rows: OperationsBoardRow[] = [];
  for (const payment of store.payments.values()) {
    if (payment.workspaceId !== workspaceId || payment.status === "reversed") continue;
    const unallocated = paymentUnallocatedAmount(store, workspaceId, payment.id);
    if (unallocated <= 0) continue;
    const updatedAt = latestTimestamp(
      [
        payment.recordedAt,
        ...store.reversals
          .filter(
            (reversal) => reversal.workspaceId === workspaceId && reversal.paymentId === payment.id,
          )
          .map((reversal) => reversal.recordedAt),
        ...store.paymentAllocations
          .filter(
            (allocation) =>
              allocation.workspaceId === workspaceId && allocation.paymentId === payment.id,
          )
          .map((allocation) => allocation.recordedAt),
        ...store.paymentAllocationReversals
          .filter((reversal) => reversal.workspaceId === workspaceId)
          .filter((reversal) =>
            store.paymentAllocations.some(
              (allocation) =>
                allocation.id === reversal.allocationId && allocation.paymentId === payment.id,
            ),
          )
          .map((reversal) => reversal.recordedAt),
        ...[...store.debtObservations.values()]
          .filter(
            (observation) =>
              observation.workspaceId === workspaceId &&
              observation.kind === "customer_credit_preserved" &&
              observation.facts.paymentReference === payment.id,
          )
          .map((observation) => observation.recordedAt),
      ],
      payment.recordedAt,
    );
    const reference = `PAY-${payment.id.slice(0, 8).toUpperCase()}`;
    const counterparty =
      store.customers.get(key(workspaceId, payment.customerId))?.displayName ?? "Khách hàng";
    rows.push({
      id: payment.id,
      kind: "payment",
      reference,
      counterparty,
      amount: { amountMinor: unallocated, currency: "VND" },
      commercialState: "not_applicable",
      physicalState: "not_applicable",
      financialState: "unallocated",
      returnedFulfilment: false,
      fulfilmentRemainderOutcome: null,
      unallocatedPayment: true,
      unallocatedPaymentAmount: { amountMinor: unallocated, currency: "VND" },
      ageSeconds: Math.max(0, (Date.parse(asOf) - Date.parse(payment.recordedAt)) / 1000),
      nextAction: "Mở khoản thanh toán để phân bổ hoặc ghi nhận tín dụng.",
      exceptions: deriveOperationsBoardExceptions({
        id: payment.id,
        kind: "payment",
        reference,
        href: `/payments/${payment.id}`,
        amountMinor: unallocated,
        dueAt: null,
        physicalState: "not_applicable",
        commercialState: "not_applicable",
        financialState: "unallocated",
        returnedFulfilment: false,
        unallocatedPayment: true,
        unallocatedPaymentAmountMinor: unallocated,
        reconciliationVariance: false,
        fulfilmentRemainderUnresolved: false,
        fulfilmentRemainderOutcome: null,
        returnSettlementResolved: false,
        deliveryId: null,
      }),
      updatedAt,
      href: `/payments/${payment.id}`,
      deliveryId: null,
    });
  }
  return rows;
}

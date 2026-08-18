import type { DeliveryState } from "@vuarau/domain-kernel";
import {
  activeCustomerPaymentCreditAmount,
  deriveOperationsBoardNextAction,
  deriveSaleLineFulfilmentFacts,
  derivePaymentExposure,
} from "@vuarau/domain-kernel";
import type { FulfilmentRemainderOutcome } from "@vuarau/domain-contracts";
import type { Store } from "../store.ts";
import { key } from "../store.ts";
import { exactAdd, exactSubtract } from "./exact-number.ts";

export function saleFinancialFacts(
  store: Store,
  workspaceId: string,
  saleId: string,
  asOf: string,
): { state: string; unallocatedPaymentAmountMinor: number } {
  const sale = store.sales.get(key(workspaceId, saleId));
  if (sale?.voidRecord !== null && sale?.voidRecord !== undefined)
    return { state: "voided", unallocatedPaymentAmountMinor: 0 };
  const allocated = store.paymentAllocations
    .filter((allocation) => allocation.workspaceId === workspaceId && allocation.saleId === saleId)
    .reduce(
      (sum, allocation) =>
        exactAdd(sum, allocation.amount.amountMinor, "dashboard.payment_allocation.amount_minor"),
      0,
    );
  const reversed = store.paymentAllocationReversals
    .filter((reversal) => reversal.workspaceId === workspaceId)
    .filter((reversal) =>
      store.paymentAllocations.some(
        (allocation) => allocation.id === reversal.allocationId && allocation.saleId === saleId,
      ),
    )
    .reduce(
      (sum, reversal) =>
        exactAdd(sum, reversal.amount.amountMinor, "dashboard.payment_reversal.amount_minor"),
      0,
    );
  if (
    sale !== undefined &&
    exactSubtract(allocated, reversed, "dashboard.sale_paid.amount_minor") >=
      sale.totalAmount.amountMinor
  )
    return { state: "paid", unallocatedPaymentAmountMinor: 0 };
  if (
    sale?.dueAt !== null &&
    sale?.dueAt !== undefined &&
    Date.parse(sale.dueAt) < Date.parse(asOf)
  )
    return { state: "overdue", unallocatedPaymentAmountMinor: 0 };
  return { state: "awaiting_payment", unallocatedPaymentAmountMinor: 0 };
}

export function paymentUnallocatedAmount(
  store: Store,
  workspaceId: string,
  paymentId: string,
): number {
  const payment = store.payments.get(key(workspaceId, paymentId));
  if (payment === undefined || payment.status === "reversed") return 0;
  const preservedCredit = activeCustomerPaymentCreditAmount(
    [...store.customerPaymentCreditPreservations.values()].filter(
      (preservation) =>
        preservation.workspaceId === workspaceId && preservation.paymentId === paymentId,
    ),
  );
  if (preservedCredit === null) {
    throw new RangeError("dashboard.customer_payment_credit_preservation.amount_minor");
  }
  const exposure = derivePaymentExposure({
    originalAmountMinor: payment.amount.amountMinor,
    reversedAmountMinor: payment.reversedAmount.amountMinor,
    allocations: store.paymentAllocations
      .filter(
        (allocation) =>
          allocation.workspaceId === workspaceId && allocation.paymentId === paymentId,
      )
      .map((allocation) => ({
        amountMinor: allocation.amount.amountMinor,
        reversedAmountMinor: store.paymentAllocationReversals
          .filter(
            (reversal) =>
              reversal.workspaceId === workspaceId && reversal.allocationId === allocation.id,
          )
          .reduce(
            (sum, reversal) =>
              exactAdd(sum, reversal.amount.amountMinor, "dashboard.payment_reversal.amount_minor"),
            0,
          ),
      })),
    preservedCreditAmountMinor: preservedCredit,
  });
  if (exposure === null) throw new RangeError("dashboard.payment_exposure.available_amount_minor");
  return exposure.availableAmountMinor;
}

export function saleNextAction(input: {
  readonly voided: boolean;
  readonly physicalState: string;
  readonly returnedFulfilment: boolean;
  readonly returnSettlementResolved?: boolean;
  readonly fulfilmentRemainderUnresolved?: boolean;
  readonly fulfilmentRemainderOutcome?: FulfilmentRemainderOutcome | null;
  readonly unallocatedPayment: boolean;
  readonly financialState: string;
}): string | null {
  return deriveOperationsBoardNextAction({ ...input, kind: "sale" });
}

export function salePhysicalState(
  store: Store,
  workspaceId: string,
  saleId: string,
): {
  state: string;
  deliveryId: string | null;
  returnedFulfilment: boolean;
} {
  const sale = store.sales.get(key(workspaceId, saleId));
  if (sale === undefined) return { state: "unknown", deliveryId: null, returnedFulfilment: false };
  const fulfilled = new Map<string, number>();
  const returnedByLine = new Map<string, number>();
  const activeDispatchRemaining = new Map<string, number>();
  let latestDelivery: DeliveryState | null = null;
  for (const delivery of store.deliveries.values()) {
    if (delivery.workspaceId !== workspaceId || delivery.saleId !== saleId) continue;
    if (delivery.status === "dispatched" || delivery.status === "delivered") {
      if (
        latestDelivery === null ||
        `${delivery.transactionTime}|${delivery.recordedAt}|${delivery.id}` >
          `${latestDelivery.transactionTime}|${latestDelivery.recordedAt}|${latestDelivery.id}`
      )
        latestDelivery = delivery;
      for (const line of delivery.lines)
        fulfilled.set(
          line.saleLineId,
          exactAdd(
            fulfilled.get(line.saleLineId) ?? 0,
            line.quantity.valueScaled,
            "dashboard.sale_fulfilled.value_scaled",
          ),
        );
      if (delivery.status === "dispatched")
        for (const line of delivery.lines)
          activeDispatchRemaining.set(
            line.saleLineId,
            exactAdd(
              activeDispatchRemaining.get(line.saleLineId) ?? 0,
              line.quantity.valueScaled,
              "dashboard.active_dispatch.value_scaled",
            ),
          );
    }
  }
  for (const returned of store.deliveryReturns) {
    if (returned.workspaceId !== workspaceId) continue;
    const delivery = store.deliveries.get(key(workspaceId, returned.deliveryId));
    if (
      delivery === undefined ||
      delivery.saleId !== saleId ||
      (delivery.status !== "dispatched" && delivery.status !== "delivered")
    )
      continue;
    for (const line of returned.lines) {
      const deliveryLine = delivery.lines.find(
        (candidate) => candidate.deliveryLineId === line.deliveryLineId,
      );
      if (deliveryLine === undefined) continue;
      fulfilled.set(
        deliveryLine.saleLineId,
        exactSubtract(
          fulfilled.get(deliveryLine.saleLineId) ?? 0,
          line.quantity.valueScaled,
          "dashboard.sale_fulfilled.value_scaled",
        ),
      );
      returnedByLine.set(
        deliveryLine.saleLineId,
        exactAdd(
          returnedByLine.get(deliveryLine.saleLineId) ?? 0,
          line.quantity.valueScaled,
          "dashboard.sale_returned.value_scaled",
        ),
      );
      if (delivery.status === "dispatched")
        activeDispatchRemaining.set(
          deliveryLine.saleLineId,
          Math.max(
            0,
            exactSubtract(
              activeDispatchRemaining.get(deliveryLine.saleLineId) ?? 0,
              line.quantity.valueScaled,
              "dashboard.active_dispatch.value_scaled",
            ),
          ),
        );
    }
  }
  const deliveryId = latestDelivery?.id ?? null;
  const facts = sale.lines.map((line) => {
    const netFulfilled = fulfilled.get(line.lineId) ?? 0;
    const returned = returnedByLine.get(line.lineId) ?? 0;
    return deriveSaleLineFulfilmentFacts({
      orderedQuantityScaled: line.quantity.valueScaled,
      dispatchedQuantityScaled: exactAdd(
        netFulfilled,
        returned,
        "dashboard.sale_dispatched.value_scaled",
      ),
      returnedQuantityScaled: returned,
      activeDispatchedRemainingQuantityScaled: activeDispatchRemaining.get(line.lineId) ?? 0,
    });
  });
  const returnedFulfilment = facts.some(
    (fact, index) =>
      fact.returnedQuantityScaled > 0 &&
      fact.netFulfilledQuantityScaled < sale.lines[index]!.quantity.valueScaled,
  );
  if (facts.some((fact) => fact.integrity))
    return { state: "attention", deliveryId, returnedFulfilment: false };
  if (facts.every((fact) => fact.remainingQuantityScaled === 0))
    return { state: "delivered", deliveryId, returnedFulfilment: false };
  return {
    state: facts.some((fact) => fact.activeDispatchedRemainingQuantityScaled > 0)
      ? "in_delivery"
      : "needs_delivery",
    deliveryId,
    returnedFulfilment,
  };
}

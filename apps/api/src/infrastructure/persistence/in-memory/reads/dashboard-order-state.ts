import type { DeliveryState } from "@vuarau/domain-kernel";
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
  const allocated = store.paymentAllocations
    .filter(
      (allocation) => allocation.workspaceId === workspaceId && allocation.paymentId === paymentId,
    )
    .reduce(
      (sum, allocation) =>
        exactAdd(sum, allocation.amount.amountMinor, "dashboard.payment_allocation.amount_minor"),
      0,
    );
  const reversedAllocations = store.paymentAllocationReversals
    .filter(
      (reversal) =>
        reversal.workspaceId === workspaceId &&
        store.paymentAllocations.some(
          (allocation) =>
            allocation.id === reversal.allocationId && allocation.paymentId === paymentId,
        ),
    )
    .reduce(
      (sum, reversal) =>
        exactAdd(sum, reversal.amount.amountMinor, "dashboard.payment_reversal.amount_minor"),
      0,
    );
  const preservedCredit = [...store.debtObservations.values()]
    .filter(
      (observation) =>
        observation.workspaceId === workspaceId &&
        observation.kind === "customer_credit_preserved" &&
        observation.facts.paymentReference === paymentId &&
        ![...store.debtObservations.values()].some(
          (successor) => successor.relatedObservationId === observation.id,
        ),
    )
    .reduce(
      (sum, observation) =>
        exactAdd(
          sum,
          observation.facts.amount?.amountMinor ?? 0,
          "dashboard.customer_credit_preserved.amount_minor",
        ),
      0,
    );
  return Math.max(
    0,
    exactAdd(
      exactSubtract(
        exactSubtract(
          payment.amount.amountMinor,
          payment.reversedAmount.amountMinor,
          "dashboard.payment_remaining.amount_minor",
        ),
        allocated,
        "dashboard.payment_remaining.amount_minor",
      ),
      exactSubtract(
        reversedAllocations,
        preservedCredit,
        "dashboard.payment_remaining.amount_minor",
      ),
      "dashboard.payment_remaining.amount_minor",
    ),
  );
}

export function saleNextAction(input: {
  readonly voided: boolean;
  readonly physicalState: string;
  readonly returnedFulfilment: boolean;
  readonly fulfilmentRemainderUnresolved?: boolean;
  readonly fulfilmentRemainderOutcome?: FulfilmentRemainderOutcome | null;
  readonly unallocatedPayment: boolean;
  readonly financialState: string;
}): string | null {
  if (input.voided) return null;
  if (input.physicalState === "attention") return "Kiểm tra";
  if (input.returnedFulfilment) return "Xử lý hàng trả";
  if (input.fulfilmentRemainderUnresolved) return "Mở Sale để quyết định phần còn lại.";
  if (input.fulfilmentRemainderOutcome === "commercial_correction")
    return "Mở Sale để điều chỉnh thương mại.";
  if (
    input.physicalState === "needs_delivery" &&
    input.fulfilmentRemainderOutcome !== "cancel_remainder"
  )
    return "Giao hàng";
  if (input.physicalState === "in_delivery") return "Theo dõi giao hàng";
  return ["awaiting_payment", "overdue"].includes(input.financialState) ? "Thu tiền" : null;
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
            line.deliveryLineId,
            exactAdd(
              activeDispatchRemaining.get(line.deliveryLineId) ?? 0,
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
          line.deliveryLineId,
          exactSubtract(
            activeDispatchRemaining.get(line.deliveryLineId) ?? 0,
            line.quantity.valueScaled,
            "dashboard.active_dispatch.value_scaled",
          ),
        );
    }
  }
  const deliveryId = latestDelivery?.id ?? null;
  const returnedFulfilment = sale.lines.some(
    (line) =>
      (returnedByLine.get(line.lineId) ?? 0) > 0 &&
      (fulfilled.get(line.lineId) ?? 0) < line.quantity.valueScaled,
  );
  if (sale.lines.some((line) => (fulfilled.get(line.lineId) ?? 0) > line.quantity.valueScaled))
    return { state: "attention", deliveryId, returnedFulfilment: false };
  const hasRemaining = sale.lines.some(
    (line) => line.quantity.valueScaled > (fulfilled.get(line.lineId) ?? 0),
  );
  if (!hasRemaining) return { state: "delivered", deliveryId, returnedFulfilment: false };
  return {
    state: [...activeDispatchRemaining.values()].some((value) => value > 0)
      ? "in_delivery"
      : "needs_delivery",
    deliveryId,
    returnedFulfilment,
  };
}

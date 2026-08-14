import type { DeliveryState } from "@vuarau/domain-kernel";
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
  const unallocated = [...store.payments.values()]
    .filter(
      (payment) =>
        payment.workspaceId === workspaceId &&
        payment.customerId === sale?.customerId &&
        payment.status !== "reversed",
    )
    .reduce((sum, payment) => {
      const allocatedToPayment = store.paymentAllocations
        .filter(
          (allocation) =>
            allocation.workspaceId === workspaceId && allocation.paymentId === payment.id,
        )
        .reduce(
          (total, allocation) =>
            exactAdd(
              total,
              allocation.amount.amountMinor,
              "dashboard.payment_allocation.amount_minor",
            ),
          0,
        );
      const reversedAllocations = store.paymentAllocationReversals
        .filter(
          (reversal) =>
            reversal.workspaceId === workspaceId &&
            store.paymentAllocations.some(
              (allocation) =>
                allocation.id === reversal.allocationId && allocation.paymentId === payment.id,
            ),
        )
        .reduce(
          (total, reversal) =>
            exactAdd(total, reversal.amount.amountMinor, "dashboard.payment_reversal.amount_minor"),
          0,
        );
      const remaining = exactAdd(
        exactSubtract(
          exactSubtract(
            payment.amount.amountMinor,
            payment.reversedAmount.amountMinor,
            "dashboard.payment_remaining.amount_minor",
          ),
          allocatedToPayment,
          "dashboard.payment_remaining.amount_minor",
        ),
        reversedAllocations,
        "dashboard.payment_remaining.amount_minor",
      );
      return exactAdd(sum, Math.max(0, remaining), "dashboard.unallocated_payment.amount_minor");
    }, 0);
  if (unallocated > 0)
    return { state: "reconciliation_required", unallocatedPaymentAmountMinor: unallocated };
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

export function saleNextAction(input: {
  readonly voided: boolean;
  readonly physicalState: string;
  readonly returnedFulfilment: boolean;
  readonly unallocatedPayment: boolean;
  readonly financialState: string;
}): string | null {
  if (input.voided) return null;
  if (input.physicalState === "attention") return "Kiểm tra";
  if (input.returnedFulfilment) return "Xử lý hàng trả";
  if (input.unallocatedPayment) return "Mở khoản thanh toán để phân bổ hoặc ghi nhận tín dụng.";
  if (input.physicalState === "needs_delivery") return "Giao hàng";
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

import type { Repositories } from "../../ports.ts";
import { deriveSaleLineFulfilmentFacts, type SaleLineFulfilmentFacts } from "@vuarau/domain-kernel";
import { key } from "../store.ts";
import type { Store } from "../store.ts";
import { exactAdd, exactSubtract } from "../reads/exact-number.ts";

export function fulfilmentFactsForSale(
  store: Store,
  workspaceId: string,
  saleId: string,
  excludeDeliveryId: string | null,
): ReadonlyMap<string, SaleLineFulfilmentFacts> {
  const sale = store.sales.get(key(workspaceId, saleId));
  if (sale === undefined) return new Map();
  const dispatched = new Map<string, number>();
  const returned = new Map<string, number>();
  const activeDispatchedRemaining = new Map<string, number>();
  const invalid = new Set<string>();
  for (const delivery of store.deliveries.values()) {
    if (
      delivery.workspaceId !== workspaceId ||
      delivery.saleId !== saleId ||
      delivery.id === excludeDeliveryId ||
      !["dispatched", "delivered"].includes(delivery.status)
    )
      continue;
    for (const line of delivery.lines) {
      const saleLine = sale.lines.find((candidate) => candidate.lineId === line.saleLineId);
      if (
        saleLine === undefined ||
        saleLine.productId !== line.productId ||
        saleLine.qualityGradeId !== line.qualityGradeId ||
        saleLine.quantity.unit !== line.quantity.unit
      )
        invalid.add(line.saleLineId);
      dispatched.set(
        line.saleLineId,
        exactAdd(
          dispatched.get(line.saleLineId) ?? 0,
          line.quantity.valueScaled,
          "delivery.fulfilment.dispatched.quantity_scaled",
        ),
      );
      if (delivery.status === "dispatched") {
        activeDispatchedRemaining.set(
          line.saleLineId,
          exactAdd(
            activeDispatchedRemaining.get(line.saleLineId) ?? 0,
            line.quantity.valueScaled,
            "delivery.fulfilment.active_remaining.quantity_scaled",
          ),
        );
      }
    }
  }
  for (const returnedRecord of store.deliveryReturns) {
    const delivery = store.deliveries.get(key(workspaceId, returnedRecord.deliveryId));
    if (
      returnedRecord.workspaceId !== workspaceId ||
      delivery?.saleId !== saleId ||
      delivery.id === excludeDeliveryId ||
      !["dispatched", "delivered"].includes(delivery.status)
    )
      continue;
    for (const returnedLine of returnedRecord.lines) {
      const deliveryLine = delivery.lines.find(
        (candidate) => candidate.deliveryLineId === returnedLine.deliveryLineId,
      );
      if (deliveryLine === undefined) continue;
      if (deliveryLine.quantity.unit !== returnedLine.quantity.unit)
        invalid.add(deliveryLine.saleLineId);
      returned.set(
        deliveryLine.saleLineId,
        exactAdd(
          returned.get(deliveryLine.saleLineId) ?? 0,
          returnedLine.quantity.valueScaled,
          "delivery.fulfilment.returned.quantity_scaled",
        ),
      );
      if (delivery.status === "dispatched") {
        activeDispatchedRemaining.set(
          deliveryLine.saleLineId,
          Math.max(
            0,
            exactSubtract(
              activeDispatchedRemaining.get(deliveryLine.saleLineId) ?? 0,
              returnedLine.quantity.valueScaled,
              "delivery.fulfilment.active_remaining.quantity_scaled",
            ),
          ),
        );
      }
    }
  }
  return new Map(
    sale.lines.map((line) => [
      line.lineId,
      deriveSaleLineFulfilmentFacts({
        orderedQuantityScaled: line.quantity.valueScaled,
        dispatchedQuantityScaled: dispatched.get(line.lineId) ?? 0,
        returnedQuantityScaled: returned.get(line.lineId) ?? 0,
        activeDispatchedRemainingQuantityScaled: activeDispatchedRemaining.get(line.lineId) ?? 0,
        invalidUnit: invalid.has(line.lineId),
      }),
    ]),
  );
}

export const createDeliveryRepositories = (store: Store): Pick<Repositories, "deliveries"> => ({
  deliveries: {
    findById: async (workspaceId, deliveryId) =>
      store.deliveries.get(key(workspaceId, deliveryId)) ?? null,
    findByIdForUpdate: async (workspaceId, deliveryId) =>
      store.deliveries.get(key(workspaceId, deliveryId)) ?? null,
    insert: async (delivery) => {
      const deliveryKey = key(delivery.workspaceId, delivery.id);
      if (store.deliveries.has(deliveryKey)) return false;
      store.deliveries.set(deliveryKey, delivery);
      return true;
    },
    update: async (delivery, expectedVersion) => {
      const deliveryKey = key(delivery.workspaceId, delivery.id);
      const current = store.deliveries.get(deliveryKey);
      if (current === undefined || current.version !== expectedVersion) return false;
      store.deliveries.set(deliveryKey, delivery);
      return true;
    },
    insertReturn: async (record) => {
      if (
        store.deliveryReturns.some(
          (candidate) => candidate.workspaceId === record.workspaceId && candidate.id === record.id,
        )
      )
        return false;
      store.deliveryReturns.push(record);
      const deliveryKey = key(record.workspaceId, record.deliveryId);
      const delivery = store.deliveries.get(deliveryKey);
      if (delivery !== undefined)
        store.deliveries.set(deliveryKey, {
          ...delivery,
          returns: [...delivery.returns, record],
        });
      return true;
    },
    findReturnByIdForUpdate: async (workspaceId, returnId) =>
      store.deliveryReturns.find(
        (candidate) => candidate.workspaceId === workspaceId && candidate.id === returnId,
      ) ?? null,
    netFulfilledBySaleLine: async (workspaceId, saleId, excludeDeliveryId) =>
      new Map(
        [...fulfilmentFactsForSale(store, workspaceId, saleId, excludeDeliveryId)].map(
          ([lineId, facts]) => [lineId, facts.netFulfilledQuantityScaled] as const,
        ),
      ),
    fulfilmentBySaleLine: async (workspaceId, saleId) =>
      fulfilmentFactsForSale(store, workspaceId, saleId, null),
  },
});

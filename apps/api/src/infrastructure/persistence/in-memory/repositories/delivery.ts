import type { Repositories } from "../../ports.ts";
import { key } from "../store.ts";
import type { Store } from "../store.ts";

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
    netFulfilledBySaleLine: async (workspaceId, saleId, excludeDeliveryId) => {
      const totals = new Map<string, number>();
      for (const delivery of store.deliveries.values()) {
        if (
          delivery.workspaceId !== workspaceId ||
          delivery.saleId !== saleId ||
          delivery.id === excludeDeliveryId ||
          !["dispatched", "delivered"].includes(delivery.status)
        )
          continue;
        for (const line of delivery.lines)
          totals.set(
            line.saleLineId,
            (totals.get(line.saleLineId) ?? 0) + line.quantity.valueScaled,
          );
      }
      for (const returned of store.deliveryReturns) {
        const delivery = store.deliveries.get(key(workspaceId, returned.deliveryId));
        if (
          returned.workspaceId !== workspaceId ||
          delivery?.saleId !== saleId ||
          delivery.id === excludeDeliveryId
        )
          continue;
        for (const line of returned.lines) {
          const deliveryLine = delivery.lines.find(
            (candidate) => candidate.deliveryLineId === line.deliveryLineId,
          );
          if (deliveryLine !== undefined)
            totals.set(
              deliveryLine.saleLineId,
              (totals.get(deliveryLine.saleLineId) ?? 0) - line.quantity.valueScaled,
            );
        }
      }
      return totals;
    },
    fulfilmentBySaleLine: async (workspaceId, saleId) => {
      const totals = new Map<string, { dispatched: number; returned: number }>();
      for (const delivery of store.deliveries.values()) {
        if (
          delivery.workspaceId !== workspaceId ||
          delivery.saleId !== saleId ||
          !["dispatched", "delivered"].includes(delivery.status)
        )
          continue;
        for (const line of delivery.lines) {
          const current = totals.get(line.saleLineId) ?? { dispatched: 0, returned: 0 };
          totals.set(line.saleLineId, {
            dispatched: current.dispatched + line.quantity.valueScaled,
            returned: current.returned,
          });
        }
      }
      for (const returned of store.deliveryReturns) {
        const delivery = store.deliveries.get(key(workspaceId, returned.deliveryId));
        if (returned.workspaceId !== workspaceId || delivery?.saleId !== saleId) continue;
        for (const line of returned.lines) {
          const deliveryLine = delivery.lines.find(
            (candidate) => candidate.deliveryLineId === line.deliveryLineId,
          );
          if (deliveryLine === undefined) continue;
          const current = totals.get(deliveryLine.saleLineId) ?? {
            dispatched: 0,
            returned: 0,
          };
          totals.set(deliveryLine.saleLineId, {
            dispatched: current.dispatched,
            returned: current.returned + line.quantity.valueScaled,
          });
        }
      }
      return totals;
    },
  },
});

import type { Repositories } from "../../ports.ts";
import type { InventoryMovementState } from "@vuarau/domain-kernel";
import type { IdGenerator } from "../../../clock.ts";
import type { Store } from "../store.ts";

export const createInventoryRepositories = (
  store: Store,
  ids: IdGenerator,
): Pick<Repositories, "inventoryMovements" | "inventoryBalances"> => ({
  inventoryMovements: {
    append: async (movements) => {
      const appended: InventoryMovementState[] = [];
      for (const movement of movements) {
        const duplicate = store.inventoryMovements.some(
          (existing) =>
            existing.workspaceId === movement.workspaceId &&
            existing.sourceType === movement.sourceType &&
            existing.sourceId === movement.sourceId &&
            (movement.sourceType === "inventory_adjustment" ||
              (movement.sourceLineId !== null && existing.sourceLineId === movement.sourceLineId)),
        );
        if (!duplicate) {
          appended.push({
            ...movement,
            id: ids.newId() as InventoryMovementState["id"],
          });
        }
      }
      store.inventoryMovements.push(...appended);
      return appended;
    },
    listByProduct: async (workspaceId, productId, unit) =>
      store.inventoryMovements
        .filter(
          (movement) =>
            movement.workspaceId === workspaceId &&
            movement.productId === productId &&
            (unit === null || movement.quantity.unit === unit),
        )
        .sort((a, b) =>
          a.transactionTime !== b.transactionTime
            ? a.transactionTime.localeCompare(b.transactionTime)
            : a.recordedAt !== b.recordedAt
              ? a.recordedAt.localeCompare(b.recordedAt)
              : a.id.localeCompare(b.id),
        ),
  },
  inventoryBalances: {
    get: async (workspaceId, productId, unit) =>
      store.inventoryBalances.get(`${workspaceId}:${productId}:${unit}`) ?? null,
    applyDelta: async (delta) => {
      const balanceKey = `${delta.workspaceId}:${delta.productId}:${delta.unit}`;
      const current = store.inventoryBalances.get(balanceKey);
      store.inventoryBalances.set(balanceKey, {
        workspaceId: delta.workspaceId,
        productId: delta.productId,
        unit: delta.unit,
        quantityScaled: (current?.quantityScaled ?? 0) + delta.quantityScaled,
        movementCount: (current?.movementCount ?? 0) + delta.movementCount,
        lastMovementTransactionTime:
          current?.lastMovementTransactionTime !== null &&
          current?.lastMovementTransactionTime !== undefined &&
          current.lastMovementTransactionTime > delta.lastMovementTransactionTime
            ? current.lastMovementTransactionTime
            : delta.lastMovementTransactionTime,
        updatedAt:
          current !== undefined && current.updatedAt > delta.updatedAt
            ? current.updatedAt
            : delta.updatedAt,
      });
    },
    save: async (balance) => {
      store.inventoryBalances.set(
        `${balance.workspaceId}:${balance.productId}:${balance.unit}`,
        balance,
      );
    },
  },
});

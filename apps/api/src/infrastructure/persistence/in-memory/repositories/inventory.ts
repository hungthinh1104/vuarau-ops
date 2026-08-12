import type { Repositories } from "../../ports.ts";
import { PersistedNumberOutOfRangeError } from "@vuarau/db";
import { sumExactIntegers, type InventoryMovementState } from "@vuarau/domain-kernel";
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
    listByProducts: async (workspaceId, productIds) =>
      store.inventoryMovements
        .filter(
          (movement) =>
            movement.workspaceId === workspaceId && productIds.includes(movement.productId),
        )
        .sort((a, b) =>
          a.transactionTime !== b.transactionTime
            ? a.transactionTime.localeCompare(b.transactionTime)
            : a.recordedAt !== b.recordedAt
              ? a.recordedAt.localeCompare(b.recordedAt)
              : a.id.localeCompare(b.id),
        ),
    listBySource: async (workspaceId, sourceType, sourceId) =>
      store.inventoryMovements
        .filter(
          (movement) =>
            movement.workspaceId === workspaceId &&
            movement.sourceType === sourceType &&
            movement.sourceId === sourceId,
        )
        .sort(
          (a, b) =>
            (a.sourceLineId ?? "").localeCompare(b.sourceLineId ?? "") || a.id.localeCompare(b.id),
        ),
    listByIds: async (workspaceId, movementIds) => {
      const ids = new Set(movementIds);
      return store.inventoryMovements
        .filter((movement) => movement.workspaceId === workspaceId && ids.has(movement.id))
        .sort((a, b) => a.id.localeCompare(b.id));
    },
    aggregateByScopesAsOf: async (workspaceId, scopes, asOf) => {
      const uniqueScopes = [
        ...new Map(
          scopes.map((scope) => [
            `${scope.productId}:${scope.qualityGradeId ?? "ungraded"}:${scope.unit}`,
            scope,
          ]),
        ).values(),
      ];
      return uniqueScopes.map((scope) => {
        let total = 0;
        let outOfRange = false;
        for (const movement of store.inventoryMovements) {
          if (
            movement.workspaceId !== workspaceId ||
            movement.productId !== scope.productId ||
            movement.qualityGradeId !== scope.qualityGradeId ||
            movement.quantity.unit !== scope.unit ||
            Date.parse(movement.transactionTime) > Date.parse(asOf)
          ) {
            continue;
          }
          const next = sumExactIntegers([total, movement.quantity.valueScaled]);
          if (next === null) {
            outOfRange = true;
            break;
          }
          total = next;
        }
        return {
          productId: scope.productId,
          qualityGradeId: scope.qualityGradeId,
          unit: scope.unit,
          quantityScaled: outOfRange ? null : total,
        };
      });
    },
    hasByProductQualityGrade: async (workspaceId, productId, qualityGradeId, unit) =>
      store.inventoryMovements.some(
        (movement) =>
          movement.workspaceId === workspaceId &&
          movement.productId === productId &&
          movement.qualityGradeId === qualityGradeId &&
          movement.quantity.unit === unit,
      ),
  },
  inventoryBalances: {
    get: async (workspaceId, productId, qualityGradeId, unit) =>
      store.inventoryBalances.get(
        `${workspaceId}:${productId}:${qualityGradeId ?? "legacy"}:${unit}`,
      ) ?? null,
    applyDelta: async (delta) => {
      const balanceKey = `${delta.workspaceId}:${delta.productId}:${delta.qualityGradeId ?? "legacy"}:${delta.unit}`;
      const current = store.inventoryBalances.get(balanceKey);
      if (
        !Number.isSafeInteger(delta.quantityScaled) ||
        (current !== undefined && !Number.isSafeInteger(current.quantityScaled))
      ) {
        throw new PersistedNumberOutOfRangeError("inventory_balances.quantity_scaled");
      }
      const nextQuantityScaled =
        BigInt(current?.quantityScaled ?? 0) + BigInt(delta.quantityScaled);
      if (
        nextQuantityScaled < BigInt(Number.MIN_SAFE_INTEGER) ||
        nextQuantityScaled > BigInt(Number.MAX_SAFE_INTEGER)
      ) {
        throw new PersistedNumberOutOfRangeError("inventory_balances.quantity_scaled");
      }
      store.inventoryBalances.set(balanceKey, {
        workspaceId: delta.workspaceId,
        productId: delta.productId,
        qualityGradeId: delta.qualityGradeId,
        unit: delta.unit,
        quantityScaled: Number(nextQuantityScaled),
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
      if (!Number.isSafeInteger(balance.quantityScaled)) {
        throw new PersistedNumberOutOfRangeError("inventory_balances.quantity_scaled");
      }
      store.inventoryBalances.set(
        `${balance.workspaceId}:${balance.productId}:${balance.qualityGradeId ?? "legacy"}:${balance.unit}`,
        balance,
      );
    },
  },
});

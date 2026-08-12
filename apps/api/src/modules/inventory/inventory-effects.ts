import type { InventoryMovementState } from "@vuarau/domain-kernel";
import { PersistedNumberOutOfRangeError } from "@vuarau/db";
import type { Repositories } from "../../infrastructure/persistence/ports.ts";

export async function applyInventoryMovements(
  repos: Repositories,
  drafts: readonly Omit<InventoryMovementState, "id">[],
) {
  const appended = await repos.inventoryMovements.append(drafts);
  const keyOf = (
    value: Pick<
      InventoryMovementState,
      "workspaceId" | "productId" | "qualityGradeId" | "quantity"
    >,
  ) =>
    `${value.workspaceId}:${value.productId}:${value.qualityGradeId ?? "legacy"}:${value.quantity.unit}`;
  const movementsByKey = new Map<string, InventoryMovementState[]>();
  for (const movement of appended) {
    const key = keyOf(movement);
    const bucket = movementsByKey.get(key) ?? [];
    bucket.push(movement);
    movementsByKey.set(key, bucket);
  }
  // A reclassification (or any multi-bucket movement) can touch more than one
  // balance row. Stable acquisition order prevents opposite reclassifications
  // from waiting on each other's upsert locks in PostgreSQL.
  for (const [, movements] of [...movementsByKey.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const target = movements[0]!;
    let quantityScaled = 0n;
    let last = movements[0]!.transactionTime;
    for (const movement of movements) {
      quantityScaled += BigInt(movement.quantity.valueScaled);
      if (movement.transactionTime > last) last = movement.transactionTime;
    }
    if (
      quantityScaled < BigInt(Number.MIN_SAFE_INTEGER) ||
      quantityScaled > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      throw new PersistedNumberOutOfRangeError(
        `inventory_balances.${target.productId}.${target.quantity.unit}.quantity_scaled`,
      );
    }
    await repos.inventoryBalances.applyDelta({
      workspaceId: target.workspaceId,
      productId: target.productId,
      qualityGradeId: target.qualityGradeId,
      unit: target.quantity.unit,
      quantityScaled: Number(quantityScaled),
      movementCount: movements.length,
      lastMovementTransactionTime: last,
      updatedAt: movements[movements.length - 1]!.recordedAt,
    });
  }
  return appended;
}

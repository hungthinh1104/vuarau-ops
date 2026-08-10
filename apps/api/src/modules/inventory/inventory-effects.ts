import type { InventoryMovementState } from "@vuarau/domain-kernel";
import type { Repositories } from "../../infrastructure/persistence/ports.ts";

export async function applyInventoryMovements(
  repos: Repositories,
  drafts: readonly Omit<InventoryMovementState, "id">[],
) {
  const appended = await repos.inventoryMovements.append(drafts);
  const keys = new Map<
    string,
    {
      workspaceId: InventoryMovementState["workspaceId"];
      productId: InventoryMovementState["productId"];
      qualityGradeId: InventoryMovementState["qualityGradeId"];
      unit: InventoryMovementState["quantity"]["unit"];
    }
  >();
  for (const movement of appended) {
    keys.set(
      `${movement.workspaceId}:${movement.productId}:${movement.qualityGradeId ?? "legacy"}:${movement.quantity.unit}`,
      {
        workspaceId: movement.workspaceId,
        productId: movement.productId,
        qualityGradeId: movement.qualityGradeId,
        unit: movement.quantity.unit,
      },
    );
  }
  // A reclassification (or any multi-bucket movement) can touch more than one
  // balance row. Stable acquisition order prevents opposite reclassifications
  // from waiting on each other's upsert locks in PostgreSQL.
  for (const target of [...keys.values()].sort((left, right) => {
    const keyOf = (value: typeof left | typeof right) =>
      `${value.workspaceId}:${value.productId}:${value.qualityGradeId ?? "legacy"}:${value.unit}`;
    return keyOf(left).localeCompare(keyOf(right));
  })) {
    const movements = appended.filter(
      (movement) =>
        movement.workspaceId === target.workspaceId &&
        movement.productId === target.productId &&
        movement.qualityGradeId === target.qualityGradeId &&
        movement.quantity.unit === target.unit,
    );
    let quantityScaled = 0;
    let last = movements[0]!.transactionTime;
    for (const movement of movements) {
      quantityScaled += movement.quantity.valueScaled;
      if (movement.transactionTime > last) last = movement.transactionTime;
    }
    await repos.inventoryBalances.applyDelta({
      workspaceId: target.workspaceId,
      productId: target.productId,
      qualityGradeId: target.qualityGradeId,
      unit: target.unit,
      quantityScaled,
      movementCount: movements.length,
      lastMovementTransactionTime: last,
      updatedAt: movements[movements.length - 1]!.recordedAt,
    });
  }
  return appended;
}

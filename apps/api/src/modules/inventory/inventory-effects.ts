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
      unit: InventoryMovementState["quantity"]["unit"];
    }
  >();
  for (const movement of appended) {
    keys.set(`${movement.workspaceId}:${movement.productId}:${movement.quantity.unit}`, {
      workspaceId: movement.workspaceId,
      productId: movement.productId,
      unit: movement.quantity.unit,
    });
  }
  for (const target of keys.values()) {
    const current = await repos.inventoryBalances.get(
      target.workspaceId,
      target.productId,
      target.unit,
    );
    const movements = appended.filter(
      (movement) =>
        movement.workspaceId === target.workspaceId &&
        movement.productId === target.productId &&
        movement.quantity.unit === target.unit,
    );
    let quantityScaled = current?.quantityScaled ?? 0;
    let last = current?.lastMovementTransactionTime ?? null;
    for (const movement of movements) {
      quantityScaled += movement.quantity.valueScaled;
      if (last === null || movement.transactionTime > last) last = movement.transactionTime;
    }
    await repos.inventoryBalances.save({
      workspaceId: target.workspaceId,
      productId: target.productId,
      unit: target.unit,
      quantityScaled,
      movementCount: (current?.movementCount ?? 0) + movements.length,
      lastMovementTransactionTime: last,
      updatedAt: movements[movements.length - 1]!.recordedAt,
    });
  }
  return appended;
}

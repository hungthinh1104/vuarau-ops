import type { ProductId, QualityGradeId, WorkspaceId } from "@vuarau/domain-contracts";
import type { InventoryMovementState } from "@vuarau/domain-kernel";

export type InventoryMovementRepository = {
  append(
    movements: readonly Omit<InventoryMovementState, "id">[],
  ): Promise<readonly InventoryMovementState[]>;
  listByProduct(
    workspaceId: WorkspaceId,
    productId: ProductId,
    unit: InventoryMovementState["quantity"]["unit"] | null,
  ): Promise<readonly InventoryMovementState[]>;
  listByProducts(
    workspaceId: WorkspaceId,
    productIds: readonly ProductId[],
  ): Promise<readonly InventoryMovementState[]>;
  /**
   * Checks historical existence without materializing the product's movement
   * timeline. Used when an inactive grade may still be decreased or counted.
   */
  hasByProductQualityGrade(
    workspaceId: WorkspaceId,
    productId: ProductId,
    qualityGradeId: QualityGradeId,
    unit: InventoryMovementState["quantity"]["unit"],
  ): Promise<boolean>;
};

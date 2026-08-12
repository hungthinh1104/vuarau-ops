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
   * Reads one command's movement lineage without loading the product timeline.
   */
  listBySource(
    workspaceId: WorkspaceId,
    sourceType: InventoryMovementState["sourceType"],
    sourceId: string,
  ): Promise<readonly InventoryMovementState[]>;
  /** Reads only the known movement ids stored by a stocktake lineage. */
  listByIds(
    workspaceId: WorkspaceId,
    movementIds: readonly InventoryMovementState["id"][],
  ): Promise<readonly InventoryMovementState[]>;
  /**
   * Sums exact as-of quantities for the requested product/grade/unit scopes.
   * A null result means the persisted aggregate is outside the safe number
   * range and must be handled as a controlled command rejection.
   */
  aggregateByScopesAsOf(
    workspaceId: WorkspaceId,
    scopes: readonly {
      productId: ProductId;
      qualityGradeId: QualityGradeId | null;
      unit: InventoryMovementState["quantity"]["unit"];
    }[],
    asOf: string,
  ): Promise<
    readonly {
      productId: ProductId;
      qualityGradeId: QualityGradeId | null;
      unit: InventoryMovementState["quantity"]["unit"];
      quantityScaled: number | null;
    }[]
  >;
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

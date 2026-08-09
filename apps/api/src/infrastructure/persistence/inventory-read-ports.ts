import type {
  InventoryBalanceDto,
  InventoryMovementDto,
  IsoInstant,
  ProductCoverageDto,
  ProductId,
  PurchaseId,
  PurchaseReceiptDto,
  QualityGradeId,
  Unit,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import type { InventoryValuationMovement } from "@vuarau/domain-kernel";
import type { PageQuery, PageResult } from "./read-ports.ts";

export type InventoryReadRepository = {
  receipt(workspaceId: WorkspaceId, receiptId: string): Promise<PurchaseReceiptDto | null>;
  receipts(
    workspaceId: WorkspaceId,
    purchaseId: PurchaseId,
  ): Promise<readonly PurchaseReceiptDto[]>;
  adjustment(workspaceId: WorkspaceId, adjustmentId: string): Promise<InventoryMovementDto | null>;
  balances(workspaceId: WorkspaceId, productId: ProductId): Promise<readonly InventoryBalanceDto[]>;
  coverage(
    workspaceId: WorkspaceId,
    productIds: readonly ProductId[],
  ): Promise<readonly ProductCoverageDto[]>;
  valuationSources(args: {
    workspaceId: WorkspaceId;
    productId: ProductId;
    qualityGradeId: QualityGradeId | null;
    unit: Unit | null;
    asOf: IsoInstant;
  }): Promise<readonly InventoryValuationMovement[]>;
  timeline(args: {
    workspaceId: WorkspaceId;
    productId: ProductId;
    qualityGradeId: QualityGradeId | null | undefined;
    unit: Unit | null;
    page: PageQuery;
  }): Promise<PageResult<InventoryMovementDto>>;
  integrity(
    workspaceId: WorkspaceId,
    productId: ProductId,
    qualityGradeId: QualityGradeId | null,
    unit: Unit,
  ): Promise<readonly string[]>;
};

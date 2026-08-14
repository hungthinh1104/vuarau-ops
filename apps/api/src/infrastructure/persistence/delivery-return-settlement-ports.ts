import type {
  DeliveryReturnId,
  DeliveryReturnSettlementDto,
  DeliveryReturnSettlementId,
  WorkspaceId,
} from "@vuarau/domain-contracts";

export type DeliveryReturnSettlementRepository = {
  findById(
    workspaceId: WorkspaceId,
    settlementId: DeliveryReturnSettlementId,
  ): Promise<DeliveryReturnSettlementDto | null>;
  findByIdForUpdate(
    workspaceId: WorkspaceId,
    settlementId: DeliveryReturnSettlementId,
  ): Promise<DeliveryReturnSettlementDto | null>;
  findCorrectionByTarget(
    workspaceId: WorkspaceId,
    settlementId: DeliveryReturnSettlementId,
  ): Promise<DeliveryReturnSettlementDto | null>;
  existsForReturn(workspaceId: WorkspaceId, returnId: DeliveryReturnId): Promise<boolean>;
  insert(settlement: DeliveryReturnSettlementDto): Promise<boolean>;
};

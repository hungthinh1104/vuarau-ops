import type {
  FulfilmentRemainderCaseDto,
  FulfilmentRemainderCaseId,
  SaleId,
  WorkspaceId,
} from "@vuarau/domain-contracts";

export type FulfilmentRemainderCaseRepository = {
  findById(
    workspaceId: WorkspaceId,
    caseId: FulfilmentRemainderCaseId,
  ): Promise<FulfilmentRemainderCaseDto | null>;
  findByIdForUpdate(
    workspaceId: WorkspaceId,
    caseId: FulfilmentRemainderCaseId,
  ): Promise<FulfilmentRemainderCaseDto | null>;
  findLatestForSale(
    workspaceId: WorkspaceId,
    saleId: SaleId,
  ): Promise<FulfilmentRemainderCaseDto | null>;
  findCorrectionByTarget(
    workspaceId: WorkspaceId,
    caseId: FulfilmentRemainderCaseId,
  ): Promise<FulfilmentRemainderCaseDto | null>;
  insert(remainderCase: FulfilmentRemainderCaseDto): Promise<boolean>;
};

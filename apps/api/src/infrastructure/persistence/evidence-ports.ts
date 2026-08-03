import type {
  CostObservationDto,
  CostObservationId,
  ReconciliationObservationDto,
  ReconciliationObservationId,
  DebtObservationDto,
  DebtObservationId,
  WorkspaceId,
} from "@vuarau/domain-contracts";

export type CostObservationRepository = {
  findById(
    workspaceId: WorkspaceId,
    observationId: CostObservationId,
  ): Promise<CostObservationDto | null>;
  insert(observation: CostObservationDto): Promise<boolean>;
};

export type ReconciliationObservationRepository = {
  findById(
    workspaceId: WorkspaceId,
    observationId: ReconciliationObservationId,
  ): Promise<ReconciliationObservationDto | null>;
  insert(observation: ReconciliationObservationDto): Promise<boolean>;
};

export type DebtObservationRepository = {
  findById(
    workspaceId: WorkspaceId,
    observationId: DebtObservationId,
  ): Promise<DebtObservationDto | null>;
  insert(observation: DebtObservationDto): Promise<boolean>;
};

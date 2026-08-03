import type { SupplyCommitmentId } from "@vuarau/domain-contracts";
import type { SupplyCommitmentState } from "@vuarau/domain-kernel";

export type SupplyCommitmentRepository = {
  findById(workspaceId: string, id: SupplyCommitmentId): Promise<SupplyCommitmentState | null>;
  findByIdForUpdate(
    workspaceId: string,
    id: SupplyCommitmentId,
  ): Promise<SupplyCommitmentState | null>;
  findReplacementOf(
    workspaceId: string,
    id: SupplyCommitmentId,
  ): Promise<SupplyCommitmentState | null>;
  insert(commitment: SupplyCommitmentState): Promise<boolean>;
  updateDraft(commitment: SupplyCommitmentState, expectedVersion: number): Promise<boolean>;
  confirm(commitment: SupplyCommitmentState, expectedVersion: number): Promise<boolean>;
  cancel(commitment: SupplyCommitmentState, expectedVersion: number): Promise<boolean>;
};

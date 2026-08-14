import type {
  WorkspaceBackupV20,
  WorkspaceId,
  WorkspaceIntegrityDto,
} from "@vuarau/domain-contracts";

export type OperationsReadRepository = {
  integrity(workspaceId: WorkspaceId): Promise<WorkspaceIntegrityDto>;
  backupPayload(workspaceId: WorkspaceId): Promise<WorkspaceBackupV20["payload"] | null>;
};

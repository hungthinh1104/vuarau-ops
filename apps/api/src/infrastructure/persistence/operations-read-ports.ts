import type {
  WorkspaceBackupV19,
  WorkspaceId,
  WorkspaceIntegrityDto,
} from "@vuarau/domain-contracts";

export type OperationsReadRepository = {
  integrity(workspaceId: WorkspaceId): Promise<WorkspaceIntegrityDto>;
  backupPayload(workspaceId: WorkspaceId): Promise<WorkspaceBackupV19["payload"] | null>;
};

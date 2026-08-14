import type {
  WorkspaceBackupV22,
  WorkspaceId,
  WorkspaceIntegrityDto,
} from "@vuarau/domain-contracts";

export type OperationsReadRepository = {
  integrity(workspaceId: WorkspaceId): Promise<WorkspaceIntegrityDto>;
  backupPayload(workspaceId: WorkspaceId): Promise<WorkspaceBackupV22["payload"] | null>;
};

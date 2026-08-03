import type {
  WorkspaceBackupV18,
  WorkspaceId,
  WorkspaceIntegrityDto,
} from "@vuarau/domain-contracts";

export type OperationsReadRepository = {
  integrity(workspaceId: WorkspaceId): Promise<WorkspaceIntegrityDto>;
  backupPayload(workspaceId: WorkspaceId): Promise<WorkspaceBackupV18["payload"] | null>;
};

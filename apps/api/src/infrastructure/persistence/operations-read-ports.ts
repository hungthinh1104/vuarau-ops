import type {
  IsoInstant,
  OperationsExceptionKind,
  OperationsExceptionSource,
  WorkspaceBackupV23,
  WorkspaceId,
  WorkspaceIntegrityDto,
} from "@vuarau/domain-contracts";

export type CurrentOperationsExceptionIdentity = {
  readonly kind: OperationsExceptionKind;
  readonly source: OperationsExceptionSource & { readonly id: string };
};

export type OperationsReadRepository = {
  integrity(workspaceId: WorkspaceId): Promise<WorkspaceIntegrityDto>;
  listCurrentExceptionIdentities(args: {
    workspaceId: WorkspaceId;
    asOf: IsoInstant;
  }): Promise<readonly CurrentOperationsExceptionIdentity[]>;
  backupPayload(workspaceId: WorkspaceId): Promise<WorkspaceBackupV23["payload"] | null>;
};

import type { WorkspaceBackupV22, WorkspaceId } from "@vuarau/domain-contracts";

export type OperationsRepository = {
  restoreBackup(
    workspaceId: WorkspaceId,
    payload: WorkspaceBackupV22["payload"],
  ): Promise<
    | { readonly kind: "restored"; readonly counts: Readonly<Record<string, number>> }
    | { readonly kind: "unsafe_target" | "integrity_error"; readonly reason: string }
  >;
};

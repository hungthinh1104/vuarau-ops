"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  exportWorkspaceBackupCommandSchema,
  restoreWorkspaceBackupCommandSchema,
  type WorkspaceBackup,
} from "@vuarau/domain-contracts";
import { workspaceBackupSchema } from "@vuarau/domain-contracts";
import { useEffect, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { useOffline } from "@/offline/provider.tsx";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { OperationsView } from "@/ui/screens/operations-view.tsx";

export function OperationsController() {
  const { workspaceId, session } = useSession();
  const offline = useOffline();
  const trpc = useTRPC();
  const [backup, setBackup] = useState<WorkspaceBackup | null>(null);
  const [restoreReason, setRestoreReason] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);

  const integrity = useQuery(trpc.operations.integrity.queryOptions({ workspaceId }));
  const exportMutation = useMutation(trpc.operations.exportBackup.mutationOptions());
  const exportCommand = useContractCommand(
    exportWorkspaceBackupCommandSchema,
    exportMutation.mutateAsync,
  );
  const validation = useQuery({
    ...trpc.operations.validateBackup.queryOptions({
      workspaceId,
      backup: backup as WorkspaceBackup,
    }),
    enabled: backup !== null,
  });
  const restoreMutation = useMutation(trpc.operations.restoreBackup.mutationOptions());
  const restore = useContractCommand(
    restoreWorkspaceBackupCommandSchema,
    restoreMutation.mutateAsync,
  );

  useEffect(() => {
    if (!exportCommand.result) return;
    const blob = new Blob([JSON.stringify(exportCommand.result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `vuarau-backup-${workspaceId}-${exportCommand.result.digest.slice(0, 12)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [exportCommand.result, workspaceId]);

  useEffect(() => {
    if (restore.result === null) return;
    void integrity.refetch();
  }, [integrity.refetch, restore.result]);

  async function readBackupFile(file: File): Promise<void> {
    setFileError(null);
    try {
      const parsed = workspaceBackupSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) {
        setBackup(null);
        setFileError("File sao lưu không đúng định dạng.");
        return;
      }
      setBackup(parsed.data);
    } catch {
      setBackup(null);
      setFileError("File không phải JSON hợp lệ.");
    }
  }

  const exportLocked =
    exportCommand.phase.kind === "sending" || exportCommand.phase.kind === "unknown";
  const restoreLocked = restore.phase.kind === "sending" || restore.phase.kind === "unknown";

  return (
    <OperationsView
      canManage={session.permissions.includes("workspace.manage")}
      queuedCount={offline.queuedCount}
      blockedCount={offline.blockedCount}
      lastSuccessfulSync={offline.lastSuccessfulSync}
      integrityState={integrity.isPending ? "loading" : integrity.isError ? "error" : "ready"}
      integrity={integrity.data ?? null}
      exportLocked={exportLocked}
      exportCompleted={exportCommand.phase.kind === "succeeded"}
      backupSelected={backup !== null}
      validation={validation.data ?? null}
      validationPending={validation.isFetching}
      fileError={fileError}
      restoreReason={restoreReason}
      restoreLocked={restoreLocked}
      restoreCompleted={restore.phase.kind === "succeeded"}
      onRetrySync={() => void offline.retry()}
      onRetryIntegrity={() => void integrity.refetch()}
      onExport={() => void exportCommand.submit({})}
      onResetExport={() => exportCommand.reset()}
      onBackupFileSelected={(file) => void readBackupFile(file)}
      onRestoreReasonChange={setRestoreReason}
      onRestore={() => {
        if (backup !== null) void restore.submit({ backup, reason: restoreReason.trim() });
      }}
      exportOutcome={
        <CommandOutcome
          command={exportCommand}
          attemptedAction="Xuất bản sao lưu"
          onReload={() => undefined}
        />
      }
      restoreOutcome={
        <CommandOutcome
          command={restore}
          attemptedAction="Phục hồi bản sao lưu"
          onReload={() => void integrity.refetch()}
        />
      }
    />
  );
}

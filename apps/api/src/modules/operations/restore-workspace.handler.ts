import type {
  RestoreWorkspaceBackupCommand,
  WorkspaceRestoreResultDto,
} from "@vuarau/domain-contracts";
import { restoreWorkspaceBackupCommandSchema } from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { backupDigest } from "./operations.queries.ts";

function validReferences(command: RestoreWorkspaceBackupCommand): boolean {
  const { payload } = command.payload.backup;
  const source = command.payload.backup.sourceWorkspaceId;
  const rows = Object.entries(payload).flatMap(([, value]) =>
    Array.isArray(value) ? value : [value],
  );
  if (
    rows.some(
      (row) =>
        "workspaceId" in row &&
        typeof row["workspaceId"] === "string" &&
        row["workspaceId"] !== source,
    )
  )
    return false;
  const customers = new Set(payload.customers.map((row) => row["id"]));
  const products = new Set(payload.products.map((row) => row["id"]));
  const sales = new Set(payload.sales.map((row) => row["id"]));
  return (
    payload.sales.every((row) => customers.has(row["customerId"])) &&
    payload.saleLines.every(
      (row) =>
        sales.has(row["saleId"]) && (row["productId"] == null || products.has(row["productId"])),
    ) &&
    payload.accountEntries.every((row) => customers.has(row["customerId"]))
  );
}

export function restoreWorkspaceBackup(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<WorkspaceRestoreResultDto>> {
  return runCommand<RestoreWorkspaceBackupCommand, WorkspaceRestoreResultDto>({
    commandType: "RestoreWorkspaceBackup",
    schema: restoreWorkspaceBackupCommandSchema,
    input,
    ctx,
    requiredPermission: "workspace.manage",
    execute: async ({ command, repos, recordedAt }) => {
      const backup = command.payload.backup;
      if (backupDigest(backup.payload) !== backup.digest) {
        return err("BACKUP_DIGEST_INVALID", "Backup checksum does not match its payload.");
      }
      if (!validReferences(command)) {
        return err("BACKUP_INTEGRITY_ERROR", "Backup references are incomplete or cross-scoped.");
      }
      const restored = await repos.operations.restoreBackup(command.workspaceId, backup.payload);
      if (restored.kind === "unsafe_target") {
        return err("BACKUP_UNSAFE_TARGET", "Restore requires an empty recovery workspace.", {
          reason: restored.reason,
        });
      }
      if (restored.kind !== "restored") {
        return err("BACKUP_INTEGRITY_ERROR", "Backup could not be restored safely.", {
          reason: restored.reason,
        });
      }
      const integrity = await repos.operationsReads.integrity(command.workspaceId);
      if (integrity.status !== "healthy") {
        return err("BACKUP_INTEGRITY_ERROR", "Restored workspace did not reconcile.", {
          integrity,
        });
      }
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "workspace",
        aggregateId: command.workspaceId,
        action: "workspace.backup_restored",
        transactionTime: command.occurredAt,
        recordedAt,
        before: null,
        after: { digest: backup.digest, restoredCounts: restored.counts },
        reason: command.payload.reason,
      });
      return ok({
        workspaceId: command.workspaceId,
        digest: backup.digest,
        restoredCounts: restored.counts,
        integrity,
      });
    },
  });
}

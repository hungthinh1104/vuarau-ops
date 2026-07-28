import { createHash } from "node:crypto";
import type {
  ExportWorkspaceBackupCommand,
  WorkspaceBackupV1,
  WorkspaceId,
  WorkspaceIntegrityDto,
} from "@vuarau/domain-contracts";
import { exportWorkspaceBackupCommandSchema } from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { runQuery } from "../shared/read-pipeline.ts";

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    const items = value.map((item) => canonical(item)).sort();
    return `[${items.join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function backupDigest(payload: WorkspaceBackupV1["payload"]): string {
  return createHash("sha256").update(canonical(payload)).digest("hex");
}

function orderedPayload(payload: WorkspaceBackupV1["payload"]): WorkspaceBackupV1["payload"] {
  return Object.fromEntries(
    Object.entries(payload).map(([name, value]) => [
      name,
      Array.isArray(value)
        ? [...value].sort((left, right) => canonical(left).localeCompare(canonical(right)))
        : value,
    ]),
  ) as WorkspaceBackupV1["payload"];
}

export function getWorkspaceIntegrity(
  ctx: CommandContext,
  workspaceId: WorkspaceId,
): Promise<DomainResult<WorkspaceIntegrityDto>> {
  return runQuery({
    ctx,
    workspaceId,
    permission: "workspace.manage",
    execute: ({ repos }) => repos.operationsReads.integrity(workspaceId),
  });
}

export function exportWorkspaceBackup(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<WorkspaceBackupV1>> {
  return runCommand<ExportWorkspaceBackupCommand, WorkspaceBackupV1>({
    commandType: "ExportWorkspaceBackup",
    schema: exportWorkspaceBackupCommandSchema,
    input,
    ctx,
    requiredPermission: "workspace.manage",
    execute: async ({ command, repos, recordedAt }) => {
      const found = await repos.operationsReads.backupPayload(command.workspaceId);
      if (found === null) return err("WORKSPACE_ACCESS_DENIED", "Workspace not found.");
      const payload = orderedPayload(found);
      const recordCounts = Object.fromEntries(
        Object.entries(payload).map(([name, rows]) => [
          name,
          Array.isArray(rows) ? rows.length : 1,
        ]),
      );
      const backup: WorkspaceBackupV1 = {
        format: "vuarau.workspace-backup",
        version: 1,
        sourceWorkspaceId: command.workspaceId,
        createdAt: recordedAt,
        schemaCompatibility: "m15",
        recordCounts,
        payload,
        digest: backupDigest(payload),
      };
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "workspace",
        aggregateId: command.workspaceId,
        action: "workspace.backup_exported",
        transactionTime: command.occurredAt,
        recordedAt,
        before: null,
        after: { version: 1, digest: backup.digest, recordCounts },
        reason: null,
      });
      return ok(backup);
    },
  });
}

export function validateWorkspaceBackup(
  ctx: CommandContext,
  workspaceId: WorkspaceId,
  backup: WorkspaceBackupV1,
) {
  return runQuery({
    ctx,
    workspaceId,
    permission: "workspace.manage",
    execute: async () => {
      const calculatedDigest = backupDigest(backup.payload);
      const diagnostics: string[] = [];
      if (backup.digest !== calculatedDigest) diagnostics.push("bad_digest");
      const mixedWorkspace = Object.values(backup.payload)
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .some(
          (row) =>
            "workspaceId" in row &&
            typeof row["workspaceId"] === "string" &&
            row["workspaceId"] !== backup.sourceWorkspaceId,
        );
      if (mixedWorkspace) diagnostics.push("mixed_workspace");
      return { valid: diagnostics.length === 0, calculatedDigest, diagnostics };
    },
  });
}

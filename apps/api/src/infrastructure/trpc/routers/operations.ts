import {
  auditTimelineInputSchema,
  validateWorkspaceBackupInputSchema,
  workspaceIntegrityInputSchema,
  restoreWorkspaceBackupCommandSchema,
  exportWorkspaceBackupCommandSchema,
} from "@vuarau/domain-contracts";
import { authenticatedProcedure, commandProcedure, router, unwrap } from "../trpc.ts";
import { getAuditTimeline } from "../../../modules/audit/audit.queries.ts";
import {
  exportWorkspaceBackup,
  getWorkspaceIntegrity,
  validateWorkspaceBackup,
} from "../../../modules/operations/operations.queries.ts";
import { restoreWorkspaceBackup } from "../../../modules/operations/restore-workspace.handler.ts";

export const operationsRouter = router({
  integrity: authenticatedProcedure
    .input(workspaceIntegrityInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getWorkspaceIntegrity(ctx, input.workspaceId))),
  exportBackup: commandProcedure
    .input(exportWorkspaceBackupCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await exportWorkspaceBackup(ctx, input))),
  validateBackup: authenticatedProcedure
    .input(validateWorkspaceBackupInputSchema)
    .query(async ({ ctx, input }) =>
      unwrap(await validateWorkspaceBackup(ctx, input.workspaceId, input.backup)),
    ),
  restoreBackup: commandProcedure
    .input(restoreWorkspaceBackupCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await restoreWorkspaceBackup(ctx, input))),
});

export const auditRouter = router({
  timeline: authenticatedProcedure
    .input(auditTimelineInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getAuditTimeline(ctx, input))),
});

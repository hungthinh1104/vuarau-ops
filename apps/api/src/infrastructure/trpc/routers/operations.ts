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
import {
  getOperationalClose,
  listOperationalCloses,
} from "../../../modules/close/close.queries.ts";
import {
  recordOperationalCloseCommandSchema,
  reopenOperationalCloseCommandSchema,
  operationalCloseGetInputSchema,
  operationalCloseListInputSchema,
} from "@vuarau/domain-contracts";
import {
  recordOperationalClose,
  reopenOperationalClose,
} from "../../../modules/close/close.handlers.ts";

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
  recordClose: commandProcedure
    .input(recordOperationalCloseCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordOperationalClose(ctx, input))),
  reopenClose: commandProcedure
    .input(reopenOperationalCloseCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reopenOperationalClose(ctx, input))),
  getClose: authenticatedProcedure
    .input(operationalCloseGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getOperationalClose(ctx, input))),
  listCloses: authenticatedProcedure
    .input(operationalCloseListInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listOperationalCloses(ctx, input))),
});

export const auditRouter = router({
  timeline: authenticatedProcedure
    .input(auditTimelineInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getAuditTimeline(ctx, input))),
});

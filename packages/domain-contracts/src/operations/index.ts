import { z } from "zod";
import { workspaceIdSchema } from "../shared/ids.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { defineCommand } from "../shared/command.ts";

export const workspaceIntegrityInputSchema = z.object({ workspaceId: workspaceIdSchema });
export const workspaceIntegrityDtoSchema = z.object({
  workspaceId: workspaceIdSchema,
  healthyCustomers: z.int().nonnegative(),
  anomalousCustomers: z.int().nonnegative(),
  missingSources: z.int().nonnegative(),
  duplicateSources: z.int().nonnegative(),
  projectionDrift: z.int().nonnegative(),
  status: z.enum(["healthy", "attention"]),
});
export type WorkspaceIntegrityDto = z.infer<typeof workspaceIntegrityDtoSchema>;

const backupRecordSchema = z.record(z.string(), z.unknown());
export const workspaceBackupPayloadSchema = z.object({
  workspace: backupRecordSchema,
  memberships: z.array(backupRecordSchema),
  customers: z.array(backupRecordSchema),
  products: z.array(backupRecordSchema),
  sales: z.array(backupRecordSchema),
  saleLines: z.array(backupRecordSchema),
  saleVoids: z.array(backupRecordSchema),
  payments: z.array(backupRecordSchema),
  paymentReversals: z.array(backupRecordSchema),
  accountEntries: z.array(backupRecordSchema),
  audit: z.array(backupRecordSchema),
  commandReceipts: z.array(backupRecordSchema),
});
export const workspaceBackupV1Schema = z.object({
  format: z.literal("vuarau.workspace-backup"),
  version: z.literal(1),
  sourceWorkspaceId: workspaceIdSchema,
  createdAt: isoInstantSchema,
  schemaCompatibility: z.literal("m15"),
  recordCounts: z.record(z.string(), z.int().nonnegative()),
  payload: workspaceBackupPayloadSchema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type WorkspaceBackupV1 = z.infer<typeof workspaceBackupV1Schema>;
export const exportWorkspaceBackupCommandSchema = defineCommand(z.object({}));
export type ExportWorkspaceBackupCommand = z.infer<typeof exportWorkspaceBackupCommandSchema>;

export const validateWorkspaceBackupInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  backup: workspaceBackupV1Schema,
});
export const backupValidationDtoSchema = z.object({
  valid: z.boolean(),
  calculatedDigest: z.string(),
  diagnostics: z.array(z.string()),
});

export const restoreWorkspaceBackupCommandSchema = defineCommand(
  z.object({
    backup: workspaceBackupV1Schema,
    reason: z.string().trim().min(1).max(500),
  }),
);
export type RestoreWorkspaceBackupCommand = z.infer<typeof restoreWorkspaceBackupCommandSchema>;
export const workspaceRestoreResultDtoSchema = z.object({
  workspaceId: workspaceIdSchema,
  digest: z.string(),
  restoredCounts: z.record(z.string(), z.int().nonnegative()),
  integrity: workspaceIntegrityDtoSchema,
});
export type WorkspaceRestoreResultDto = z.infer<typeof workspaceRestoreResultDtoSchema>;

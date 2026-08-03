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
  healthySuppliers: z.int().nonnegative(),
  anomalousSuppliers: z.int().nonnegative(),
  anomalousInventoryKeys: z.int().nonnegative(),
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
export const workspaceBackupPayloadV2Schema = workspaceBackupPayloadSchema.extend({
  suppliers: z.array(backupRecordSchema),
  supplierPayments: z.array(backupRecordSchema),
  supplierPaymentReversals: z.array(backupRecordSchema),
  supplierAccountEntries: z.array(backupRecordSchema),
  purchases: z.array(backupRecordSchema),
  purchaseLines: z.array(backupRecordSchema),
  purchaseVoids: z.array(backupRecordSchema),
  receipts: z.array(backupRecordSchema),
  receiptLines: z.array(backupRecordSchema),
  receiptReversals: z.array(backupRecordSchema),
  inventoryMovements: z.array(backupRecordSchema),
});
export const workspaceBackupV2Schema = z.object({
  format: z.literal("vuarau.workspace-backup"),
  version: z.literal(2),
  sourceWorkspaceId: workspaceIdSchema,
  createdAt: isoInstantSchema,
  schemaCompatibility: z.literal("m18"),
  recordCounts: z.record(z.string(), z.int().nonnegative()),
  payload: workspaceBackupPayloadV2Schema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type WorkspaceBackupV2 = z.infer<typeof workspaceBackupV2Schema>;
export const workspaceBackupPayloadV3Schema = workspaceBackupPayloadV2Schema.extend({
  deliveries: z.array(backupRecordSchema),
  deliveryLines: z.array(backupRecordSchema),
  deliveryReturns: z.array(backupRecordSchema),
  deliveryReturnLines: z.array(backupRecordSchema),
  documents: z.array(backupRecordSchema),
  documentShares: z.array(backupRecordSchema),
});
export const workspaceBackupV3Schema = z.object({
  format: z.literal("vuarau.workspace-backup"),
  version: z.literal(3),
  sourceWorkspaceId: workspaceIdSchema,
  createdAt: isoInstantSchema,
  schemaCompatibility: z.literal("m21"),
  recordCounts: z.record(z.string(), z.int().nonnegative()),
  payload: workspaceBackupPayloadV3Schema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type WorkspaceBackupV3 = z.infer<typeof workspaceBackupV3Schema>;
export const workspaceBackupPayloadV4Schema = workspaceBackupPayloadV3Schema.extend({
  qualityGrades: z.array(backupRecordSchema),
});
export const workspaceBackupV4Schema = z.object({
  format: z.literal("vuarau.workspace-backup"),
  version: z.literal(4),
  sourceWorkspaceId: workspaceIdSchema,
  createdAt: isoInstantSchema,
  schemaCompatibility: z.literal("m23"),
  recordCounts: z.record(z.string(), z.int().nonnegative()),
  payload: workspaceBackupPayloadV4Schema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type WorkspaceBackupV4 = z.infer<typeof workspaceBackupV4Schema>;
export const workspaceBackupPayloadV5Schema = workspaceBackupPayloadV4Schema.extend({
  operationalProfile: backupRecordSchema,
});
export const workspaceBackupV5Schema = z.object({
  format: z.literal("vuarau.workspace-backup"),
  version: z.literal(5),
  sourceWorkspaceId: workspaceIdSchema,
  createdAt: isoInstantSchema,
  schemaCompatibility: z.literal("m23-operational-profile"),
  recordCounts: z.record(z.string(), z.int().nonnegative()),
  payload: workspaceBackupPayloadV5Schema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type WorkspaceBackupV5 = z.infer<typeof workspaceBackupV5Schema>;
export const workspaceBackupPayloadV6Schema = workspaceBackupPayloadV5Schema.extend({
  cashAccounts: z.array(backupRecordSchema),
  expenses: z.array(backupRecordSchema),
  expenseReversals: z.array(backupRecordSchema),
  cashTransfers: z.array(backupRecordSchema),
  cashTransferReversals: z.array(backupRecordSchema),
  cashAdjustments: z.array(backupRecordSchema),
  cashMovements: z.array(backupRecordSchema),
});
export const workspaceBackupV6Schema = z.object({
  format: z.literal("vuarau.workspace-backup"),
  version: z.literal(6),
  sourceWorkspaceId: workspaceIdSchema,
  createdAt: isoInstantSchema,
  schemaCompatibility: z.literal("m24-cashbook"),
  recordCounts: z.record(z.string(), z.int().nonnegative()),
  payload: workspaceBackupPayloadV6Schema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type WorkspaceBackupV6 = z.infer<typeof workspaceBackupV6Schema>;
export const workspaceBackupPayloadV7Schema = workspaceBackupPayloadV6Schema.extend({
  qualityIssueCodes: z.array(backupRecordSchema),
  goodsArrivals: z.array(backupRecordSchema),
  goodsArrivalLines: z.array(backupRecordSchema),
  goodsArrivalReversals: z.array(backupRecordSchema),
  qualityInspections: z.array(backupRecordSchema),
  qualityInspectionIssues: z.array(backupRecordSchema),
  qualityInspectionReversals: z.array(backupRecordSchema),
  qualityDispositions: z.array(backupRecordSchema),
  qualityDispositionAllocations: z.array(backupRecordSchema),
  qualityDispositionReversals: z.array(backupRecordSchema),
});
export const workspaceBackupV7Schema = z.object({
  format: z.literal("vuarau.workspace-backup"),
  version: z.literal(7),
  sourceWorkspaceId: workspaceIdSchema,
  createdAt: isoInstantSchema,
  schemaCompatibility: z.literal("m25-intake-quality"),
  recordCounts: z.record(z.string(), z.int().nonnegative()),
  payload: workspaceBackupPayloadV7Schema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type WorkspaceBackupV7 = z.infer<typeof workspaceBackupV7Schema>;
export const workspaceBackupPayloadV8Schema = workspaceBackupPayloadV7Schema.extend({
  priceRules: z.array(backupRecordSchema),
});
export const workspaceBackupV8Schema = z.object({
  format: z.literal("vuarau.workspace-backup"),
  version: z.literal(8),
  sourceWorkspaceId: workspaceIdSchema,
  createdAt: isoInstantSchema,
  schemaCompatibility: z.literal("m26-pricing"),
  recordCounts: z.record(z.string(), z.int().nonnegative()),
  payload: workspaceBackupPayloadV8Schema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type WorkspaceBackupV8 = z.infer<typeof workspaceBackupV8Schema>;
export const workspaceBackupPayloadV9Schema = workspaceBackupPayloadV8Schema.extend({
  costObservations: z.array(backupRecordSchema),
});
export const workspaceBackupV9Schema = z.object({
  format: z.literal("vuarau.workspace-backup"),
  version: z.literal(9),
  sourceWorkspaceId: workspaceIdSchema,
  createdAt: isoInstantSchema,
  schemaCompatibility: z.literal("m26-operational-evidence"),
  recordCounts: z.record(z.string(), z.int().nonnegative()),
  payload: workspaceBackupPayloadV9Schema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type WorkspaceBackupV9 = z.infer<typeof workspaceBackupV9Schema>;
export const workspaceBackupPayloadV10Schema = workspaceBackupPayloadV9Schema.extend({
  reconciliationObservations: z.array(backupRecordSchema),
});
export const workspaceBackupV10Schema = z.object({
  format: z.literal("vuarau.workspace-backup"),
  version: z.literal(10),
  sourceWorkspaceId: workspaceIdSchema,
  createdAt: isoInstantSchema,
  schemaCompatibility: z.literal("m26-operational-evidence-2"),
  recordCounts: z.record(z.string(), z.int().nonnegative()),
  payload: workspaceBackupPayloadV10Schema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type WorkspaceBackupV10 = z.infer<typeof workspaceBackupV10Schema>;
export const workspaceBackupPayloadV11Schema = workspaceBackupPayloadV10Schema.extend({
  debtObservations: z.array(backupRecordSchema),
});
export const workspaceBackupV11Schema = z.object({
  format: z.literal("vuarau.workspace-backup"),
  version: z.literal(11),
  sourceWorkspaceId: workspaceIdSchema,
  createdAt: isoInstantSchema,
  schemaCompatibility: z.literal("m27-debt-evidence"),
  recordCounts: z.record(z.string(), z.int().nonnegative()),
  payload: workspaceBackupPayloadV11Schema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type WorkspaceBackupV11 = z.infer<typeof workspaceBackupV11Schema>;
export const workspaceBackupPayloadV12Schema = workspaceBackupPayloadV11Schema.extend({
  workspacePolicies: z.array(backupRecordSchema),
});
export const workspaceBackupV12Schema = z.object({
  format: z.literal("vuarau.workspace-backup"),
  version: z.literal(12),
  sourceWorkspaceId: workspaceIdSchema,
  createdAt: isoInstantSchema,
  schemaCompatibility: z.literal("m28-policy-registry"),
  recordCounts: z.record(z.string(), z.int().nonnegative()),
  payload: workspaceBackupPayloadV12Schema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type WorkspaceBackupV12 = z.infer<typeof workspaceBackupV12Schema>;
export const workspaceBackupPayloadV13Schema = workspaceBackupPayloadV12Schema.extend({
  supplyCommitmentObservations: z.array(backupRecordSchema),
});
export const workspaceBackupV13Schema = z.object({
  format: z.literal("vuarau.workspace-backup"),
  version: z.literal(13),
  sourceWorkspaceId: workspaceIdSchema,
  createdAt: isoInstantSchema,
  schemaCompatibility: z.literal("m29-supply-commitment-observation"),
  recordCounts: z.record(z.string(), z.int().nonnegative()),
  payload: workspaceBackupPayloadV13Schema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type WorkspaceBackupV13 = z.infer<typeof workspaceBackupV13Schema>;
export const workspaceBackupPayloadV14Schema = workspaceBackupPayloadV13Schema.extend({
  supplierObservations: z.array(backupRecordSchema),
});
export const workspaceBackupV14Schema = z.object({
  format: z.literal("vuarau.workspace-backup"),
  version: z.literal(14),
  sourceWorkspaceId: workspaceIdSchema,
  createdAt: isoInstantSchema,
  schemaCompatibility: z.literal("m30-supplier-observation"),
  recordCounts: z.record(z.string(), z.int().nonnegative()),
  payload: workspaceBackupPayloadV14Schema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type WorkspaceBackupV14 = z.infer<typeof workspaceBackupV14Schema>;
export const workspaceBackupPayloadV15Schema = workspaceBackupPayloadV14Schema.extend({
  demandObservations: z.array(backupRecordSchema),
});
export const workspaceBackupV15Schema = z.object({
  format: z.literal("vuarau.workspace-backup"),
  version: z.literal(15),
  sourceWorkspaceId: workspaceIdSchema,
  createdAt: isoInstantSchema,
  schemaCompatibility: z.literal("m31-demand-observation"),
  recordCounts: z.record(z.string(), z.int().nonnegative()),
  payload: workspaceBackupPayloadV15Schema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type WorkspaceBackupV15 = z.infer<typeof workspaceBackupV15Schema>;
export const workspaceBackupPayloadV16Schema = workspaceBackupPayloadV15Schema.extend({
  customerOrders: z.array(backupRecordSchema),
  customerOrderLines: z.array(backupRecordSchema),
});
export const workspaceBackupV16Schema = z.object({
  format: z.literal("vuarau.workspace-backup"),
  version: z.literal(16),
  sourceWorkspaceId: workspaceIdSchema,
  createdAt: isoInstantSchema,
  schemaCompatibility: z.literal("m32-customer-order"),
  recordCounts: z.record(z.string(), z.int().nonnegative()),
  payload: workspaceBackupPayloadV16Schema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type WorkspaceBackupV16 = z.infer<typeof workspaceBackupV16Schema>;
export const workspaceBackupPayloadV17Schema = workspaceBackupPayloadV16Schema.extend({
  supplyCommitments: z.array(backupRecordSchema),
  supplyCommitmentLines: z.array(backupRecordSchema),
  paymentAllocations: z.array(backupRecordSchema).default([]),
  paymentAllocationReversals: z.array(backupRecordSchema).default([]),
});
export const workspaceBackupV17Schema = z.object({
  format: z.literal("vuarau.workspace-backup"),
  version: z.literal(17),
  sourceWorkspaceId: workspaceIdSchema,
  createdAt: isoInstantSchema,
  schemaCompatibility: z.literal("m33-supply-commitment"),
  recordCounts: z.record(z.string(), z.int().nonnegative()),
  payload: workspaceBackupPayloadV17Schema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type WorkspaceBackupV17 = z.infer<typeof workspaceBackupV17Schema>;
export const workspaceBackupSchema = z.discriminatedUnion("version", [
  workspaceBackupV1Schema,
  workspaceBackupV2Schema,
  workspaceBackupV3Schema,
  workspaceBackupV4Schema,
  workspaceBackupV5Schema,
  workspaceBackupV6Schema,
  workspaceBackupV7Schema,
  workspaceBackupV8Schema,
  workspaceBackupV9Schema,
  workspaceBackupV10Schema,
  workspaceBackupV11Schema,
  workspaceBackupV12Schema,
  workspaceBackupV13Schema,
  workspaceBackupV14Schema,
  workspaceBackupV15Schema,
  workspaceBackupV16Schema,
  workspaceBackupV17Schema,
]);
export type WorkspaceBackup = z.infer<typeof workspaceBackupSchema>;
export const exportWorkspaceBackupCommandSchema = defineCommand(z.object({}));
export type ExportWorkspaceBackupCommand = z.infer<typeof exportWorkspaceBackupCommandSchema>;

export const validateWorkspaceBackupInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  backup: workspaceBackupSchema,
});
export const backupValidationDtoSchema = z.object({
  valid: z.boolean(),
  calculatedDigest: z.string(),
  diagnostics: z.array(z.string()),
});

export const restoreWorkspaceBackupCommandSchema = defineCommand(
  z.object({
    backup: workspaceBackupSchema,
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

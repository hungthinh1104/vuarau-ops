import { z } from "zod";
import { defineCommand, defineVersionedCommand } from "../shared/command.ts";
import {
  actorIdSchema,
  cashAccountIdSchema,
  cashAdjustmentIdSchema,
  cashMovementIdSchema,
  cashTransferIdSchema,
  cashTransferReversalIdSchema,
  commandIdSchema,
  expenseIdSchema,
  expenseReversalIdSchema,
  workspaceIdSchema,
} from "../shared/ids.ts";
import { currencyCodeSchema, moneySchema } from "../shared/money.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { pageOf, pageRequestSchema } from "../shared/pagination.ts";
import { evidenceReferencesDtoSchema, evidenceReferencesInputSchema } from "../shared/evidence.ts";

export const CASH_ACCOUNT_KINDS = [
  "cash_drawer",
  "bank",
  "mobile_wallet",
  "employee_holding",
  "owner_funds",
  "other",
] as const;
export const cashAccountKindSchema = z.enum(CASH_ACCOUNT_KINDS);
export type CashAccountKind = z.infer<typeof cashAccountKindSchema>;

const cashAccountFieldsSchema = z.object({
  cashAccountId: cashAccountIdSchema,
  displayName: z.string().trim().min(1).max(200),
  kind: cashAccountKindSchema,
  currency: currencyCodeSchema.default("VND"),
  /** Required operationally for employee_holding; null for shared depot accounts. */
  custodianActorId: actorIdSchema.nullable().default(null),
  note: z.string().trim().max(1_000).nullable().default(null),
});
export const createCashAccountCommandSchema = defineCommand(cashAccountFieldsSchema);
export type CreateCashAccountCommand = z.infer<typeof createCashAccountCommandSchema>;
export const updateCashAccountCommandSchema = defineVersionedCommand(cashAccountFieldsSchema);
export type UpdateCashAccountCommand = z.infer<typeof updateCashAccountCommandSchema>;
const cashAccountLifecycleSchema = z.object({
  cashAccountId: cashAccountIdSchema,
  reason: z.string().trim().min(1).max(500),
});
export const deactivateCashAccountCommandSchema = defineVersionedCommand(
  cashAccountLifecycleSchema,
);
export const reactivateCashAccountCommandSchema = defineVersionedCommand(
  cashAccountLifecycleSchema,
);
export type DeactivateCashAccountCommand = z.infer<typeof deactivateCashAccountCommandSchema>;
export type ReactivateCashAccountCommand = z.infer<typeof reactivateCashAccountCommandSchema>;

export const cashAccountDtoSchema = z.object({
  id: cashAccountIdSchema,
  workspaceId: workspaceIdSchema,
  displayName: z.string(),
  kind: cashAccountKindSchema,
  currency: currencyCodeSchema,
  custodianActorId: actorIdSchema.nullable(),
  note: z.string().nullable(),
  isActive: z.boolean(),
  version: z.int().positive(),
  createdAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
});
export type CashAccountDto = z.infer<typeof cashAccountDtoSchema>;

export const EXPENSE_CATEGORIES = [
  "transport",
  "loading",
  "market_fee",
  "fuel",
  "wages",
  "packaging",
  "utilities",
  "maintenance",
  "owner_personal",
  "other",
] as const;
export const expenseCategorySchema = z.enum(EXPENSE_CATEGORIES);
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;

export const recordExpenseCommandSchema = defineCommand(
  z.object({
    expenseId: expenseIdSchema,
    cashAccountId: cashAccountIdSchema,
    category: expenseCategorySchema,
    amount: moneySchema,
    payee: z.string().trim().max(200).nullable().default(null),
    note: z.string().trim().min(1).max(2_000),
    evidenceReferences: evidenceReferencesInputSchema,
  }),
);
export type RecordExpenseCommand = z.infer<typeof recordExpenseCommandSchema>;
export const reverseExpenseCommandSchema = defineCommand(
  z.object({
    reversalId: expenseReversalIdSchema,
    expenseId: expenseIdSchema,
    reason: z.string().trim().min(1).max(500),
    evidenceReferences: evidenceReferencesInputSchema,
  }),
);
export type ReverseExpenseCommand = z.infer<typeof reverseExpenseCommandSchema>;

export const recordCashTransferCommandSchema = defineCommand(
  z.object({
    transferId: cashTransferIdSchema,
    fromCashAccountId: cashAccountIdSchema,
    toCashAccountId: cashAccountIdSchema,
    amount: moneySchema,
    note: z.string().trim().max(1_000).nullable().default(null),
    evidenceReferences: evidenceReferencesInputSchema,
  }),
);
export type RecordCashTransferCommand = z.infer<typeof recordCashTransferCommandSchema>;
export const reverseCashTransferCommandSchema = defineCommand(
  z.object({
    reversalId: cashTransferReversalIdSchema,
    transferId: cashTransferIdSchema,
    reason: z.string().trim().min(1).max(500),
    evidenceReferences: evidenceReferencesInputSchema,
  }),
);
export type ReverseCashTransferCommand = z.infer<typeof reverseCashTransferCommandSchema>;

export const CASH_ADJUSTMENT_REASON_CODES = [
  "opening_balance",
  "owner_contribution",
  "owner_draw",
  "count_correction",
  "unidentified_cash",
  "other",
] as const;
export const cashAdjustmentReasonCodeSchema = z.enum(CASH_ADJUSTMENT_REASON_CODES);
export const adjustCashCommandSchema = defineCommand(
  z.object({
    adjustmentId: cashAdjustmentIdSchema,
    cashAccountId: cashAccountIdSchema,
    direction: z.enum(["increase", "decrease"]),
    amount: moneySchema,
    reasonCode: cashAdjustmentReasonCodeSchema,
    reason: z.string().trim().min(1).max(500),
    evidenceReferences: evidenceReferencesInputSchema,
  }),
);
export type AdjustCashCommand = z.infer<typeof adjustCashCommandSchema>;

export const CASH_MOVEMENT_SOURCE_TYPES = [
  "customer_payment",
  "customer_payment_reversal",
  "supplier_payment",
  "supplier_payment_reversal",
  "expense",
  "expense_reversal",
  "cash_transfer_out",
  "cash_transfer_in",
  "cash_transfer_reversal_out",
  "cash_transfer_reversal_in",
  "cash_adjustment",
] as const;
export const cashMovementSourceTypeSchema = z.enum(CASH_MOVEMENT_SOURCE_TYPES);
export type CashMovementSourceType = z.infer<typeof cashMovementSourceTypeSchema>;

export const cashMovementDtoSchema = z.object({
  id: cashMovementIdSchema,
  workspaceId: workspaceIdSchema,
  cashAccountId: cashAccountIdSchema,
  amount: moneySchema,
  sourceType: cashMovementSourceTypeSchema,
  sourceId: z.uuid(),
  reversalOfMovementId: cashMovementIdSchema.nullable(),
  note: z.string().nullable(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
});
export type CashMovementDto = z.infer<typeof cashMovementDtoSchema>;

export const cashBalanceDtoSchema = z.object({
  workspaceId: workspaceIdSchema,
  cashAccountId: cashAccountIdSchema,
  balance: moneySchema,
  movementCount: z.int().nonnegative(),
  lastMovementTransactionTime: isoInstantSchema.nullable(),
  updatedAt: isoInstantSchema,
});
export type CashBalanceDto = z.infer<typeof cashBalanceDtoSchema>;

export const expenseDtoSchema = z.object({
  id: expenseIdSchema,
  workspaceId: workspaceIdSchema,
  cashAccountId: cashAccountIdSchema,
  category: expenseCategorySchema,
  amount: moneySchema,
  payee: z.string().nullable(),
  note: z.string(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
  evidenceReferences: evidenceReferencesDtoSchema,
  reversal: z
    .object({
      id: expenseReversalIdSchema,
      reason: z.string(),
      transactionTime: isoInstantSchema,
      recordedAt: isoInstantSchema,
      actorId: actorIdSchema,
      commandId: commandIdSchema,
      evidenceReferences: evidenceReferencesDtoSchema,
    })
    .nullable(),
});
export type ExpenseDto = z.infer<typeof expenseDtoSchema>;

export const cashTransferDtoSchema = z.object({
  id: cashTransferIdSchema,
  workspaceId: workspaceIdSchema,
  fromCashAccountId: cashAccountIdSchema,
  toCashAccountId: cashAccountIdSchema,
  amount: moneySchema,
  note: z.string().nullable(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
  evidenceReferences: evidenceReferencesDtoSchema,
  reversal: z
    .object({
      id: cashTransferReversalIdSchema,
      reason: z.string(),
      transactionTime: isoInstantSchema,
      recordedAt: isoInstantSchema,
      actorId: actorIdSchema,
      commandId: commandIdSchema,
      evidenceReferences: evidenceReferencesDtoSchema,
    })
    .nullable(),
});
export type CashTransferDto = z.infer<typeof cashTransferDtoSchema>;

export const cashAccountSearchInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  query: z.string().trim().max(200).default(""),
  isActive: z.boolean().nullable().default(true),
});
export type CashAccountSearchInput = z.infer<typeof cashAccountSearchInputSchema>;
export const cashAccountSearchPageSchema = pageOf(
  z.object({ account: cashAccountDtoSchema, balance: cashBalanceDtoSchema }),
);
export const cashAccountGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  cashAccountId: cashAccountIdSchema,
});
export type CashAccountGetInput = z.infer<typeof cashAccountGetInputSchema>;
export const cashTimelineInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  cashAccountId: cashAccountIdSchema,
  from: isoInstantSchema.nullable().default(null),
  to: isoInstantSchema.nullable().default(null),
});
export type CashTimelineInput = z.infer<typeof cashTimelineInputSchema>;
export const cashTimelinePageSchema = pageOf(cashMovementDtoSchema);
export const expenseGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  expenseId: expenseIdSchema,
});
export type ExpenseGetInput = z.infer<typeof expenseGetInputSchema>;
export const cashTransferGetInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  transferId: cashTransferIdSchema,
});
export type CashTransferGetInput = z.infer<typeof cashTransferGetInputSchema>;
export const cashReconciliationInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  cashAccountId: cashAccountIdSchema,
});
export type CashReconciliationInput = z.infer<typeof cashReconciliationInputSchema>;
export const cashReconciliationDtoSchema = z.object({
  status: z.enum(["consistent", "inconsistent", "not_found", "integrity_failure"]),
  cashAccountId: cashAccountIdSchema,
  projected: cashBalanceDtoSchema.nullable(),
  canonical: cashBalanceDtoSchema.nullable(),
  diagnostics: z.array(z.string()),
});
export type CashReconciliationDto = z.infer<typeof cashReconciliationDtoSchema>;
export const rebuildCashBalanceCommandSchema = defineCommand(
  z.object({ cashAccountId: cashAccountIdSchema }),
);
export type RebuildCashBalanceCommand = z.infer<typeof rebuildCashBalanceCommandSchema>;

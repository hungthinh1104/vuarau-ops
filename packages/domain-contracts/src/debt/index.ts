import { z } from "zod";
import {
  actorIdSchema,
  commandIdSchema,
  customerAccountEntryIdSchema,
  customerIdSchema,
  paymentIdSchema,
  paymentAllocationIdSchema,
  paymentAllocationReversalIdSchema,
  saleIdSchema,
  workspaceIdSchema,
  workspacePolicyVersionIdSchema,
} from "../shared/ids.ts";
import { accountEntrySourceTypeSchema } from "../account/index.ts";
import { defineVersionedCommand } from "../shared/command.ts";
import { moneySchema } from "../shared/money.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { paymentAllocationStrategySchema } from "../policy/index.ts";

export const debtAgingInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  asOf: isoInstantSchema,
});
export type DebtAgingInput = z.infer<typeof debtAgingInputSchema>;

export const DEBT_AGING_STATES = [
  "settled",
  "not_due",
  "due",
  "overdue",
  "customer_credit",
  "disputed",
  "unallocated_payment",
  "no_term",
] as const;
export const debtAgingStateSchema = z.enum(DEBT_AGING_STATES);
export type DebtAgingState = z.infer<typeof debtAgingStateSchema>;

export const debtAgingSourceReferenceSchema = z.object({
  type: accountEntrySourceTypeSchema.nullable(),
  id: z.uuid(),
  entryId: customerAccountEntryIdSchema.nullable(),
});
export type DebtAgingSourceReference = z.infer<typeof debtAgingSourceReferenceSchema>;

export const debtAgingSaleRowSchema = z.object({
  saleId: saleIdSchema,
  customerId: customerIdSchema,
  saleAmount: moneySchema,
  allocatedAmount: moneySchema,
  outstandingAmount: moneySchema,
  transactionTime: isoInstantSchema,
  dueAt: isoInstantSchema.nullable(),
  state: debtAgingStateSchema,
  bucketCode: z.string().nullable(),
  daysOverdue: z.int().nonnegative(),
  termSource: z.enum(["sale_override", "customer_policy", "workspace_policy", "none"]),
  sourceReferences: z.array(debtAgingSourceReferenceSchema),
});
export type DebtAgingSaleRow = z.infer<typeof debtAgingSaleRowSchema>;

export const debtAgingPaymentRowSchema = z.object({
  paymentId: paymentIdSchema,
  customerId: customerIdSchema,
  paymentAmount: moneySchema,
  reversedAmount: moneySchema,
  effectiveAmount: moneySchema,
  allocatedAmount: moneySchema,
  unallocatedAmount: moneySchema,
  transactionTime: isoInstantSchema,
  state: z.enum(["allocated", "partially_allocated", "unallocated"]),
  sourceReferences: z.array(debtAgingSourceReferenceSchema),
});
export type DebtAgingPaymentRow = z.infer<typeof debtAgingPaymentRowSchema>;

export const debtAgingTotalsSchema = z.object({
  ledgerBalance: moneySchema,
  saleOutstanding: moneySchema,
  overdue: moneySchema,
  due: moneySchema,
  notDue: moneySchema,
  disputed: moneySchema,
  customerCredit: moneySchema,
  unallocatedPayment: moneySchema,
});
export type DebtAgingTotals = z.infer<typeof debtAgingTotalsSchema>;

const debtAgingCommonSchema = z.object({
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  asOf: isoInstantSchema,
  policyVersionId: workspacePolicyVersionIdSchema,
  allocationPolicyVersionId: workspacePolicyVersionIdSchema,
  allocationStrategy: paymentAllocationStrategySchema,
  calculationVersion: z.literal("debt-aging-v1"),
  calculatedAt: isoInstantSchema,
  integrity: z.enum(["healthy", "attention"]),
  diagnostics: z.array(z.string()),
});

export const debtAgingResultSchema = z.discriminatedUnion("status", [
  debtAgingCommonSchema.extend({
    status: z.literal("available"),
    rows: z.array(debtAgingSaleRowSchema),
    payments: z.array(debtAgingPaymentRowSchema),
    totals: debtAgingTotalsSchema,
  }),
  debtAgingCommonSchema
    .extend({
      status: z.literal("unavailable"),
      diagnostics: z.array(z.string()).min(1),
      policyVersionId: workspacePolicyVersionIdSchema.nullable(),
      allocationPolicyVersionId: workspacePolicyVersionIdSchema.nullable(),
      allocationStrategy: paymentAllocationStrategySchema.nullable(),
    })
    .omit({ integrity: true })
    .extend({ integrity: z.literal("attention") }),
]);
export type DebtAgingResult = z.infer<typeof debtAgingResultSchema>;

export const paymentAllocationDtoSchema = z.object({
  id: paymentAllocationIdSchema,
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  paymentId: paymentIdSchema,
  saleId: saleIdSchema,
  amount: moneySchema,
  evidenceReferences: z.array(z.string()),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
});
export type PaymentAllocationDto = z.infer<typeof paymentAllocationDtoSchema>;

export const paymentAllocationReversalDtoSchema = z.object({
  id: paymentAllocationReversalIdSchema,
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  allocationId: paymentAllocationIdSchema,
  amount: moneySchema,
  reason: z.string().trim().min(1).max(500),
  evidenceReferences: z.array(z.string()),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  actorId: actorIdSchema,
  commandId: commandIdSchema,
});
export type PaymentAllocationReversalDto = z.infer<typeof paymentAllocationReversalDtoSchema>;

export const recordPaymentAllocationPayloadSchema = z.object({
  allocationId: paymentAllocationIdSchema,
  paymentId: paymentIdSchema,
  saleId: saleIdSchema,
  amount: moneySchema,
  evidenceReferences: z.array(z.string()).max(20),
});
export const recordPaymentAllocationCommandSchema = defineVersionedCommand(
  recordPaymentAllocationPayloadSchema,
);
export type RecordPaymentAllocationCommand = z.infer<typeof recordPaymentAllocationCommandSchema>;

export const reversePaymentAllocationPayloadSchema = z.object({
  allocationId: paymentAllocationIdSchema,
  reversalId: paymentAllocationReversalIdSchema,
  amount: moneySchema,
  reason: z.string().max(500),
  evidenceReferences: z.array(z.string()).max(20),
});
export const reversePaymentAllocationCommandSchema = defineVersionedCommand(
  reversePaymentAllocationPayloadSchema,
);
export type ReversePaymentAllocationCommand = z.infer<typeof reversePaymentAllocationCommandSchema>;

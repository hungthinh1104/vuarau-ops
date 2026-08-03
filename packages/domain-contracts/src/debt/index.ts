import { z } from "zod";
import {
  customerAccountEntryIdSchema,
  customerIdSchema,
  paymentIdSchema,
  saleIdSchema,
  workspaceIdSchema,
  workspacePolicyVersionIdSchema,
} from "../shared/ids.ts";
import { accountEntrySourceTypeSchema } from "../account/index.ts";
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

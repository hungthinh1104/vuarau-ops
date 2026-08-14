import { z } from "zod";
import { deliveryIdSchema, productIdSchema, workspaceIdSchema } from "../shared/ids.ts";
import { moneySchema } from "../shared/money.ts";
import { pageOf, pageRequestSchema } from "../shared/pagination.ts";
import { quantitySchema, unitSchema } from "../shared/quantity.ts";
import { isoInstantSchema } from "../shared/time.ts";
import {
  operationsExceptionKindSchema,
  operationsExceptionSchema,
  type OperationsExceptionKind,
} from "../operations/exceptions.ts";

const isoDateSchema = z.iso.date();

export const dashboardAvailabilitySchema = z.object({
  state: z.enum(["available", "attention", "unavailable"]),
  diagnostics: z.array(z.string()),
  updatedAt: isoInstantSchema.nullable(),
});
export type DashboardAvailability = z.infer<typeof dashboardAvailabilitySchema>;

export const dashboardAmountWidgetSchema = z.object({
  availability: dashboardAvailabilitySchema,
  amount: moneySchema.nullable(),
  count: z.int().nonnegative(),
});
export type DashboardAmountWidget = z.infer<typeof dashboardAmountWidgetSchema>;

export const dashboardQuantityWidgetSchema = z.object({
  availability: dashboardAvailabilitySchema,
  quantities: z.array(quantitySchema),
  count: z.int().nonnegative(),
});
export type DashboardQuantityWidget = z.infer<typeof dashboardQuantityWidgetSchema>;

export const dashboardSummaryInputSchema = z.object({ workspaceId: workspaceIdSchema });
export type DashboardSummaryInput = z.infer<typeof dashboardSummaryInputSchema>;

export const dashboardSummaryDtoSchema = z.object({
  workspaceId: workspaceIdSchema,
  asOf: isoInstantSchema,
  sales: dashboardAmountWidgetSchema,
  purchases: dashboardAmountWidgetSchema,
  received: dashboardQuantityWidgetSchema,
  stock: dashboardQuantityWidgetSchema,
  outstandingDelivery: dashboardQuantityWidgetSchema,
  receivables: dashboardAmountWidgetSchema,
  payables: dashboardAmountWidgetSchema,
  cash: dashboardAmountWidgetSchema,
});
export type DashboardSummaryDto = z.infer<typeof dashboardSummaryDtoSchema>;

export const dashboardSeriesInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
});
export type DashboardSeriesInput = z.infer<typeof dashboardSeriesInputSchema>;

export const dashboardSeriesPointSchema = z.object({
  date: isoDateSchema,
  sales: moneySchema,
  orderCount: z.int().nonnegative(),
  purchases: moneySchema,
  received: z.array(quantitySchema),
  cash: moneySchema,
});
export type DashboardSeriesPoint = z.infer<typeof dashboardSeriesPointSchema>;

export const dashboardSeriesDtoSchema = z.object({
  workspaceId: workspaceIdSchema,
  asOf: isoInstantSchema,
  points: z.array(dashboardSeriesPointSchema),
});
export type DashboardSeriesDto = z.infer<typeof dashboardSeriesDtoSchema>;

const dashboardCountSchema = z.object({ key: z.string().min(1), count: z.int().nonnegative() });

export const dashboardOrderStatusCountsDtoSchema = z.object({
  workspaceId: workspaceIdSchema,
  asOf: isoInstantSchema,
  commercial: z.array(dashboardCountSchema),
  physical: z.array(dashboardCountSchema),
  financial: z.array(dashboardCountSchema),
});
export type DashboardOrderStatusCountsDto = z.infer<typeof dashboardOrderStatusCountsDtoSchema>;

export const dashboardTopProductsInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  limit: z.int().positive().max(20).default(10),
});
export type DashboardTopProductsInput = z.infer<typeof dashboardTopProductsInputSchema>;

export const dashboardTopProductSchema = z.object({
  productId: productIdSchema.nullable(),
  productName: z.string().min(1),
  quantity: quantitySchema,
  sales: moneySchema,
});
export type DashboardTopProduct = z.infer<typeof dashboardTopProductSchema>;

export const dashboardTopProductsDtoSchema = z.object({
  workspaceId: workspaceIdSchema,
  asOf: isoInstantSchema,
  products: z.array(dashboardTopProductSchema),
});
export type DashboardTopProductsDto = z.infer<typeof dashboardTopProductsDtoSchema>;

export const OPERATIONS_BOARD_FILTERS = [
  "all",
  "outstanding_delivery",
  "needs_receiving",
  "needs_delivery",
  "in_delivery",
  "returned_fulfilment",
  "unallocated_payment",
  "awaiting_payment",
  "overdue",
  "attention",
  "fulfilment_remainder_unresolved",
  "return_settlement_unresolved",
  "reconciliation_variance",
] as const;
export const operationsBoardFilterSchema = z.enum(OPERATIONS_BOARD_FILTERS);
export type OperationsBoardFilter = z.infer<typeof operationsBoardFilterSchema>;

export const OPERATIONS_BOARD_SORTS = ["updated_desc", "age_desc", "amount_desc"] as const;
export const operationsBoardSortSchema = z.enum(OPERATIONS_BOARD_SORTS);
export type OperationsBoardSort = z.infer<typeof operationsBoardSortSchema>;

export function operationsBoardCursorPositionSchema(sort: OperationsBoardSort) {
  const sortValue =
    sort === "updated_desc"
      ? isoInstantSchema
      : z.string().refine((value) => Number.isFinite(Number(value)), "Cursor sort is not numeric.");
  return z.object({ sortValue, id: z.uuid() });
}

export const operationsBoardInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  filter: operationsBoardFilterSchema.default("all"),
  sort: operationsBoardSortSchema.default("updated_desc"),
  search: z.string().trim().max(120).default(""),
});
export type OperationsBoardInput = z.infer<typeof operationsBoardInputSchema>;

export const operationsBoardRowSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["sale", "purchase"]),
  reference: z.string().min(1),
  counterparty: z.string().min(1),
  amount: moneySchema,
  commercialState: z.string().min(1),
  physicalState: z.string().min(1),
  financialState: z.string().min(1),
  /** A return reopened net fulfilment and needs an operator decision/action. */
  returnedFulfilment: z.boolean(),
  /** Customer money remains canonical but is not allocated to a Sale. */
  unallocatedPayment: z.boolean(),
  unallocatedPaymentAmount: moneySchema.nullable(),
  ageSeconds: z.number().nonnegative(),
  /** Null means the record remains visible for context but has no operational action. */
  nextAction: z.string().min(1).nullable(),
  exceptions: z.array(operationsExceptionSchema),
  updatedAt: isoInstantSchema,
  href: z.string().min(1),
  deliveryId: deliveryIdSchema.nullable(),
});
export type OperationsBoardRow = z.infer<typeof operationsBoardRowSchema>;

export const operationsExceptionCountSchema = z.object({
  kind: operationsExceptionKindSchema,
  count: z.int().nonnegative(),
});
export type OperationsExceptionCount = z.infer<typeof operationsExceptionCountSchema>;

export const operationsExceptionCountMapSchema = z.record(
  operationsExceptionKindSchema,
  z.int().nonnegative(),
);
export type OperationsExceptionCountMap = Record<OperationsExceptionKind, number>;

export const operationsBoardCountsSchema = z.object({
  all: z.int().nonnegative(),
  outstandingDelivery: z.int().nonnegative(),
  needsReceiving: z.int().nonnegative(),
  needsDelivery: z.int().nonnegative(),
  inDelivery: z.int().nonnegative(),
  returnedFulfilment: z.int().nonnegative(),
  unallocatedPayment: z.int().nonnegative(),
  awaitingPayment: z.int().nonnegative(),
  overdue: z.int().nonnegative(),
  attention: z.int().nonnegative(),
  fulfilmentRemainderUnresolved: z.int().nonnegative(),
  returnSettlementUnresolved: z.int().nonnegative(),
  reconciliationVariance: z.int().nonnegative(),
  exceptionCounts: operationsExceptionCountMapSchema,
});
export type OperationsBoardCounts = z.infer<typeof operationsBoardCountsSchema>;

export const operationsBoardCountsInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  filter: operationsBoardFilterSchema.default("all"),
  search: z.string().trim().max(120).default(""),
});
export type OperationsBoardCountsInput = z.infer<typeof operationsBoardCountsInputSchema>;

export const operationsBoardCountsDtoSchema = z.object({
  workspaceId: workspaceIdSchema,
  asOf: isoInstantSchema,
  counts: operationsBoardCountsSchema,
});
export type OperationsBoardCountsDto = z.infer<typeof operationsBoardCountsDtoSchema>;

export const operationsBoardDtoSchema = z.object({
  workspaceId: workspaceIdSchema,
  asOf: isoInstantSchema,
  /** Counts are fetched by the dedicated counts read so page reads stay bounded. */
  counts: operationsBoardCountsSchema.optional(),
  page: pageOf(operationsBoardRowSchema),
});
export type OperationsBoardDto = z.infer<typeof operationsBoardDtoSchema>;

export const WORKSPACE_CHANGE_TOPICS = [
  "account",
  "cash",
  "customer",
  "customerOrder",
  "dashboard",
  "delivery",
  "document",
  "evidence",
  "intake",
  "inventory",
  "operations",
  "payment",
  "policy",
  "pricing",
  "product",
  "purchase",
  "quality",
  "receiving",
  "report",
  "sale",
  "session",
  "supplier",
  "supplyCommitment",
  "workspace",
] as const;

export const workspaceChangeTopicSchema = z.enum(WORKSPACE_CHANGE_TOPICS);
export type WorkspaceChangeTopic = z.infer<typeof workspaceChangeTopicSchema>;

export const dashboardEventSchema = z.object({
  workspaceId: workspaceIdSchema,
  entityType: z.string().min(1),
  entityId: z.string().min(1).nullable(),
  occurredAt: isoInstantSchema,
  /** A durable feed position. LISTEN/NOTIFY may omit it for legacy publishers. */
  revision: z.string().regex(/^\d+$/).optional(),
  /** Typed read-model roots affected by this accepted command. */
  topics: z.array(workspaceChangeTopicSchema).min(1).optional(),
});
export type DashboardEvent = z.infer<typeof dashboardEventSchema>;

export const workspaceChangeSchema = z.object({
  revision: z.string().regex(/^\d+$/),
  commandType: z.string().min(1),
  topics: z.array(workspaceChangeTopicSchema).min(1),
  recordedAt: isoInstantSchema,
});
export type WorkspaceChange = z.infer<typeof workspaceChangeSchema>;

export const workspaceChangesSinceDtoSchema = z.object({
  workspaceId: workspaceIdSchema,
  changes: z.array(workspaceChangeSchema),
  /** The latest committed position, used as the next since cursor. */
  nextRevision: z.string().regex(/^\d+$/),
});
export type WorkspaceChangesSinceDto = z.infer<typeof workspaceChangesSinceDtoSchema>;

export const dashboardUnitSchema = unitSchema;

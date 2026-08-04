import { z } from "zod";
import { deliveryIdSchema, productIdSchema, workspaceIdSchema } from "../shared/ids.ts";
import { moneySchema } from "../shared/money.ts";
import { pageOf, pageRequestSchema } from "../shared/pagination.ts";
import { quantitySchema, unitSchema } from "../shared/quantity.ts";
import { isoInstantSchema } from "../shared/time.ts";

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
  "needs_receiving",
  "needs_delivery",
  "in_delivery",
  "awaiting_payment",
  "overdue",
  "attention",
] as const;
export const operationsBoardFilterSchema = z.enum(OPERATIONS_BOARD_FILTERS);
export type OperationsBoardFilter = z.infer<typeof operationsBoardFilterSchema>;

export const OPERATIONS_BOARD_SORTS = ["updated_desc", "age_desc", "amount_desc"] as const;
export const operationsBoardSortSchema = z.enum(OPERATIONS_BOARD_SORTS);
export type OperationsBoardSort = z.infer<typeof operationsBoardSortSchema>;

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
  ageSeconds: z.number().nonnegative(),
  nextAction: z.string().min(1),
  updatedAt: isoInstantSchema,
  href: z.string().min(1),
  deliveryId: deliveryIdSchema.nullable(),
});
export type OperationsBoardRow = z.infer<typeof operationsBoardRowSchema>;

export const operationsBoardCountsSchema = z.object({
  all: z.int().nonnegative(),
  needsReceiving: z.int().nonnegative(),
  needsDelivery: z.int().nonnegative(),
  inDelivery: z.int().nonnegative(),
  awaitingPayment: z.int().nonnegative(),
  overdue: z.int().nonnegative(),
  attention: z.int().nonnegative(),
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
  counts: operationsBoardCountsSchema,
  page: pageOf(operationsBoardRowSchema),
});
export type OperationsBoardDto = z.infer<typeof operationsBoardDtoSchema>;

export const dashboardEventSchema = z.object({
  workspaceId: workspaceIdSchema,
  entityType: z.string().min(1),
  entityId: z.string().min(1).nullable(),
  occurredAt: isoInstantSchema,
});
export type DashboardEvent = z.infer<typeof dashboardEventSchema>;

export const dashboardUnitSchema = unitSchema;

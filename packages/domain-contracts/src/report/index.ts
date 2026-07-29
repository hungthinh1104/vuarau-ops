import { z } from "zod";
import { moneySchema } from "../shared/money.ts";
import { pageOf, pageRequestSchema } from "../shared/pagination.ts";
import { productIdSchema, workspaceIdSchema } from "../shared/ids.ts";
import { quantitySchema, unitSchema } from "../shared/quantity.ts";

export const REPORT_TYPES = [
  "daily_operations",
  "customer_receivables",
  "supplier_payables",
  "inventory_by_product_unit",
  "inventory_movement_report",
  "outstanding_delivery",
] as const;
export const reportTypeSchema = z.enum(REPORT_TYPES);
export type ReportType = z.infer<typeof reportTypeSchema>;
export const reportInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  reportType: reportTypeSchema,
  businessDate: z.iso.date().nullable().default(null),
  productId: productIdSchema.nullable().default(null),
  unit: unitSchema.nullable().default(null),
});
export type ReportInput = z.infer<typeof reportInputSchema>;
export const reportRowDtoSchema = z.object({
  id: z.string(),
  label: z.string(),
  sourceType: z.string(),
  sourceId: z.string(),
  documentHref: z.string().nullable(),
  transactionTime: z.string().nullable(),
  amount: moneySchema.nullable(),
  quantity: quantitySchema.nullable(),
  status: z.string(),
});
export type ReportRowDto = z.infer<typeof reportRowDtoSchema>;
export const operationalReportDtoSchema = z.object({
  reportType: reportTypeSchema,
  businessDate: z.string().nullable(),
  timezone: z.literal("Asia/Ho_Chi_Minh"),
  integrity: z.enum(["healthy", "attention"]),
  diagnostics: z.array(z.string()),
  totals: z.object({
    amount: moneySchema.nullable(),
    quantities: z.array(z.object({ unit: unitSchema, valueScaled: z.int() })),
  }),
  page: pageOf(reportRowDtoSchema),
});
export type OperationalReportDto = z.infer<typeof operationalReportDtoSchema>;

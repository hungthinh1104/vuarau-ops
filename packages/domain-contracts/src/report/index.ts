import { z } from "zod";
import { moneySchema } from "../shared/money.ts";
import { pageOf, pageRequestSchema } from "../shared/pagination.ts";
import { productIdSchema, workspaceIdSchema } from "../shared/ids.ts";
import { quantitySchema, unitSchema } from "../shared/quantity.ts";

export const REPORT_TYPES = [
  "customer_account_activity",
  "customer_receivables",
  "supplier_payables",
  "inventory_by_product_unit",
  "inventory_movement_report",
  "outstanding_delivery",
  "cash_balances",
  "cash_movement_report",
  "expense_report",
] as const;
export const reportTypeSchema = z.enum(REPORT_TYPES);
export type ReportType = z.infer<typeof reportTypeSchema>;
export const reportDefinitionsInputSchema = z.object({ workspaceId: workspaceIdSchema });
export type ReportDefinitionsInput = z.infer<typeof reportDefinitionsInputSchema>;
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
  productId: z.string().nullable().default(null),
  productName: z.string().nullable().default(null),
  qualityGradeId: z.string().nullable().default(null),
  qualityGradeName: z.string().nullable().default(null),
  sourceType: z.string(),
  sourceId: z.string(),
  documentHref: z.string().nullable(),
  transactionTime: z.string().nullable(),
  amount: moneySchema.nullable(),
  quantity: quantitySchema.nullable(),
  status: z.string(),
});
export type ReportRowDto = z.infer<typeof reportRowDtoSchema>;

const reportFilterSchema = z.object({
  key: z.enum(["businessDate", "productId", "unit"]),
  behavior: z.enum(["applied", "ignored"]),
  description: z.string().min(1),
});

export const reportDefinitionSchema = z.object({
  reportType: reportTypeSchema,
  label: z.string().min(1),
  measure: z.string().min(1),
  source: z.object({
    kind: z.enum(["canonical", "projection", "derived_canonical"]),
    relations: z.array(z.string().min(1)).min(1),
  }),
  time: z.object({
    kind: z.enum(["business_day", "current_snapshot", "current_open_state"]),
    field: z.string().min(1).nullable(),
    boundary: z.enum(["workspace_operational_profile", "none"]),
    timezone: z.literal("Asia/Ho_Chi_Minh"),
    description: z.string().min(1),
  }),
  filters: z.array(reportFilterSchema),
  integrity: z.object({
    state: z.enum(["canonical", "projection", "derived_canonical"]),
    onAttention: z.enum(["show_with_attention", "fail_closed"]),
  }),
  action: z.object({
    kind: z.literal("drilldown"),
    target: z.enum([
      "row_document",
      "customer",
      "supplier",
      "product_inventory",
      "sale",
      "cash_account",
      "expense",
    ]),
    label: z.string().min(1),
    hrefTemplate: z.string().min(1).nullable(),
  }),
});
export type ReportDefinition = z.infer<typeof reportDefinitionSchema>;

/**
 * The first analytics contract is deliberately limited to existing operational
 * reports. These definitions describe what the current query actually reads;
 * they do not invent COGS, aging, reorder or supplier-performance policy.
 */
export const REPORT_DEFINITIONS = [
  {
    reportType: "customer_account_activity",
    label: "Customer account activity",
    measure: "Sum customer_account_entries.amount_minor in the selected business day.",
    source: { kind: "canonical", relations: ["customer_account_entries"] },
    time: {
      kind: "business_day",
      field: "transactionTime",
      boundary: "workspace_operational_profile",
      timezone: "Asia/Ho_Chi_Minh",
      description: "The workspace business-day start is applied to transactionTime.",
    },
    filters: [
      {
        key: "businessDate",
        behavior: "applied",
        description: "Scopes entries to the selected business day.",
      },
      {
        key: "productId",
        behavior: "ignored",
        description: "Account entries are not product-scoped.",
      },
      {
        key: "unit",
        behavior: "ignored",
        description: "Account entries are not quantity-unit scoped.",
      },
    ],
    integrity: { state: "canonical", onAttention: "show_with_attention" },
    action: {
      kind: "drilldown",
      target: "row_document",
      label: "Open source document",
      hrefTemplate: null,
    },
  },
  {
    reportType: "customer_receivables",
    label: "Customer receivables",
    measure: "Positive customer_account_balances.balance_minor by customer.",
    source: { kind: "projection", relations: ["customer_account_balances", "customers"] },
    time: {
      kind: "current_snapshot",
      field: "lastEntryTransactionTime",
      boundary: "none",
      timezone: "Asia/Ho_Chi_Minh",
      description:
        "Current persisted balance; the last entry time is display freshness, not a date filter.",
    },
    filters: [
      {
        key: "businessDate",
        behavior: "ignored",
        description: "Receivables show the current balance, not a historical day.",
      },
      {
        key: "productId",
        behavior: "ignored",
        description: "Receivables are customer-account scoped.",
      },
      {
        key: "unit",
        behavior: "ignored",
        description: "Receivables are not quantity-unit scoped.",
      },
    ],
    integrity: { state: "projection", onAttention: "fail_closed" },
    action: {
      kind: "drilldown",
      target: "customer",
      label: "Review customer account",
      hrefTemplate: "/customers/:id",
    },
  },
  {
    reportType: "supplier_payables",
    label: "Supplier payables",
    measure: "Positive supplier_account_balances.balance_minor by supplier.",
    source: { kind: "projection", relations: ["supplier_account_balances", "suppliers"] },
    time: {
      kind: "current_snapshot",
      field: "lastEntryTransactionTime",
      boundary: "none",
      timezone: "Asia/Ho_Chi_Minh",
      description:
        "Current persisted payable balance; the last entry time is display freshness, not a date filter.",
    },
    filters: [
      {
        key: "businessDate",
        behavior: "ignored",
        description: "Payables show the current balance, not a historical day.",
      },
      {
        key: "productId",
        behavior: "ignored",
        description: "Payables are supplier-account scoped.",
      },
      { key: "unit", behavior: "ignored", description: "Payables are not quantity-unit scoped." },
    ],
    integrity: { state: "projection", onAttention: "fail_closed" },
    action: {
      kind: "drilldown",
      target: "supplier",
      label: "Review supplier account",
      hrefTemplate: "/suppliers/:id",
    },
  },
  {
    reportType: "inventory_by_product_unit",
    label: "Inventory by product, grade and unit",
    measure: "Current inventory_balances.quantity_scaled by product, quality grade and unit.",
    source: { kind: "projection", relations: ["inventory_balances", "products", "quality_grades"] },
    time: {
      kind: "current_snapshot",
      field: "lastMovementTransactionTime",
      boundary: "none",
      timezone: "Asia/Ho_Chi_Minh",
      description:
        "Current persisted quantity; the last movement time is display freshness, not a date filter.",
    },
    filters: [
      {
        key: "businessDate",
        behavior: "ignored",
        description: "Inventory balance is current state, not a historical day.",
      },
      {
        key: "productId",
        behavior: "applied",
        description: "Scopes balances to one product when supplied.",
      },
      {
        key: "unit",
        behavior: "applied",
        description: "Scopes balances to one unit when supplied.",
      },
    ],
    integrity: { state: "projection", onAttention: "fail_closed" },
    action: {
      kind: "drilldown",
      target: "product_inventory",
      label: "Review inventory movements",
      hrefTemplate: "/products/:id/inventory",
    },
  },
  {
    reportType: "inventory_movement_report",
    label: "Inventory movements",
    measure: "Sum inventory_movements.quantity_scaled by the selected filters.",
    source: { kind: "canonical", relations: ["inventory_movements", "products"] },
    time: {
      kind: "business_day",
      field: "transactionTime",
      boundary: "workspace_operational_profile",
      timezone: "Asia/Ho_Chi_Minh",
      description: "The workspace business-day start is applied to movement transactionTime.",
    },
    filters: [
      {
        key: "businessDate",
        behavior: "applied",
        description: "Scopes movements to the selected business day.",
      },
      {
        key: "productId",
        behavior: "applied",
        description: "Scopes movements to one product when supplied.",
      },
      {
        key: "unit",
        behavior: "applied",
        description: "Scopes movements to one unit when supplied.",
      },
    ],
    integrity: { state: "canonical", onAttention: "show_with_attention" },
    action: {
      kind: "drilldown",
      target: "row_document",
      label: "Open source document",
      hrefTemplate: null,
    },
  },
  {
    reportType: "outstanding_delivery",
    label: "Outstanding delivery quantity",
    measure: "Ordered quantity minus dispatched quantity plus returned quantity for posted sales.",
    source: {
      kind: "derived_canonical",
      relations: [
        "sales",
        "sale_lines",
        "deliveries",
        "delivery_lines",
        "delivery_returns",
        "delivery_return_lines",
      ],
    },
    time: {
      kind: "current_open_state",
      field: null,
      boundary: "none",
      timezone: "Asia/Ho_Chi_Minh",
      description: "Current open fulfilment state; the report has no businessDate filter.",
    },
    filters: [
      {
        key: "businessDate",
        behavior: "ignored",
        description: "Outstanding quantity is current open work, not a historical day.",
      },
      {
        key: "productId",
        behavior: "ignored",
        description: "The current report is scoped by posted sale lines.",
      },
      {
        key: "unit",
        behavior: "ignored",
        description: "The current report is scoped by posted sale lines.",
      },
    ],
    integrity: { state: "derived_canonical", onAttention: "show_with_attention" },
    action: {
      kind: "drilldown",
      target: "sale",
      label: "Review sale fulfilment",
      hrefTemplate: "/sales/:id",
    },
  },
  {
    reportType: "cash_balances",
    label: "Cash balances",
    measure: "Current cash_balances.balance_minor by cash account.",
    source: { kind: "projection", relations: ["cash_balances", "cash_accounts"] },
    time: {
      kind: "current_snapshot",
      field: "lastMovementTransactionTime",
      boundary: "none",
      timezone: "Asia/Ho_Chi_Minh",
      description:
        "Current persisted cash balance; the last movement time is display freshness, not a date filter.",
    },
    filters: [
      {
        key: "businessDate",
        behavior: "ignored",
        description: "Cash balance is current state, not a historical day.",
      },
      {
        key: "productId",
        behavior: "ignored",
        description: "Cash balances are not product-scoped.",
      },
      {
        key: "unit",
        behavior: "ignored",
        description: "Cash balances are not quantity-unit scoped.",
      },
    ],
    integrity: { state: "projection", onAttention: "fail_closed" },
    action: {
      kind: "drilldown",
      target: "cash_account",
      label: "Review cash account",
      hrefTemplate: "/cash/accounts/:id",
    },
  },
  {
    reportType: "cash_movement_report",
    label: "Cash movements",
    measure: "Sum cash_movements.amount_minor in the selected business day.",
    source: { kind: "canonical", relations: ["cash_movements", "cash_accounts"] },
    time: {
      kind: "business_day",
      field: "transactionTime",
      boundary: "workspace_operational_profile",
      timezone: "Asia/Ho_Chi_Minh",
      description: "The workspace business-day start is applied to movement transactionTime.",
    },
    filters: [
      {
        key: "businessDate",
        behavior: "applied",
        description: "Scopes movements to the selected business day.",
      },
      {
        key: "productId",
        behavior: "ignored",
        description: "Cash movements are not product-scoped.",
      },
      {
        key: "unit",
        behavior: "ignored",
        description: "Cash movements are not quantity-unit scoped.",
      },
    ],
    integrity: { state: "canonical", onAttention: "show_with_attention" },
    action: {
      kind: "drilldown",
      target: "cash_account",
      label: "Review cash account",
      hrefTemplate: "/cash/accounts/:id",
    },
  },
  {
    reportType: "expense_report",
    label: "Expenses",
    measure: "Sum non-reversed expenses.amount_minor in the selected business day.",
    source: { kind: "canonical", relations: ["expenses", "expense_reversals", "cash_accounts"] },
    time: {
      kind: "business_day",
      field: "transactionTime",
      boundary: "workspace_operational_profile",
      timezone: "Asia/Ho_Chi_Minh",
      description: "The workspace business-day start is applied to expense transactionTime.",
    },
    filters: [
      {
        key: "businessDate",
        behavior: "applied",
        description: "Scopes non-reversed expenses to the selected business day.",
      },
      { key: "productId", behavior: "ignored", description: "Expenses are not product-scoped." },
      { key: "unit", behavior: "ignored", description: "Expenses are not quantity-unit scoped." },
    ],
    integrity: { state: "canonical", onAttention: "show_with_attention" },
    action: {
      kind: "drilldown",
      target: "expense",
      label: "Review expense",
      hrefTemplate: "/cash/expenses/:id",
    },
  },
] satisfies readonly ReportDefinition[];

export const reportDefinitionsDtoSchema = z.object({
  version: z.literal(1),
  definitions: z.array(reportDefinitionSchema),
});
export type ReportDefinitionsDto = z.infer<typeof reportDefinitionsDtoSchema>;

export const REPORT_DEFINITIONS_DTO = {
  version: 1,
  definitions: REPORT_DEFINITIONS,
} satisfies ReportDefinitionsDto;

/**
 * Availability is deliberately separate from the operational report contract.
 * A blocked candidate must be visible as unavailable, without inventing a zero,
 * formula or source projection before its policy and canonical facts exist.
 */
export const METRIC_CANDIDATE_IDS = [
  "revenue",
  "cogs",
  "gross_profit",
  "gross_margin",
  "waste_value",
  "waste_rate",
  "price_margin_change",
  "receivable_aging",
  "payable_aging",
  "inventory_health",
  "reorder_risk",
  "supplier_performance",
  "cash_gap",
  "shift_close_variance",
  "bank_reconciliation",
] as const;
export const metricCandidateIdSchema = z.enum(METRIC_CANDIDATE_IDS);
export type MetricCandidateId = z.infer<typeof metricCandidateIdSchema>;

export const metricAvailabilityDefinitionSchema = z.object({
  metricId: metricCandidateIdSchema,
  label: z.string().min(1),
  availability: z.literal("unavailable"),
  blockedBy: z.array(z.string().regex(/^ASM-\d{3}$/)).min(1),
  reason: z.string().min(1),
  nextEvidence: z.string().min(1),
});
export type MetricAvailabilityDefinition = z.infer<typeof metricAvailabilityDefinitionSchema>;

const metricSemanticDefinitionSchema = z.object({
  metricId: metricCandidateIdSchema,
  label: z.string().min(1),
  availability: z.enum(["available", "degraded"]),
  formula: z.string().min(1),
  canonicalSources: z.array(z.string().min(1)).min(1),
  includedStates: z.array(z.string().min(1)).min(1),
  excludedStates: z.array(z.string().min(1)),
  businessTime: z.string().min(1),
  scope: z.string().min(1),
  freshness: z.string().min(1),
  integrity: z.enum(["canonical", "projection", "derived_canonical"]),
  onIntegrityAttention: z.enum(["show_with_attention", "fail_closed"]),
  drilldown: z.string().min(1),
  action: z.string().min(1),
});
export type MetricSemanticDefinition = z.infer<typeof metricSemanticDefinitionSchema>;

/**
 * Moving a candidate out of `unavailable` requires the complete semantic
 * contract. This union is the structural gate for future policy-decided metrics.
 */
export const metricDefinitionSchema = z.discriminatedUnion("availability", [
  metricAvailabilityDefinitionSchema,
  metricSemanticDefinitionSchema,
]);
export type MetricDefinition = z.infer<typeof metricDefinitionSchema>;

export const METRIC_AVAILABILITY_DEFINITIONS = [
  {
    metricId: "revenue",
    label: "Revenue",
    availability: "unavailable",
    blockedBy: ["ASM-023", "ASM-024"],
    reason: "Recognition semantics must be field-validated before management revenue is published.",
    nextEvidence: "Owner-confirmed recognition moment bound to the operating release.",
  },
  {
    metricId: "cogs",
    label: "COGS",
    availability: "unavailable",
    blockedBy: ["ASM-039", "ASM-040"],
    reason: "Valuation basis and cost effects are not decided.",
    nextEvidence: "Field-approved valuation, cost assignment and correction examples.",
  },
  {
    metricId: "gross_profit",
    label: "Gross profit",
    availability: "unavailable",
    blockedBy: ["ASM-039", "ASM-040"],
    reason: "COGS is unavailable until valuation and cost-effect policy is closed.",
    nextEvidence: "Reproducible revenue-minus-COGS policy with historical examples.",
  },
  {
    metricId: "gross_margin",
    label: "Gross margin",
    availability: "unavailable",
    blockedBy: ["ASM-039", "ASM-040"],
    reason: "Margin cannot be derived while revenue recognition or cost basis is unresolved.",
    nextEvidence: "Field-approved numerator, denominator and zero/negative-cost handling.",
  },
  {
    metricId: "waste_value",
    label: "Waste value",
    availability: "unavailable",
    blockedBy: ["ASM-040"],
    reason: "Waste, damage and rejected-goods cost treatment is not decided.",
    nextEvidence: "Source-linked waste examples with approved valuation treatment.",
  },
  {
    metricId: "waste_rate",
    label: "Waste rate",
    availability: "unavailable",
    blockedBy: ["ASM-040"],
    reason: "The numerator, denominator and included physical outcomes are not decided.",
    nextEvidence: "Field-approved waste classification and period calculation examples.",
  },
  {
    metricId: "price_margin_change",
    label: "Price and margin change",
    availability: "unavailable",
    blockedBy: ["ASM-039", "ASM-040"],
    reason: "Price history exists, but margin requires a policy-backed cost baseline.",
    nextEvidence: "Approved cost baseline and comparison period semantics.",
  },
  {
    metricId: "receivable_aging",
    label: "Receivable aging",
    availability: "unavailable",
    blockedBy: ["ASM-016", "ASM-041"],
    reason: "Payment terms, due-date defaults and allocation semantics are unresolved.",
    nextEvidence: "Field-approved terms, aging buckets and allocation examples.",
  },
  {
    metricId: "payable_aging",
    label: "Payable aging",
    availability: "unavailable",
    blockedBy: ["ASM-025", "ASM-041"],
    reason: "Supplier recognition and payable terms/allocation semantics are unresolved.",
    nextEvidence: "Owner/accountant confirmation of payable timing and aging rules.",
  },
  {
    metricId: "inventory_health",
    label: "Inventory health",
    availability: "unavailable",
    blockedBy: ["ASM-042", "ASM-043"],
    reason: "Stock-risk thresholds and stocktake/variance semantics are not decided.",
    nextEvidence: "Field-approved stock-risk states and variance workflow.",
  },
  {
    metricId: "reorder_risk",
    label: "Reorder risk",
    availability: "unavailable",
    blockedBy: ["ASM-042"],
    reason: "Minimum, target, lead-time and velocity policies are not decided.",
    nextEvidence: "Product/grade/unit planning examples with approved action thresholds.",
  },
  {
    metricId: "cash_gap",
    label: "Projected cash gap",
    availability: "unavailable",
    blockedBy: ["ASM-045", "ASM-046"],
    reason: "Close, deposit and settlement semantics are not decided.",
    nextEvidence: "Field-approved cash close, external settlement and unresolved-item rules.",
  },
  {
    metricId: "shift_close_variance",
    label: "Shift close variance",
    availability: "unavailable",
    blockedBy: ["ASM-045"],
    reason: "There is no decided persisted close event or variance authority.",
    nextEvidence: "Observed close procedure with counted inputs and correction authority.",
  },
  {
    metricId: "bank_reconciliation",
    label: "Bank reconciliation",
    availability: "unavailable",
    blockedBy: ["ASM-046"],
    reason: "External statement matching and settlement semantics are not decided.",
    nextEvidence: "Approved statement input, matching key and unresolved settlement workflow.",
  },
] satisfies readonly MetricAvailabilityDefinition[];

export const METRIC_SEMANTIC_DEFINITIONS = [
  {
    metricId: "supplier_performance",
    label: "Supplier performance",
    availability: "available",
    formula:
      "Policy-window summary of source-linked promised/actual/accepted/rejected quantities and expected/actual arrival timing; rates use integer basis points.",
    canonicalSources: ["supplier_observations"],
    includedStates: [
      "approved effective supplier_evaluation policy",
      "non-superseded observations",
    ],
    excludedStates: ["correction targets", "observations outside the policy window"],
    businessTime: "SupplierObservation.transactionTime",
    scope: "one workspace, one Supplier and one effective policy window",
    freshness: "calculated at read time from canonical observations",
    integrity: "derived_canonical",
    onIntegrityAttention: "fail_closed",
    drilldown: "sourceObservationIds in supplier.performance",
    action: "Review source facts; never rank, recommend or create a purchase effect.",
  },
] satisfies readonly MetricSemanticDefinition[];

export const reportMetricDefinitionsDtoSchema = z.object({
  version: z.literal(1),
  definitions: z.array(metricDefinitionSchema),
});
export type ReportMetricDefinitionsDto = z.infer<typeof reportMetricDefinitionsDtoSchema>;

export const REPORT_METRIC_DEFINITIONS_DTO = {
  version: 1,
  definitions: [...METRIC_AVAILABILITY_DEFINITIONS, ...METRIC_SEMANTIC_DEFINITIONS],
} satisfies ReportMetricDefinitionsDto;

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

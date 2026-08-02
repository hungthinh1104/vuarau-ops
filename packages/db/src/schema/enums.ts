import { pgEnum } from "drizzle-orm/pg-core";
import {
  CURRENCY_CODES,
  WORKSPACE_ROLES,
  DEBT_ADJUSTMENT_REASON_CODES,
  ACCOUNT_ENTRY_SOURCE_TYPES,
  SALE_STATUSES,
  SALE_VOID_REASON_CODES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  UNITS,
  SUPPLIER_ACCOUNT_SOURCE_TYPES,
  PURCHASE_STATUSES,
  inventoryMovementSourceTypeSchema,
  PURCHASING_MODES,
  INVENTORY_MODES,
  QUALITY_GRADE_MODES,
  DELIVERY_MODES,
  CASHBOOK_MODES,
  INTAKE_MODES,
  WEIGHING_MODES,
  CASH_ACCOUNT_KINDS,
  CASH_MOVEMENT_SOURCE_TYPES,
  EXPENSE_CATEGORIES,
  CASH_ADJUSTMENT_REASON_CODES,
  QUALITY_ISSUE_CATEGORIES,
  QUALITY_SEVERITIES,
  QUALITY_DISPOSITION_OUTCOMES,
} from "@vuarau/domain-contracts";

/**
 * Postgres enums built from the contract constants, so the database and the API
 * cannot drift. Adding a value means changing the contract — and a migration.
 */
export const currencyCodeEnum = pgEnum("currency_code", CURRENCY_CODES);
export const unitEnum = pgEnum("unit", UNITS);
export const saleStatusEnum = pgEnum("sale_status", SALE_STATUSES);
export const paymentStatusEnum = pgEnum("payment_status", PAYMENT_STATUSES);
export const paymentMethodEnum = pgEnum("payment_method", PAYMENT_METHODS);
export const accountEntrySourceTypeEnum = pgEnum(
  "account_entry_source_type",
  ACCOUNT_ENTRY_SOURCE_TYPES,
);
export const debtAdjustmentReasonCodeEnum = pgEnum(
  "debt_adjustment_reason_code",
  DEBT_ADJUSTMENT_REASON_CODES,
);
export const workspaceRoleEnum = pgEnum("workspace_role", WORKSPACE_ROLES);
export const purchasingModeEnum = pgEnum("purchasing_mode", PURCHASING_MODES);
export const inventoryModeEnum = pgEnum("inventory_mode", INVENTORY_MODES);
export const qualityGradeModeEnum = pgEnum("quality_grade_mode", QUALITY_GRADE_MODES);
export const deliveryModeEnum = pgEnum("delivery_mode", DELIVERY_MODES);
export const cashbookModeEnum = pgEnum("cashbook_mode", CASHBOOK_MODES);
export const intakeModeEnum = pgEnum("intake_mode", INTAKE_MODES);
export const weighingModeEnum = pgEnum("weighing_mode", WEIGHING_MODES);
export const cashAccountKindEnum = pgEnum("cash_account_kind", CASH_ACCOUNT_KINDS);
export const cashMovementSourceTypeEnum = pgEnum(
  "cash_movement_source_type",
  CASH_MOVEMENT_SOURCE_TYPES,
);
export const expenseCategoryEnum = pgEnum("expense_category", EXPENSE_CATEGORIES);
export const qualityIssueCategoryEnum = pgEnum("quality_issue_category", QUALITY_ISSUE_CATEGORIES);
export const qualitySeverityEnum = pgEnum("quality_severity", QUALITY_SEVERITIES);
export const qualityDispositionOutcomeEnum = pgEnum(
  "quality_disposition_outcome",
  QUALITY_DISPOSITION_OUTCOMES,
);
export const qualityDispositionSourceTypeEnum = pgEnum("quality_disposition_source_type", [
  "arrival_line",
  "quarantine_allocation",
]);
export const cashAdjustmentReasonCodeEnum = pgEnum(
  "cash_adjustment_reason_code",
  CASH_ADJUSTMENT_REASON_CODES,
);
export const saleVoidReasonCodeEnum = pgEnum("sale_void_reason_code", SALE_VOID_REASON_CODES);
export const supplierAccountSourceTypeEnum = pgEnum(
  "supplier_account_source_type",
  SUPPLIER_ACCOUNT_SOURCE_TYPES,
);
export const purchaseStatusEnum = pgEnum("purchase_status", PURCHASE_STATUSES);
export const inventoryMovementSourceTypeEnum = pgEnum(
  "inventory_movement_source_type",
  inventoryMovementSourceTypeSchema.options as [
    "purchase_receipt",
    "purchase_receipt_reversal",
    "inventory_adjustment",
    "delivery_dispatch",
    "delivery_return",
    "inventory_reclassification",
    "quality_disposition",
    "quality_disposition_reversal",
  ],
);
export const deliveryStatusEnum = pgEnum("delivery_status", [
  "draft",
  "cancelled",
  "dispatched",
  "delivered",
]);
export const documentTypeEnum = pgEnum("document_type", [
  "sale_receipt",
  "customer_statement",
  "purchase_order",
  "delivery_note",
]);
export const documentSourceTypeEnum = pgEnum("document_source_type", [
  "sale",
  "customer",
  "purchase",
  "delivery",
]);
export const commandReceiptStatusEnum = pgEnum("command_receipt_status", [
  "in_progress",
  "completed",
]);

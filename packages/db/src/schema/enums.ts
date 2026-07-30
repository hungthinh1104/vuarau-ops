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

import { pgEnum } from "drizzle-orm/pg-core";
import {
  CURRENCY_CODES,
  WORKSPACE_ROLES,
  DEBT_ADJUSTMENT_REASON_CODES,
  LEDGER_SOURCE_TYPES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  UNITS,
} from "@vuanha/domain-contracts";

/**
 * Postgres enums built from the contract constants, so the database and the API
 * cannot drift. Adding a value means changing the contract — and a migration.
 */
export const currencyCodeEnum = pgEnum("currency_code", CURRENCY_CODES);
export const unitEnum = pgEnum("unit", UNITS);
export const orderStatusEnum = pgEnum("order_status", ORDER_STATUSES);
export const paymentStatusEnum = pgEnum("payment_status", PAYMENT_STATUSES);
export const paymentMethodEnum = pgEnum("payment_method", PAYMENT_METHODS);
export const ledgerSourceTypeEnum = pgEnum("ledger_source_type", LEDGER_SOURCE_TYPES);
export const debtAdjustmentReasonCodeEnum = pgEnum(
  "debt_adjustment_reason_code",
  DEBT_ADJUSTMENT_REASON_CODES,
);
export const workspaceRoleEnum = pgEnum("workspace_role", WORKSPACE_ROLES);
export const commandReceiptStatusEnum = pgEnum("command_receipt_status", [
  "in_progress",
  "completed",
]);

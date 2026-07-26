import type { CustomerAccountEntryDto } from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  COMMAND_ID,
  CUSTOMER_ID,
  LEDGER_ENTRY_1_ID,
  LEDGER_ENTRY_2_ID,
  SALE_ID,
  PAYMENT_ID,
  WORKSPACE_ID,
} from "./ids.fixtures.ts";
import {
  LATER_RECORDED_AT,
  LATER_TRANSACTION_TIME,
  RECORDED_AT,
  TRANSACTION_TIME,
} from "./time.fixtures.ts";
import { vnd } from "./customer.fixtures.ts";

/**
 * The ledger from docs/05-casebook/customer-account-cases.md, entry by entry.
 * Balances in tests are asserted against the sum of these — never against a
 * separately-maintained number.
 */

export const orderConfirmationEntry: CustomerAccountEntryDto = {
  id: LEDGER_ENTRY_1_ID,
  workspaceId: WORKSPACE_ID,
  customerId: CUSTOMER_ID,
  amount: vnd(875_000),
  sourceType: "sale_posting",
  sourceId: SALE_ID,
  reversalOfEntryId: null,
  reasonCode: null,
  reason: null,
  transactionTime: TRANSACTION_TIME,
  recordedAt: RECORDED_AT,
  actorId: ACTOR_ID,
  commandId: COMMAND_ID,
};

export const paymentEntry: CustomerAccountEntryDto = {
  ...orderConfirmationEntry,
  id: LEDGER_ENTRY_2_ID,
  amount: vnd(-500_000),
  sourceType: "payment",
  sourceId: PAYMENT_ID,
  transactionTime: LATER_TRANSACTION_TIME,
  recordedAt: LATER_RECORDED_AT,
};

/** Balance after both entries: 875 000 − 500 000 = 375 000 ₫. */
export const ledgerWithOrderAndPayment: readonly CustomerAccountEntryDto[] = [
  orderConfirmationEntry,
  paymentEntry,
];

export const LEDGER_BALANCE_AFTER_PAYMENT = vnd(375_000);

import type { AccountTimelineEntryDto, CustomerAccountBalanceDto } from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  COMMAND_ID,
  CUSTOMER_WITH_DEBT_ID,
  LEDGER_ENTRY_1_ID,
  LEDGER_ENTRY_2_ID,
  PAYMENT_ID,
  POSTED_SALE_ID,
  SALE_VOID_ID,
  SECOND_COMMAND_ID,
  THIRD_COMMAND_ID,
  VOIDED_SALE_ID,
  WORKSPACE_ID,
  testUuid,
} from "@vuarau/test-fixtures/ids";
import {
  LATER_TRANSACTION_TIME,
  LATEST_RECORDED_AT,
  LATEST_TRANSACTION_TIME,
  RECORDED_AT,
  TRANSACTION_TIME,
} from "@vuarau/test-fixtures/time";
import type { CustomerAccountEntryId } from "@vuarau/domain-contracts";
import { vnd } from "./session.fixtures.ts";

const ALLOWED = { allowed: true } as const;

export const balanceReceivable: CustomerAccountBalanceDto = {
  workspaceId: WORKSPACE_ID,
  customerId: CUSTOMER_WITH_DEBT_ID,
  balance: vnd(375_000),
  classification: "receivable",
  entryCount: 2,
  lastEntryTransactionTime: LATER_TRANSACTION_TIME,
  updatedAt: LATEST_RECORDED_AT,
  capabilities: { adjust: ALLOWED },
};

export const balanceSettled: CustomerAccountBalanceDto = {
  ...balanceReceivable,
  balance: vnd(0),
  classification: "settled",
  entryCount: 0,
  lastEntryTransactionTime: null,
};

/** Overpayment. Valid and expected (BR-ACCOUNT-007) — the UI does not warn about it. */
export const balanceCustomerCredit: CustomerAccountBalanceDto = {
  ...balanceReceivable,
  balance: vnd(-500_000),
  classification: "customer_credit",
  entryCount: 3,
};

/** The caller lacks `debt.adjust` — `sales` or `warehouse`, not owner or accountant. */
export const balanceAdjustDenied: CustomerAccountBalanceDto = {
  ...balanceReceivable,
  capabilities: {
    adjust: {
      allowed: false,
      reasonCode: "PERMISSION_DENIED",
      details: { permission: "debt.adjust", role: "sales" },
    },
  },
};

/**
 * A timeline that reads like a depot's week: a sale posted, a payment taken, then
 * a correction.
 *
 * The correction is the part worth having as a fixture. A voided sale appears as
 * `+875.000` **and** `−875.000`, both lines standing, because removing either
 * would make the running balance unfollowable (BR-ACCOUNT-005). A screen that
 * "tidied up" the pair would be the reason somebody could not reconcile a dispute.
 */
export const accountTimeline: readonly AccountTimelineEntryDto[] = [
  {
    id: LEDGER_ENTRY_1_ID,
    workspaceId: WORKSPACE_ID,
    customerId: CUSTOMER_WITH_DEBT_ID,
    amount: vnd(875_000),
    runningBalance: vnd(875_000),
    classification: "receivable",
    source: {
      type: "sale_posting",
      id: POSTED_SALE_ID,
      document: { type: "sale", id: POSTED_SALE_ID },
      label: "Đơn 875.000 ₫ — 20/07",
    },
    reversalOfEntryId: null,
    reasonCode: null,
    reason: null,
    transactionTime: TRANSACTION_TIME,
    recordedAt: RECORDED_AT,
    actorId: ACTOR_ID,
    commandId: COMMAND_ID,
  },
  {
    id: LEDGER_ENTRY_2_ID,
    workspaceId: WORKSPACE_ID,
    customerId: CUSTOMER_WITH_DEBT_ID,
    amount: vnd(-500_000),
    runningBalance: vnd(375_000),
    classification: "receivable",
    source: {
      type: "payment",
      id: PAYMENT_ID,
      document: { type: "payment", id: PAYMENT_ID },
      label: "Tiền mặt 500.000 ₫",
    },
    reversalOfEntryId: null,
    reasonCode: null,
    reason: null,
    transactionTime: LATER_TRANSACTION_TIME,
    recordedAt: LATER_TRANSACTION_TIME,
    actorId: ACTOR_ID,
    commandId: SECOND_COMMAND_ID,
  },
  {
    id: testUuid("3", 3) as CustomerAccountEntryId,
    workspaceId: WORKSPACE_ID,
    customerId: CUSTOMER_WITH_DEBT_ID,
    amount: vnd(-875_000),
    runningBalance: vnd(-500_000),
    classification: "customer_credit",
    source: {
      type: "sale_void",
      id: SALE_VOID_ID,
      document: { type: "sale", id: VOIDED_SALE_ID },
      label: `Hoàn tác đơn ${VOIDED_SALE_ID}`,
    },
    reversalOfEntryId: LEDGER_ENTRY_1_ID,
    reasonCode: null,
    reason: "Ghi nhầm 2 thùng ớt, thực tế chỉ giao 1 thùng.",
    transactionTime: LATEST_TRANSACTION_TIME,
    recordedAt: LATEST_RECORDED_AT,
    actorId: ACTOR_ID,
    commandId: THIRD_COMMAND_ID,
  },
];

/**
 * One entry whose `transactionTime` and `recordedAt` differ by six hours: a sale
 * at dawn, typed in mid-morning (docs/07-data/time-semantics.md). Somebody
 * reconciling a disputed balance needs to see that gap.
 */
export const backdatedTimelineEntry = accountTimeline[0]!;

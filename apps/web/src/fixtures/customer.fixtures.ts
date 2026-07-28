import type {
  CustomerCapabilities,
  CustomerDetailDto,
  CustomerSummaryDto,
} from "@vuarau/domain-contracts";
import {
  CUSTOMER_ID,
  CUSTOMER_WITH_DEBT_ID,
  CUSTOMER_ZERO_DEBT_ID,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures/ids";
import { RECORDED_AT, TRANSACTION_TIME } from "@vuarau/test-fixtures/time";
import { vnd } from "./session.fixtures.ts";

const ALLOWED = { allowed: true } as const;

const ownerCapabilities: CustomerCapabilities = {
  update: ALLOWED,
  deactivate: ALLOWED,
  reactivate: {
    allowed: false,
    reasonCode: "CUSTOMER_ALREADY_ACTIVE",
    details: {},
  },
  adjustAccount: ALLOWED,
};

/**
 * A customer with an outstanding receivable — the ordinary case, and the one the
 * product exists for.
 *
 * The name is a real depot name: people are identified by name and place ("chị
 * Lan chợ Bình Điền"), because a first name alone does not find anybody again
 * (BR-CUSTOMER-001).
 */
export const customerWithReceivable: CustomerSummaryDto = {
  id: CUSTOMER_WITH_DEBT_ID,
  workspaceId: WORKSPACE_ID,
  displayName: "Chị Lan — chợ Bình Điền",
  phone: "0903 112 233",
  isActive: true,
  version: 1,
  balance: vnd(375_000),
  classification: "receivable",
  lastEntryTransactionTime: TRANSACTION_TIME,
  capabilities: ownerCapabilities,
};

export const customerSettled: CustomerSummaryDto = {
  id: CUSTOMER_ZERO_DEBT_ID,
  workspaceId: WORKSPACE_ID,
  displayName: "Anh Tuấn — vựa Thủ Đức",
  phone: null,
  isActive: true,
  version: 1,
  balance: vnd(0),
  classification: "settled",
  lastEntryTransactionTime: TRANSACTION_TIME,
  capabilities: ownerCapabilities,
};

/**
 * A customer who paid ahead. The balance is **negative** and the classification
 * says what that means.
 *
 * The whole point of the fixture: a screen that renders this as "nợ −500.000"
 * sends a worker to collect money from somebody the depot owes.
 */
export const customerWithCredit: CustomerSummaryDto = {
  id: CUSTOMER_ID,
  workspaceId: WORKSPACE_ID,
  displayName: "Cô Hoà — quán cơm Tân Bình",
  phone: "0908 445 566",
  isActive: true,
  version: 2,
  balance: vnd(-500_000),
  classification: "customer_credit",
  lastEntryTransactionTime: TRANSACTION_TIME,
  capabilities: ownerCapabilities,
};

/**
 * Deactivated, and **still owing money**.
 *
 * BR-CUSTOMER-003: deactivation hides a customer from new sales and settles
 * nothing. A list that dropped this row would make "tidy up the customer list" a
 * way to make debt vanish, so the fixture keeps a balance on purpose.
 */
export const customerInactive: CustomerSummaryDto = {
  ...customerWithReceivable,
  displayName: "Chú Bảy — đã nghỉ bán",
  phone: null,
  isActive: false,
  version: 3,
  balance: vnd(1_250_000),
  classification: "receivable",
  capabilities: {
    ...ownerCapabilities,
    deactivate: { allowed: false, reasonCode: "CUSTOMER_ALREADY_INACTIVE", details: {} },
  },
};

export const customerDetail: CustomerDetailDto = {
  customer: {
    id: CUSTOMER_WITH_DEBT_ID,
    workspaceId: WORKSPACE_ID,
    displayName: customerWithReceivable.displayName,
    phone: customerWithReceivable.phone,
    note: "Lấy hàng sáng sớm, thanh toán cuối tuần.",
    isActive: true,
    version: 1,
    transactionTime: TRANSACTION_TIME,
    recordedAt: RECORDED_AT,
    updatedAt: RECORDED_AT,
  },
  balance: vnd(375_000),
  classification: "receivable",
  capabilities: ownerCapabilities,
};

export const customerPage: readonly CustomerSummaryDto[] = [
  customerWithReceivable,
  customerSettled,
  customerWithCredit,
  customerInactive,
];

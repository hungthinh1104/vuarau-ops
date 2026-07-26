import type { CustomerId, Money } from "@vuarau/domain-contracts";
import type { CustomerState } from "@vuarau/domain-kernel";
import {
  CUSTOMER_ID,
  CUSTOMER_WITH_DEBT_ID,
  CUSTOMER_ZERO_DEBT_ID,
  WORKSPACE_ID,
} from "./ids.fixtures.ts";
import { RECORDED_AT, TRANSACTION_TIME } from "./time.fixtures.ts";

export const VND = "VND" as const;

export function vnd(amountMinor: number): Money {
  return { amountMinor, currency: VND };
}

/** An ordinary active customer. The default subject of most tests. */
export const activeCustomer: CustomerState = {
  id: CUSTOMER_ID,
  workspaceId: WORKSPACE_ID,
  displayName: "Chị Lan chợ Bình Điền",
  phone: "0901234567",
  note: null,
  isActive: true,
  version: 1,
  transactionTime: TRANSACTION_TIME,
  recordedAt: RECORDED_AT,
  updatedAt: RECORDED_AT,
};

/**
 * A customer with no ledger entries at all. Their balance is zero because nothing
 * has ever moved it — not because a zero was stored anywhere (ADR-0004).
 */
export const customerWithZeroDebt: CustomerState = {
  ...activeCustomer,
  id: CUSTOMER_ZERO_DEBT_ID,
  displayName: "Anh Tuấn mới mở",
  phone: null,
};

/**
 * A customer who already owes money. The 875 000 ₫ comes from CASE-ORDER-001, so
 * the arithmetic in the casebook and in the tests is the same arithmetic.
 */
export const customerWithExistingDebt: CustomerState = {
  ...activeCustomer,
  id: CUSTOMER_WITH_DEBT_ID,
  displayName: "Cô Bảy vựa Hóc Môn",
};

export const EXISTING_DEBT_BALANCE = vnd(875_000);

export function customerIn(
  workspaceId: CustomerState["workspaceId"],
  id: CustomerId,
): CustomerState {
  return { ...activeCustomer, id, workspaceId };
}

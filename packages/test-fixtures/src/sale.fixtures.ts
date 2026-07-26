import type { SaleLineInput } from "@vuarau/domain-contracts";
import type { SaleLineState, SaleState } from "@vuarau/domain-kernel";
import {
  POSTED_SALE_ID,
  CUSTOMER_ID,
  DUE_SALE_ID,
  EMPTY_SALE_ID,
  SALE_ID,
  SALE_LINE_1_ID,
  SALE_LINE_2_ID,
  SALE_LINE_3_ID,
  SALE_VOID_ID,
  VOIDED_SALE_ID,
  PRODUCT_CA_CHUA_ID,
  PRODUCT_OT_ID,
  PRODUCT_RAU_MUONG_ID,
  WORKSPACE_ID,
} from "./ids.fixtures.ts";
import { DUE_AT, RECORDED_AT, TRANSACTION_TIME } from "./time.fixtures.ts";
import { VND, vnd } from "./customer.fixtures.ts";

/**
 * The sale from CASE-SALE-001, with the casebook's exact numbers.
 *
 *   12,5 kg cà chua  @ 18 000 ₫/kg     = 225 000 ₫
 *   30 bó rau muống  @  5 000 ₫/bó     = 150 000 ₫
 *   2 thùng ớt       @ 250 000 ₫/thùng = 500 000 ₫
 *                                       ─────────
 *                                        875 000 ₫
 *
 * The cà chua line is the interesting one: 12 500 milli-kg exercises the
 * fractional path of BR-SALE-004 rather than a whole-number multiplication.
 */
export const SALE_TOTAL = vnd(875_000);

export const saleLineInputs: readonly SaleLineInput[] = [
  {
    lineId: SALE_LINE_1_ID,
    productId: PRODUCT_CA_CHUA_ID,
    productName: "Cà chua",
    quantity: { valueScaled: 12_500, unit: "kg" },
    unitPrice: vnd(18_000),
  },
  {
    lineId: SALE_LINE_2_ID,
    productId: PRODUCT_RAU_MUONG_ID,
    productName: "Rau muống",
    quantity: { valueScaled: 30_000, unit: "bo" },
    unitPrice: vnd(5_000),
  },
  {
    lineId: SALE_LINE_3_ID,
    productId: PRODUCT_OT_ID,
    productName: "Ớt hiểm",
    quantity: { valueScaled: 2_000, unit: "thung" },
    unitPrice: vnd(250_000),
  },
];

export const saleLineStates: readonly SaleLineState[] = [
  { ...saleLineInputs[0]!, lineTotal: vnd(225_000) },
  { ...saleLineInputs[1]!, lineTotal: vnd(150_000) },
  { ...saleLineInputs[2]!, lineTotal: vnd(500_000) },
];

/** A draft with three valid lines — ready to post. */
export const validDraftSale: SaleState = {
  id: SALE_ID,
  workspaceId: WORKSPACE_ID,
  customerId: CUSTOMER_ID,
  status: "draft",
  currency: VND,
  lines: saleLineStates,
  totalAmount: SALE_TOTAL,
  note: null,
  version: 1,
  transactionTime: TRANSACTION_TIME,
  recordedAt: RECORDED_AT,
  postedAt: null,
  discardedAt: null,
  dueAt: null,
  replacesSaleId: null,
  voidRecord: null,
};

/** A draft with no lines. Legal as a draft, refused on posting (BR-SALE-002). */
export const emptyDraftSale: SaleState = {
  ...validDraftSale,
  id: EMPTY_SALE_ID,
  lines: [],
  totalAmount: vnd(0),
};

/** Already posted: version 2, `postedAt` set, no void. */
export const postedSale: SaleState = {
  ...validDraftSale,
  id: POSTED_SALE_ID,
  status: "posted",
  version: 2,
  postedAt: RECORDED_AT,
};

/** A posted sale that has been voided — `financialState` reads `voided`. */
export const voidedSale: SaleState = {
  ...postedSale,
  id: VOIDED_SALE_ID,
  voidRecord: {
    id: SALE_VOID_ID,
    workspaceId: WORKSPACE_ID,
    saleId: VOIDED_SALE_ID,
    reasonCode: "wrong_amount",
    reason: "Ghi nhầm 2 thùng ớt, thực tế 1 thùng",
    amount: SALE_TOTAL,
    transactionTime: TRANSACTION_TIME,
    recordedAt: RECORDED_AT,
  },
};

/** A posted sale carrying an agreed payment term (BR-SALE-017). */
export const saleWithDueDate: SaleState = {
  ...postedSale,
  id: DUE_SALE_ID,
  dueAt: DUE_AT,
};

/** A line whose quantity is zero — the canonical BR-SALE-003 violation. */
export const invalidSaleLineInput: SaleLineInput = {
  ...saleLineInputs[0]!,
  quantity: { valueScaled: 0, unit: "kg" },
};

import type { OrderLineInput } from "@vuarau/domain-contracts";
import type { OrderLineState, OrderState } from "@vuarau/domain-kernel";
import {
  CONFIRMED_ORDER_ID,
  CUSTOMER_ID,
  EMPTY_ORDER_ID,
  ORDER_ID,
  ORDER_LINE_1_ID,
  ORDER_LINE_2_ID,
  ORDER_LINE_3_ID,
  PRODUCT_CA_CHUA_ID,
  PRODUCT_OT_ID,
  PRODUCT_RAU_MUONG_ID,
  WORKSPACE_ID,
} from "./ids.fixtures.ts";
import { RECORDED_AT, TRANSACTION_TIME } from "./time.fixtures.ts";
import { VND, vnd } from "./customer.fixtures.ts";

/**
 * The order from CASE-ORDER-001, with the casebook's exact numbers.
 *
 *   12,5 kg cà chua  @ 18 000 ₫/kg     = 225 000 ₫
 *   30 bó rau muống  @  5 000 ₫/bó     = 150 000 ₫
 *   2 thùng ớt       @ 250 000 ₫/thùng = 500 000 ₫
 *                                       ─────────
 *                                        875 000 ₫
 *
 * The cà chua line is the interesting one: 12 500 milli-kg exercises the
 * fractional path of BR-ORDER-004 rather than a whole-number multiplication.
 */
export const ORDER_TOTAL = vnd(875_000);

export const orderLineInputs: readonly OrderLineInput[] = [
  {
    lineId: ORDER_LINE_1_ID,
    productId: PRODUCT_CA_CHUA_ID,
    productName: "Cà chua",
    quantity: { valueScaled: 12_500, unit: "kg" },
    unitPrice: vnd(18_000),
  },
  {
    lineId: ORDER_LINE_2_ID,
    productId: PRODUCT_RAU_MUONG_ID,
    productName: "Rau muống",
    quantity: { valueScaled: 30_000, unit: "bo" },
    unitPrice: vnd(5_000),
  },
  {
    lineId: ORDER_LINE_3_ID,
    productId: PRODUCT_OT_ID,
    productName: "Ớt hiểm",
    quantity: { valueScaled: 2_000, unit: "thung" },
    unitPrice: vnd(250_000),
  },
];

export const orderLineStates: readonly OrderLineState[] = [
  { ...orderLineInputs[0]!, lineTotal: vnd(225_000) },
  { ...orderLineInputs[1]!, lineTotal: vnd(150_000) },
  { ...orderLineInputs[2]!, lineTotal: vnd(500_000) },
];

/** A draft with three valid lines — ready to confirm. */
export const validDraftOrder: OrderState = {
  id: ORDER_ID,
  workspaceId: WORKSPACE_ID,
  customerId: CUSTOMER_ID,
  status: "draft",
  currency: VND,
  lines: orderLineStates,
  totalAmount: ORDER_TOTAL,
  note: null,
  version: 1,
  transactionTime: TRANSACTION_TIME,
  recordedAt: RECORDED_AT,
  confirmedAt: null,
  cancelledAt: null,
};

/** A draft with no lines. Legal as a draft, refused on confirm (BR-ORDER-002). */
export const emptyDraftOrder: OrderState = {
  ...validDraftOrder,
  id: EMPTY_ORDER_ID,
  lines: [],
  totalAmount: vnd(0),
};

/** Already confirmed: version 2, `confirmedAt` set. */
export const confirmedOrder: OrderState = {
  ...validDraftOrder,
  id: CONFIRMED_ORDER_ID,
  status: "confirmed",
  version: 2,
  confirmedAt: RECORDED_AT,
};

/** A line whose quantity is zero — the canonical BR-ORDER-003 violation. */
export const invalidOrderLineInput: OrderLineInput = {
  ...orderLineInputs[0]!,
  quantity: { valueScaled: 0, unit: "kg" },
};

import type {
  SaleCapabilities,
  SaleDto,
  SaleLineDto,
  SaleSummaryDto,
} from "@vuarau/domain-contracts";
import {
  CUSTOMER_WITH_DEBT_ID,
  DUE_SALE_ID,
  POSTED_SALE_ID,
  PRODUCT_CA_CHUA_ID,
  PRODUCT_OT_ID,
  PRODUCT_RAU_MUONG_ID,
  REPLACEMENT_SALE_ID,
  SALE_ID,
  SALE_LINE_1_ID,
  SALE_LINE_2_ID,
  SALE_LINE_3_ID,
  SALE_VOID_ID,
  VOIDED_SALE_ID,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures/ids";
import { AFTER_DUE_AT, DUE_AT, RECORDED_AT, TRANSACTION_TIME } from "@vuarau/test-fixtures/time";
import { vnd } from "./session.fixtures.ts";

const ALLOWED = { allowed: true } as const;

/**
 * CASE-SALE-001, with the casebook's exact numbers — the same load the backend
 * tests use, so a story and a database test are looking at one sale.
 *
 *   12,5 kg cà chua  @  18.000 ₫/kg     = 225.000 ₫
 *   30 bó rau muống  @   5.000 ₫/bó     = 150.000 ₫
 *   2 thùng ớt       @ 250.000 ₫/thùng  = 500.000 ₫
 *                                        ─────────
 *                                         875.000 ₫
 */
export const saleLines: readonly SaleLineDto[] = [
  {
    lineId: SALE_LINE_1_ID,
    productId: PRODUCT_CA_CHUA_ID,
    productName: "Cà chua",
    quantity: { valueScaled: 12_500, unit: "kg" },
    unitPrice: vnd(18_000),
    lineTotal: vnd(225_000),
  },
  {
    lineId: SALE_LINE_2_ID,
    productId: PRODUCT_RAU_MUONG_ID,
    productName: "Rau muống",
    quantity: { valueScaled: 30_000, unit: "bo" },
    unitPrice: vnd(5_000),
    lineTotal: vnd(150_000),
  },
  {
    lineId: SALE_LINE_3_ID,
    productId: PRODUCT_OT_ID,
    productName: "Ớt hiểm",
    quantity: { valueScaled: 2_000, unit: "thung" },
    unitPrice: vnd(250_000),
    lineTotal: vnd(500_000),
  },
];

export const SALE_TOTAL = vnd(875_000);

const draftCapabilities: SaleCapabilities = {
  post: ALLOWED,
  void: { allowed: false, reasonCode: "SALE_NOT_POSTED", details: { saleId: SALE_ID } },
  edit: ALLOWED,
  discard: ALLOWED,
};

const postedCapabilities: SaleCapabilities = {
  post: { allowed: false, reasonCode: "SALE_ALREADY_POSTED", details: { saleId: POSTED_SALE_ID } },
  void: ALLOWED,
  edit: { allowed: false, reasonCode: "SALE_ALREADY_POSTED", details: { saleId: POSTED_SALE_ID } },
  discard: {
    allowed: false,
    reasonCode: "SALE_ALREADY_POSTED",
    details: { saleId: POSTED_SALE_ID },
  },
};

/** No money has moved yet. `financialState` is null because there is nothing to have a state about. */
export const saleDraft: SaleDto = {
  id: SALE_ID,
  workspaceId: WORKSPACE_ID,
  customerId: CUSTOMER_WITH_DEBT_ID,
  status: "draft",
  financialState: null,
  dueState: "no_due_date",
  currency: "VND",
  lines: [...saleLines],
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
  capabilities: draftCapabilities,
};

/**
 * Posted, with **no due date** — the ordinary depot sale (BR-SALE-017). Kept as
 * its own fixture because "posted" and "posted with a term" render differently and
 * the untermed one is the common case a screen must not decorate with a warning.
 */
export const salePosted: SaleDto = {
  ...saleDraft,
  id: POSTED_SALE_ID,
  status: "posted",
  financialState: "active",
  version: 2,
  postedAt: RECORDED_AT,
  capabilities: postedCapabilities,
};

/** A draft somebody entered and then thought better of. Kept, not deleted. */
export const saleDiscarded: SaleDto = {
  ...saleDraft,
  status: "discarded",
  financialState: null,
  version: 2,
  discardedAt: RECORDED_AT,
  capabilities: {
    post: { allowed: false, reasonCode: "SALE_ALREADY_DISCARDED", details: { saleId: SALE_ID } },
    void: { allowed: false, reasonCode: "SALE_NOT_POSTED", details: { saleId: SALE_ID } },
    edit: { allowed: false, reasonCode: "SALE_ALREADY_DISCARDED", details: { saleId: SALE_ID } },
    discard: { allowed: false, reasonCode: "SALE_ALREADY_DISCARDED", details: { saleId: SALE_ID } },
  },
};

/**
 * Voided, with the reason and the compensating amount.
 *
 * The sale row itself is untouched — `status` is still `posted`, because voiding
 * appends a record beside it rather than editing an immutable row (BR-SALE-013).
 * `financialState: "voided"` is **derived** from the presence of `voidRecord`.
 */
export const saleVoided: SaleDto = {
  ...salePosted,
  id: VOIDED_SALE_ID,
  financialState: "voided",
  capabilities: {
    ...postedCapabilities,
    void: {
      allowed: false,
      reasonCode: "SALE_ALREADY_VOIDED",
      details: { saleId: VOIDED_SALE_ID },
    },
  },
  voidRecord: {
    id: SALE_VOID_ID,
    saleId: VOIDED_SALE_ID,
    reasonCode: "wrong_amount",
    reason: "Ghi nhầm 2 thùng ớt, thực tế chỉ giao 1 thùng.",
    amount: SALE_TOTAL,
    transactionTime: TRANSACTION_TIME,
    recordedAt: RECORDED_AT,
  },
};

/** The correction: a new sale that names the one it replaces (BR-SALE-016). */
export const saleReplacement: SaleDto = {
  ...salePosted,
  id: REPLACEMENT_SALE_ID,
  totalAmount: vnd(625_000),
  lines: saleLines.slice(0, 2).concat([
    {
      lineId: SALE_LINE_3_ID,
      productId: PRODUCT_OT_ID,
      productName: "Ớt hiểm",
      quantity: { valueScaled: 1_000, unit: "thung" },
      unitPrice: vnd(250_000),
      lineTotal: vnd(250_000),
    },
  ]),
  replacesSaleId: VOIDED_SALE_ID,
};

export const saleOverdue: SaleDto = {
  ...salePosted,
  id: DUE_SALE_ID,
  dueState: "overdue",
  dueAt: DUE_AT,
};

export const saleDue: SaleDto = {
  ...salePosted,
  id: DUE_SALE_ID,
  dueState: "due",
  dueAt: AFTER_DUE_AT,
};

function summaryOf(sale: SaleDto, replacedBySaleId: SaleSummaryDto["replacedBySaleId"] = null) {
  return {
    id: sale.id,
    workspaceId: sale.workspaceId,
    customerId: sale.customerId,
    customerDisplayName: "Chị Lan — chợ Bình Điền",
    status: sale.status,
    financialState: sale.financialState,
    dueState: sale.dueState,
    totalAmount: sale.totalAmount,
    lineCount: sale.lines.length,
    version: sale.version,
    transactionTime: sale.transactionTime,
    recordedAt: sale.recordedAt,
    postedAt: sale.postedAt,
    discardedAt: sale.discardedAt,
    dueAt: sale.dueAt,
    replacesSaleId: sale.replacesSaleId,
    replacedBySaleId,
    capabilities: sale.capabilities,
  } satisfies SaleSummaryDto;
}

/** The void and its replacement, linked both ways so a reader can follow either end. */
export const saleSummaryVoided = summaryOf(saleVoided, REPLACEMENT_SALE_ID);
export const saleSummaryReplacement = summaryOf(saleReplacement);
export const saleSummaryPosted = summaryOf(salePosted);
export const saleSummaryDraft = summaryOf(saleDraft);
export const saleSummaryDiscarded = summaryOf(saleDiscarded);

export const salePage: readonly SaleSummaryDto[] = [
  saleSummaryReplacement,
  saleSummaryVoided,
  saleSummaryPosted,
  saleSummaryDraft,
  saleSummaryDiscarded,
];

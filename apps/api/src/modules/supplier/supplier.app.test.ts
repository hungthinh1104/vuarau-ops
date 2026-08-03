import { beforeEach, describe, expect, it } from "vitest";
import type {
  PurchaseId,
  PurchaseLineId,
  SupplierId,
  SupplierPaymentId,
} from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  LATEST_RECORDED_AT,
  LATEST_TRANSACTION_TIME,
  LATER_TRANSACTION_TIME,
  PRODUCT_CA_CHUA_ID,
  PRODUCT_RAU_MUONG_ID,
  RECORDED_AT,
  SALES_ACTOR_ID,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import type { PurchaseState } from "@vuarau/domain-kernel";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import {
  adjustSupplierAccount,
  createSupplier,
  deactivateSupplier,
  recordSupplierPayment,
  reverseSupplierPayment,
  updateSupplier,
} from "./supplier.handlers.ts";
import {
  getSupplierBalance,
  getSupplierPayment,
  getSupplierPriceHistory,
  getSupplierTimeline,
  searchSuppliers,
} from "./supplier.queries.ts";

let harness: Harness;
const supplierId = "00000000-0000-4000-8000-000000000801" as SupplierId;
const paymentId = "00000000-0000-4000-8000-000000000802" as SupplierPaymentId;
const envelope = (suffix: string, actorId = ACTOR_ID) => ({
  commandId: `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`,
  idempotencyKey: `supplier-${suffix}-key`,
  workspaceId: WORKSPACE_ID,
  actorId,
  occurredAt: LATER_TRANSACTION_TIME,
});

beforeEach(() => {
  harness = createHarness();
});

async function seedSupplier() {
  return createSupplier(harness.ctx, {
    ...envelope("801"),
    payload: {
      supplierId,
      displayName: "Vựa nguồn Ánh Dương",
      phone: "0909000111",
      note: "Giao sáng",
    },
  });
}

async function seedPurchase(input: {
  purchaseId: PurchaseId;
  lineId: PurchaseLineId;
  status: PurchaseState["status"];
  productId: PurchaseState["lines"][number]["productId"];
  productName: string;
  unitPriceMinor: number;
  transactionTime: PurchaseState["transactionTime"];
  recordedAt: PurchaseState["recordedAt"];
  confirmedAt: PurchaseState["confirmedAt"];
}) {
  await harness.db.unitOfWork().transaction(({ purchases }) =>
    purchases.insert({
      id: input.purchaseId,
      workspaceId: WORKSPACE_ID,
      supplierId,
      status: input.status,
      currency: "VND",
      lines: [
        {
          lineId: input.lineId,
          productId: input.productId,
          productName: input.productName,
          quantity: { valueScaled: 10, unit: "kg" },
          unitPrice: { amountMinor: input.unitPriceMinor, currency: "VND" },
          lineTotal: { amountMinor: input.unitPriceMinor * 10, currency: "VND" },
        },
      ],
      totalAmount: { amountMinor: input.unitPriceMinor * 10, currency: "VND" },
      note: null,
      evidenceReferences: [],
      dueAt: null,
      version: 1,
      transactionTime: input.transactionTime,
      recordedAt: input.recordedAt,
      confirmedAt: input.confirmedAt,
      discardedAt: null,
      replacesPurchaseId: null,
      voidRecord: null,
    }),
  );
}

describe("M16 Supplier Account", () => {
  it("returns only confirmed purchase-line price observations with stable scope and ordering", async () => {
    await seedSupplier();
    await seedPurchase({
      purchaseId: "00000000-0000-4000-8000-000000000810" as PurchaseId,
      lineId: "00000000-0000-4000-8000-000000000811" as PurchaseLineId,
      status: "draft",
      productId: PRODUCT_CA_CHUA_ID,
      productName: "Cà chua",
      unitPriceMinor: 11_000,
      transactionTime: LATEST_TRANSACTION_TIME,
      recordedAt: LATEST_RECORDED_AT,
      confirmedAt: null,
    });
    await seedPurchase({
      purchaseId: "00000000-0000-4000-8000-000000000812" as PurchaseId,
      lineId: "00000000-0000-4000-8000-000000000813" as PurchaseLineId,
      status: "confirmed",
      productId: PRODUCT_CA_CHUA_ID,
      productName: "Cà chua",
      unitPriceMinor: 12_000,
      transactionTime: LATER_TRANSACTION_TIME,
      recordedAt: LATER_TRANSACTION_TIME,
      confirmedAt: LATER_TRANSACTION_TIME,
    });
    await seedPurchase({
      purchaseId: "00000000-0000-4000-8000-000000000814" as PurchaseId,
      lineId: "00000000-0000-4000-8000-000000000815" as PurchaseLineId,
      status: "confirmed",
      productId: PRODUCT_RAU_MUONG_ID,
      productName: "Rau muống",
      unitPriceMinor: 8_000,
      transactionTime: RECORDED_AT,
      recordedAt: RECORDED_AT,
      confirmedAt: RECORDED_AT,
    });

    const page = await getSupplierPriceHistory(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      supplierId,
      productId: PRODUCT_CA_CHUA_ID,
      cursor: null,
      limit: 20,
    });
    expect(page.ok && page.value.items).toMatchObject([
      {
        purchaseId: "00000000-0000-4000-8000-000000000812",
        productId: PRODUCT_CA_CHUA_ID,
        unitPrice: { amountMinor: 12_000, currency: "VND" },
        confirmedAt: LATER_TRANSACTION_TIME,
      },
    ]);
    expect(page.ok && page.value.items).toHaveLength(1);
    expect(page.ok && page.value.nextCursor).toBeNull();
  });

  it("versions lifecycle changes and searches Vietnamese names without merging", async () => {
    expect((await seedSupplier()).ok).toBe(true);
    const search = await searchSuppliers(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      query: "Anh Duong",
      isActive: true,
      cursor: null,
      limit: 20,
    });
    expect(search.ok && search.value.items.map((item) => item.id)).toEqual([supplierId]);

    const updated = await updateSupplier(harness.ctx, {
      ...envelope("803"),
      expectedVersion: 1,
      payload: {
        supplierId,
        displayName: "Vựa nguồn Ánh Dương mới",
        phone: null,
        note: null,
      },
    });
    expect(updated.ok && updated.value.version).toBe(2);

    const stale = await deactivateSupplier(harness.ctx, {
      ...envelope("804"),
      expectedVersion: 1,
      payload: { supplierId, reason: "Ngưng mua" },
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe("SUPPLIER_VERSION_CONFLICT");
  });

  it("keeps payment, reversal, adjustment, and overpayment as exact ledger effects", async () => {
    await seedSupplier();
    await adjustSupplierAccount(harness.ctx, {
      ...envelope("805"),
      payload: {
        adjustmentId: "00000000-0000-4000-8000-000000000805",
        supplierId,
        amount: { amountMinor: 100_000, currency: "VND" },
        direction: "increase_payable",
        reasonCode: "opening_balance",
        reason: "Số dư đầu kỳ",
      },
    });
    const paid = await recordSupplierPayment(harness.ctx, {
      ...envelope("806"),
      payload: {
        supplierPaymentId: paymentId,
        supplierId,
        amount: { amountMinor: 150_000, currency: "VND" },
        method: "cash",
        note: null,
        evidenceReferences: ["receipt://supplier-payment/806", "photo://cash/806"],
      },
    });
    expect(paid.ok).toBe(true);

    const replay = await recordSupplierPayment(harness.ctx, {
      ...envelope("806"),
      payload: {
        supplierPaymentId: paymentId,
        supplierId,
        amount: { amountMinor: 150_000, currency: "VND" },
        method: "cash",
        note: null,
        evidenceReferences: ["receipt://supplier-payment/806", "photo://cash/806"],
      },
    });
    expect(replay.ok).toBe(true);

    const reversed = await reverseSupplierPayment(harness.ctx, {
      ...envelope("807"),
      expectedVersion: 1,
      payload: {
        reversalId: "00000000-0000-4000-8000-000000000807",
        supplierPaymentId: paymentId,
        amount: { amountMinor: 20_000, currency: "VND" },
        reason: "Trả nhầm phần tiền",
        evidenceReferences: ["receipt://supplier-reversal/807"],
      },
    });
    expect(reversed.ok).toBe(true);

    const detail = await getSupplierPayment(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      supplierPaymentId: paymentId,
    });
    expect(detail.ok && detail.value).toMatchObject({
      evidenceReferences: ["receipt://supplier-payment/806", "photo://cash/806"],
      reversals: [
        {
          evidenceReferences: ["receipt://supplier-reversal/807"],
        },
      ],
    });

    const balance = await getSupplierBalance(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      supplierId,
    });
    expect(balance.ok && balance.value).toMatchObject({
      balance: { amountMinor: -30_000, currency: "VND" },
      classification: "supplier_credit",
      entryCount: 3,
    });
    const timeline = await getSupplierTimeline(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      supplierId,
      cursor: null,
      limit: 20,
    });
    expect(timeline.ok && timeline.value.items).toHaveLength(3);
  });

  it("requires reasons and enforces conservative financial permissions", async () => {
    await seedSupplier();
    const blank = await adjustSupplierAccount(harness.ctx, {
      ...envelope("808"),
      payload: {
        adjustmentId: "00000000-0000-4000-8000-000000000808",
        supplierId,
        amount: { amountMinor: 1, currency: "VND" },
        direction: "increase_payable",
        reasonCode: "manual_adjustment",
        reason: "",
      },
    });
    expect(blank.ok).toBe(false);
    if (!blank.ok) expect(blank.error.code).toBe("SUPPLIER_ACCOUNT_ADJUSTMENT_REASON_REQUIRED");

    const denied = await recordSupplierPayment(harness.contextFor(SALES_ACTOR_ID), {
      ...envelope("809", SALES_ACTOR_ID),
      payload: {
        supplierPaymentId: paymentId,
        supplierId,
        amount: { amountMinor: 1, currency: "VND" },
        method: "cash",
        note: null,
      },
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe("PERMISSION_DENIED");
  });
});

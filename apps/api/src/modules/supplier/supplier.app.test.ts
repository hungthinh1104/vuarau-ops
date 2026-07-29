import { beforeEach, describe, expect, it } from "vitest";
import type { SupplierId, SupplierPaymentId } from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  LATER_TRANSACTION_TIME,
  SALES_ACTOR_ID,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import {
  adjustSupplierAccount,
  createSupplier,
  deactivateSupplier,
  recordSupplierPayment,
  reverseSupplierPayment,
  updateSupplier,
} from "./supplier.handlers.ts";
import { getSupplierBalance, getSupplierTimeline, searchSuppliers } from "./supplier.queries.ts";

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

describe("M16 Supplier Account", () => {
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
      },
    });
    expect(reversed.ok).toBe(true);

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

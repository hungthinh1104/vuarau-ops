import { describe, expect, it } from "vitest";
import {
  ACTOR_ID,
  COMMAND_ID,
  CUSTOMER_ID,
  IDEMPOTENCY_KEY,
  SALE_ID,
  postedSale,
  saleLineStates,
  SECOND_COMMAND_ID,
  OTHER_IDEMPOTENCY_KEY,
  TRANSACTION_TIME,
  WORKSPACE_ID,
  saleLineInputs,
} from "@vuarau/test-fixtures";
import type { SaleId } from "@vuarau/domain-contracts";
import { createHarness } from "../../testing/command-test-harness.ts";
import { createSaleDraft } from "./create-sale-draft.handler.ts";
import { postSale } from "./post-sale.handler.ts";
import { captureContext, getSaleDetail } from "./sale.queries.ts";

async function postedHarness() {
  const harness = createHarness();
  await createSaleDraft(harness.ctx, {
    commandId: COMMAND_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: TRANSACTION_TIME,
    payload: {
      saleId: SALE_ID,
      customerId: CUSTOMER_ID,
      currency: "VND",
      lines: saleLineInputs,
      note: null,
      dueAt: null,
      replacesSaleId: null,
    },
  });
  await postSale(harness.ctx, {
    commandId: SECOND_COMMAND_ID,
    idempotencyKey: OTHER_IDEMPOTENCY_KEY,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: TRANSACTION_TIME,
    expectedVersion: 1,
    payload: { saleId: SALE_ID },
  });
  return harness;
}

describe("BR-SALE-021 / BR-PRODUCT-005 / TC-SALE-029 / TC-PRODUCT-003 — customer-local historical recall", () => {
  it("returns an active posted line with its own customer's price and a price-free workspace hint", async () => {
    const harness = await postedHarness();
    const result = await captureContext(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      query: "",
      limit: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.customerHistory[0]?.productId).toBe(saleLineInputs[0]?.productId ?? null);
    expect(result.value.customerHistory[0]?.lastUnitPrice.amountMinor).toBe(
      saleLineInputs[0]?.unitPrice.amountMinor,
    );
    expect(result.value.workspaceHistory[0]?.productId).toBe(saleLineInputs[0]?.productId ?? null);
    expect(result.value.workspaceHistory[0]?.lastUnitPrice).toBeNull();
  });

  it("preserves the exact canonical Product id from the source Sale line", async () => {
    const harness = await postedHarness();
    const result = await captureContext(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      query: "Cà chua",
      limit: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const historyRow = result.value.customerHistory.find((row) => row.sourceSaleId === SALE_ID);
    expect(historyRow?.productId).toBe(saleLineInputs[0]!.productId);
  });

  it("keeps a genuinely legacy null Product id unresolved instead of guessing by name", async () => {
    const harness = createHarness();
    const legacySaleId = "00000000-0000-4000-8000-000000000799" as SaleId;
    harness.db.seedSale({
      ...postedSale,
      id: legacySaleId,
      lines: [{ ...saleLineStates[0]!, productId: null }],
    });

    const result = await captureContext(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      query: "Cà chua",
      limit: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const historyRow = result.value.customerHistory.find(
      (row) => row.sourceSaleId === legacySaleId,
    );
    expect(historyRow).toMatchObject({ productName: "Cà chua", productId: null });
  });
});

describe("BR-SALE-022 / TC-SALE-030 — sale detail is derived from the ledger", () => {
  it("returns the posted snapshot and its one server-calculated account effect", async () => {
    const harness = await postedHarness();
    const result = await getSaleDetail(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      saleId: SALE_ID,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sale.totalAmount.amountMinor).toBe(875_000);
    expect(result.value.accountEffect?.change.amountMinor).toBe(875_000);
    expect(result.value.accountEffect?.balanceAfter.amountMinor).toBe(875_000);
  });
});

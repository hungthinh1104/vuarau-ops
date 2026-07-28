import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTOR_ID,
  COMMAND_ID,
  IDEMPOTENCY_KEY,
  LATER_TRANSACTION_TIME,
  OTHER_WORKSPACE_ID,
  SALES_ACTOR_ID,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import type { ProductId } from "@vuarau/domain-contracts";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import {
  createProduct,
  deactivateProduct,
  reactivateProduct,
  updateProduct,
} from "./product.handlers.ts";
import { getProduct, searchProducts } from "./product.queries.ts";

const PRODUCT_ID = "00000000-0000-4000-8000-000000000701" as ProductId;
let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

const createInput = () => ({
  commandId: COMMAND_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: LATER_TRANSACTION_TIME,
  payload: {
    productId: PRODUCT_ID,
    displayName: "Cà chua Đà Lạt",
    aliases: ["ca chua", "tomato"],
    preferredUnit: "kg",
  },
});

describe("M15 Product catalog", () => {
  it("creates, finds by a diacritic-insensitive alias, and versions named updates", async () => {
    expect((await createProduct(harness.ctx, createInput())).ok).toBe(true);
    const searched = await searchProducts(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      query: "ca chua",
      isActive: true,
      cursor: null,
      limit: 20,
    });
    expect(searched.ok && searched.value.items.map((item) => item.id)).toContain(PRODUCT_ID);

    const updated = await updateProduct(harness.ctx, {
      ...createInput(),
      commandId: "00000000-0000-4000-8000-000000000702",
      idempotencyKey: "product-update-key-0001",
      expectedVersion: 1,
      payload: {
        productId: PRODUCT_ID,
        displayName: "Cà chua bi",
        aliases: ["cà bi"],
        preferredUnit: "thung",
      },
    });
    expect(updated.ok && updated.value).toMatchObject({
      displayName: "Cà chua bi",
      preferredUnit: "thung",
      version: 2,
    });
  });

  it("keeps workspace isolation and owner-only lifecycle authority", async () => {
    await createProduct(harness.ctx, createInput());
    const missing = await getProduct(harness.ctx, {
      workspaceId: OTHER_WORKSPACE_ID,
      productId: PRODUCT_ID,
    });
    expect(missing.ok).toBe(false);

    const denied = await deactivateProduct(harness.contextFor(SALES_ACTOR_ID), {
      ...createInput(),
      actorId: SALES_ACTOR_ID,
      commandId: "00000000-0000-4000-8000-000000000703",
      idempotencyKey: "product-deactivate-key",
      expectedVersion: 1,
      payload: { productId: PRODUCT_ID, reason: "Ngưng bán" },
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe("PERMISSION_DENIED");
  });

  it("rejects stale versions and preserves named deactivate/reactivate transitions", async () => {
    await createProduct(harness.ctx, createInput());
    const deactivated = await deactivateProduct(harness.ctx, {
      ...createInput(),
      commandId: "00000000-0000-4000-8000-000000000704",
      idempotencyKey: "product-deactivate-owner-key",
      expectedVersion: 1,
      payload: { productId: PRODUCT_ID, reason: "Hết mùa" },
    });
    expect(deactivated.ok && deactivated.value).toMatchObject({ isActive: false, version: 2 });

    const stale = await updateProduct(harness.ctx, {
      ...createInput(),
      commandId: "00000000-0000-4000-8000-000000000705",
      idempotencyKey: "product-update-stale-key",
      expectedVersion: 1,
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe("PRODUCT_VERSION_CONFLICT");

    const reactivated = await reactivateProduct(harness.ctx, {
      ...createInput(),
      commandId: "00000000-0000-4000-8000-000000000706",
      idempotencyKey: "product-reactivate-owner-key",
      expectedVersion: 2,
      payload: { productId: PRODUCT_ID, reason: "Có hàng lại" },
    });
    expect(reactivated.ok && reactivated.value).toMatchObject({ isActive: true, version: 3 });
  });

  it("surfaces duplicate names as separate candidates instead of merging identities", async () => {
    await createProduct(harness.ctx, createInput());
    const otherId = "00000000-0000-4000-8000-000000000707" as ProductId;
    await createProduct(harness.ctx, {
      ...createInput(),
      commandId: "00000000-0000-4000-8000-000000000708",
      idempotencyKey: "product-create-duplicate-name",
      payload: { ...createInput().payload, productId: otherId },
    });

    const searched = await searchProducts(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      query: "Cà chua Đà Lạt",
      isActive: true,
      cursor: null,
      limit: 20,
    });
    expect(searched.ok && searched.value.items.map((product) => product.id)).toEqual([
      PRODUCT_ID,
      otherId,
    ]);
  });
});

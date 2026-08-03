import { beforeEach, describe, expect, it } from "vitest";
import { saleIdSchema, saleLineIdSchema, type PriceRuleId } from "@vuarau/domain-contracts";
import {
  CUSTOMER_ID,
  ACTOR_ID,
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  SALES_ACTOR_ID,
  OTHER_WORKSPACE_ID,
  LATER_TRANSACTION_TIME,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { recordPriceRule } from "./pricing.handlers.ts";
import { listPriceRules, resolvePrice } from "./pricing.queries.ts";
import { createSaleDraft } from "../sale/create-sale-draft.handler.ts";
import { getSale } from "../sale/sale.queries.ts";
import { postSale } from "../sale/post-sale.handler.ts";

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

const input = (priceRuleId: PriceRuleId, overrides: Record<string, unknown> = {}) => ({
  commandId: crypto.randomUUID(),
  idempotencyKey: `pricing-${priceRuleId}-${crypto.randomUUID()}`,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: LATER_TRANSACTION_TIME,
  payload: {
    priceRuleId,
    productId: PRODUCT_CA_CHUA_ID,
    qualityGradeId: QUALITY_GRADE_1_ID,
    customerId: null,
    unit: "kg",
    kind: "list",
    priority: 0,
    minimumQuantityScaled: 0,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    baseUnitPrice: { amountMinor: 100_000, currency: "VND" },
    discountPerUnit: { amountMinor: 0, currency: "VND" },
    feePerUnit: { amountMinor: 0, currency: "VND" },
    reason: null,
    ...overrides,
  },
});

describe("pricing catalog application slice", () => {
  // TC-PRICING-001 / TC-PRICING-002 / TC-PRICING-003
  it("records an append-only rule, resolves it, and preserves the final snapshot", async () => {
    const priceRuleId = "00000000-0000-4000-8000-000000000901" as PriceRuleId;
    const created = await recordPriceRule(harness.ctx, input(priceRuleId));
    expect(created.ok && created.value).toMatchObject({
      id: priceRuleId,
      finalUnitPrice: { amountMinor: 100_000, currency: "VND" },
    });

    const resolved = await resolvePrice(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      productId: PRODUCT_CA_CHUA_ID,
      qualityGradeId: QUALITY_GRADE_1_ID,
      customerId: CUSTOMER_ID,
      unit: "kg",
      quantity: { valueScaled: 1_000, unit: "kg" },
      asOf: "2026-02-01T00:00:00.000Z",
    });
    expect(resolved.ok && resolved.value).toMatchObject({
      status: "selected",
      selected: { id: priceRuleId, finalUnitPrice: { amountMinor: 100_000 } },
    });

    const listed = await listPriceRules(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      productId: PRODUCT_CA_CHUA_ID,
      qualityGradeId: QUALITY_GRADE_1_ID,
      customerId: null,
      unit: "kg",
      cursor: null,
      limit: 20,
    });
    expect(listed.ok && listed.value.items.map((row) => row.id)).toEqual([priceRuleId]);
  });

  it("does not guess equal precedence and keeps customer rules explicit", async () => {
    const first = "00000000-0000-4000-8000-000000000902" as PriceRuleId;
    const second = "00000000-0000-4000-8000-000000000903" as PriceRuleId;
    await recordPriceRule(harness.ctx, input(first, { priority: 10 }));
    await recordPriceRule(harness.ctx, input(second, { priority: 10 }));

    const resolved = await resolvePrice(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      productId: PRODUCT_CA_CHUA_ID,
      qualityGradeId: QUALITY_GRADE_1_ID,
      customerId: null,
      unit: "kg",
      quantity: { valueScaled: 1_000, unit: "kg" },
      asOf: "2026-02-01T00:00:00.000Z",
    });
    expect(resolved.ok && resolved.value).toMatchObject({ status: "ambiguous", selected: null });
  });

  it("keeps a resolved rule's final agreed price in the posted Sale snapshot", async () => {
    const priceRuleId = "00000000-0000-4000-8000-000000000905" as PriceRuleId;
    const created = await recordPriceRule(
      harness.ctx,
      input(priceRuleId, { baseUnitPrice: { amountMinor: 120_000, currency: "VND" } }),
    );
    expect(created.ok).toBe(true);

    const resolved = await resolvePrice(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      productId: PRODUCT_CA_CHUA_ID,
      qualityGradeId: QUALITY_GRADE_1_ID,
      customerId: CUSTOMER_ID,
      unit: "kg",
      quantity: { valueScaled: 1_000, unit: "kg" },
      asOf: "2026-02-01T00:00:00.000Z",
    });
    expect(resolved.ok && resolved.value.status).toBe("selected");
    if (!resolved.ok || resolved.value.selected === null) return;

    const saleId = saleIdSchema.parse("00000000-0000-4000-8000-000000000951");
    const lineId = saleLineIdSchema.parse("00000000-0000-4000-8000-000000000952");
    const draft = await createSaleDraft(harness.ctx, {
      commandId: crypto.randomUUID(),
      idempotencyKey: "pricing-sale-snapshot-draft",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      occurredAt: LATER_TRANSACTION_TIME,
      payload: {
        saleId,
        customerId: CUSTOMER_ID,
        currency: "VND",
        lines: [
          {
            lineId,
            productId: PRODUCT_CA_CHUA_ID,
            productName: "Cà chua",
            qualityGradeId: QUALITY_GRADE_1_ID,
            qualityGradeName: "Loại 1",
            quantity: { valueScaled: 1_000, unit: "kg" },
            unitPrice: resolved.value.selected.finalUnitPrice,
          },
        ],
        note: null,
      },
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;

    const posted = await postSale(harness.ctx, {
      commandId: crypto.randomUUID(),
      idempotencyKey: "pricing-sale-snapshot-post",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      occurredAt: LATER_TRANSACTION_TIME,
      expectedVersion: draft.value.version,
      payload: { saleId },
    });
    expect(posted.ok).toBe(true);

    const read = await getSale(harness.ctx, { workspaceId: WORKSPACE_ID, saleId });
    expect(read.ok && read.value.status).toBe("posted");
    expect(read.ok && read.value.lines[0]?.unitPrice).toEqual(
      resolved.value.selected.finalUnitPrice,
    );
  });

  it("separates management from read access and scopes reads to the workspace", async () => {
    const denied = await recordPriceRule(harness.contextFor(SALES_ACTOR_ID), {
      ...input("00000000-0000-4000-8000-000000000904" as PriceRuleId),
      actorId: SALES_ACTOR_ID,
    });
    expect(denied).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });

    const foreign = await listPriceRules(harness.ctx, {
      workspaceId: OTHER_WORKSPACE_ID,
      productId: null,
      qualityGradeId: null,
      customerId: null,
      unit: null,
      cursor: null,
      limit: 20,
    });
    expect(foreign).toMatchObject({ ok: false, error: { code: "WORKSPACE_ACCESS_DENIED" } });
  });
});

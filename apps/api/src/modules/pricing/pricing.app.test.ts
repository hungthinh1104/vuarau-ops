import { beforeEach, describe, expect, it } from "vitest";
import type { PriceRuleId } from "@vuarau/domain-contracts";
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

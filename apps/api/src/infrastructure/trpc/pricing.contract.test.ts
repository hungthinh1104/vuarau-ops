import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTOR_ID,
  CUSTOMER_ID,
  LATER_TRANSACTION_TIME,
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import { priceResolutionDtoSchema, priceRuleDtoSchema } from "@vuarau/domain-contracts";
import { createHarness, principalFor, type Harness } from "../../testing/command-test-harness.ts";
import { createTrustedContext } from "./context.ts";
import { appRouter } from "./router.ts";

let harness: Harness;
let caller: ReturnType<typeof appRouter.createCaller>;

beforeEach(() => {
  harness = createHarness();
  caller = appRouter.createCaller(createTrustedContext(harness.deps, principalFor(ACTOR_ID)));
});

describe("pricing tRPC contract", () => {
  it("publishes a schema-valid rule and resolution result", async () => {
    const created = await caller.pricing.record({
      commandId: crypto.randomUUID(),
      idempotencyKey: "pricing-contract-record",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      occurredAt: LATER_TRANSACTION_TIME,
      payload: {
        priceRuleId: crypto.randomUUID(),
        productId: PRODUCT_CA_CHUA_ID,
        qualityGradeId: QUALITY_GRADE_1_ID,
        customerId: null,
        unit: "kg",
        kind: "list",
        priority: 1,
        minimumQuantityScaled: 0,
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveTo: null,
        baseUnitPrice: { amountMinor: 100_000, currency: "VND" },
        discountPerUnit: { amountMinor: 2_000, currency: "VND" },
        feePerUnit: { amountMinor: 500, currency: "VND" },
        reason: null,
      },
    });
    expect(priceRuleDtoSchema.safeParse(created).success).toBe(true);

    const resolved = await caller.pricing.resolve({
      workspaceId: WORKSPACE_ID,
      productId: PRODUCT_CA_CHUA_ID,
      qualityGradeId: QUALITY_GRADE_1_ID,
      customerId: CUSTOMER_ID,
      unit: "kg",
      quantity: { valueScaled: 1_000, unit: "kg" },
      asOf: "2026-02-01T00:00:00.000Z",
    });
    expect(priceResolutionDtoSchema.safeParse(resolved).success).toBe(true);
    expect(resolved.status).toBe("selected");
    expect(resolved.selected?.finalUnitPrice.amountMinor).toBe(98_500);
  });
});

import { describe, expect, it } from "vitest";
import {
  recordPriceRuleCommandSchema,
  resolvePriceInputSchema,
  type PriceRuleKind,
} from "@vuarau/domain-contracts";
import type { PriceRuleState } from "../shared/state.ts";
import { decideRecordPriceRule, resolvePriceRules } from "./index.ts";

const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const ACTOR_ID = "00000000-0000-4000-8000-000000000002";
const PRODUCT_ID = "00000000-0000-4000-8000-000000000003";
const CUSTOMER_ID = "00000000-0000-4000-8000-000000000004";
const RECORDED_AT = "2026-08-03T00:00:00.000Z";

function command(
  overrides: Partial<{
    priceRuleId: string;
    kind: PriceRuleKind;
    customerId: string | null;
    priority: number;
    minimumQuantityScaled: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    baseUnitPriceMinor: number;
    discountMinor: number;
    feeMinor: number;
    reason: string | null;
  }> = {},
) {
  return recordPriceRuleCommandSchema.parse({
    commandId: crypto.randomUUID(),
    idempotencyKey: `pricing-${crypto.randomUUID()}`,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: RECORDED_AT,
    payload: {
      priceRuleId: overrides.priceRuleId ?? crypto.randomUUID(),
      productId: PRODUCT_ID,
      qualityGradeId: null,
      customerId: overrides.customerId ?? null,
      unit: "kg",
      kind: overrides.kind ?? "list",
      priority: overrides.priority ?? 0,
      minimumQuantityScaled: overrides.minimumQuantityScaled ?? 0,
      effectiveFrom: overrides.effectiveFrom ?? "2026-08-01T00:00:00.000Z",
      effectiveTo: overrides.effectiveTo ?? null,
      baseUnitPrice: { amountMinor: overrides.baseUnitPriceMinor ?? 10_000, currency: "VND" },
      discountPerUnit: { amountMinor: overrides.discountMinor ?? 0, currency: "VND" },
      feePerUnit: { amountMinor: overrides.feeMinor ?? 0, currency: "VND" },
      reason: overrides.reason ?? null,
    },
  });
}

function resolveInput(overrides: Partial<{ customerId: string | null; quantityScaled: number }>) {
  return resolvePriceInputSchema.parse({
    workspaceId: WORKSPACE_ID,
    productId: PRODUCT_ID,
    qualityGradeId: null,
    customerId: overrides.customerId ?? null,
    unit: "kg",
    quantity: { valueScaled: overrides.quantityScaled ?? 1_000, unit: "kg" },
    asOf: "2026-08-03T00:00:00.000Z",
  });
}

function state(overrides: Parameters<typeof command>[0] = {}): PriceRuleState {
  const result = decideRecordPriceRule(command(overrides), RECORDED_AT);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("pricing rules", () => {
  it("calculates an exact final unit price from base, discount and fee", () => {
    const result = decideRecordPriceRule(
      command({
        baseUnitPriceMinor: 20_000,
        discountMinor: 1_500,
        feeMinor: 250,
        reason: "Giá khách quen",
      }),
      RECORDED_AT,
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        finalUnitPrice: { amountMinor: 18_750, currency: "VND" },
        actorId: ACTOR_ID,
        reason: "Giá khách quen",
      },
    });
  });

  it("refuses invalid scope, negative result and unexplained override", () => {
    expect(
      decideRecordPriceRule(command({ kind: "list", customerId: CUSTOMER_ID }), RECORDED_AT),
    ).toMatchObject({
      ok: false,
      error: { code: "PRICING_RULE_INVALID" },
    });
    expect(
      decideRecordPriceRule(command({ kind: "customer", customerId: null }), RECORDED_AT),
    ).toMatchObject({ ok: false, error: { code: "PRICING_RULE_INVALID" } });
    expect(
      decideRecordPriceRule(command({ kind: "override", reason: null }), RECORDED_AT),
    ).toMatchObject({ ok: false, error: { code: "PRICING_RULE_INVALID" } });
    expect(
      decideRecordPriceRule(command({ baseUnitPriceMinor: 100, discountMinor: 101 }), RECORDED_AT),
    ).toMatchObject({ ok: false, error: { code: "PRICING_RULE_INVALID" } });
  });

  it("selects the explicit highest-priority applicable rule", () => {
    const result = resolvePriceRules(
      [
        state({ baseUnitPriceMinor: 10_000 }),
        state({
          kind: "customer",
          customerId: CUSTOMER_ID,
          priority: 10,
          baseUnitPriceMinor: 9_000,
        }),
      ],
      resolveInput({ customerId: CUSTOMER_ID }),
    );

    expect(result.status).toBe("selected");
    expect(result.selected?.finalUnitPrice.amountMinor).toBe(9_000);
  });

  it("returns ambiguous instead of guessing equal precedence", () => {
    const result = resolvePriceRules(
      [
        state({ priceRuleId: "00000000-0000-4000-8000-000000000010" }),
        state({ priceRuleId: "00000000-0000-4000-8000-000000000011" }),
      ],
      resolveInput({}),
    );

    expect(result).toMatchObject({ status: "ambiguous", selected: null });
    expect(result.candidates).toHaveLength(2);
  });

  it("uses effective time and quantity threshold without unit conversion", () => {
    const result = resolvePriceRules(
      [
        state({ baseUnitPriceMinor: 10_000 }),
        state({ effectiveFrom: "2026-08-04T00:00:00.000Z", baseUnitPriceMinor: 8_000 }),
        state({ minimumQuantityScaled: 5_000, baseUnitPriceMinor: 7_000 }),
      ],
      resolveInput({ quantityScaled: 4_000 }),
    );

    expect(result.status).toBe("selected");
    expect(result.candidates.map((candidate) => candidate.finalUnitPrice.amountMinor)).toEqual([
      10_000,
    ]);

    expect(() => resolvePriceInputSchema.parse({
      ...resolveInput({}),
      quantity: { valueScaled: 1_000, unit: "gram" },
    })).toThrow();
  });
});

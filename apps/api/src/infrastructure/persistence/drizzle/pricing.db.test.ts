import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import { randomIdGenerator } from "../../clock.ts";
import { recordPriceRule } from "../../../modules/pricing/pricing.handlers.ts";
import { listPriceRules, resolvePrice } from "../../../modules/pricing/pricing.queries.ts";

describe.skipIf(skipWithoutDatabase())("pricing catalog against PostgreSQL", () => {
  // TC-PRICING-004
  let ctx: DbTestContext;
  let deps: CommandDeps;
  let owner: CommandContext;

  beforeAll(async () => {
    ctx = await createDbTestContext("pricing-catalog");
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => new Date().toISOString() as ReturnType<CommandDeps["clock"]["now"]> },
    };
    owner = { deps, principal: { actorId: ctx.actorId, subject: ctx.subject } };
  });

  afterAll(async () => {
    await ctx?.close();
  });

  const envelope = (key: string) => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: `${key}-${crypto.randomUUID()}`,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt: "2026-07-20T05:00:00.000+07:00",
  });

  it("persists and reads the same exact-integer rule, including workspace-scoped FKs", async () => {
    const priceRuleId = crypto.randomUUID();
    const created = await recordPriceRule(owner, {
      ...envelope("pricing-record"),
      payload: {
        priceRuleId,
        productId: ctx.productIds[0],
        qualityGradeId: ctx.qualityGradeId,
        customerId: ctx.customerId,
        unit: "kg",
        kind: "customer",
        priority: 20,
        minimumQuantityScaled: 10_000,
        effectiveFrom: "2026-07-01T00:00:00.000Z",
        effectiveTo: null,
        baseUnitPrice: { amountMinor: 125_000, currency: "VND" },
        discountPerUnit: { amountMinor: 5_000, currency: "VND" },
        feePerUnit: { amountMinor: 1_000, currency: "VND" },
        reason: "Giá khách hàng theo thỏa thuận",
      },
    });
    expect(created.ok && created.value).toMatchObject({
      id: priceRuleId,
      finalUnitPrice: { amountMinor: 121_000, currency: "VND" },
    });

    const resolved = await resolvePrice(owner, {
      workspaceId: ctx.workspaceId,
      productId: ctx.productIds[0],
      qualityGradeId: ctx.qualityGradeId,
      customerId: ctx.customerId,
      unit: "kg",
      quantity: { valueScaled: 12_000, unit: "kg" },
      asOf: "2026-07-20T00:00:00.000Z",
    });
    expect(resolved.ok && resolved.value).toMatchObject({
      status: "selected",
      selected: { id: priceRuleId, finalUnitPrice: { amountMinor: 121_000 } },
    });

    const listed = await listPriceRules(owner, {
      workspaceId: ctx.workspaceId,
      productId: ctx.productIds[0],
      qualityGradeId: ctx.qualityGradeId,
      customerId: ctx.customerId,
      unit: "kg",
      cursor: null,
      limit: 20,
    });
    expect(listed.ok && listed.value.items.map((row) => row.id)).toEqual([priceRuleId]);
    expect(await ctx.auditActions()).toContain("price_rule.recorded");
  });
});

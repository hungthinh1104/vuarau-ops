import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  customerAccountEntries,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import type { Cursor } from "@vuarau/domain-contracts";
import { randomIdGenerator } from "../../clock.ts";
import { getOperationalReport } from "../../../modules/report/report.queries.ts";

describe.skipIf(skipWithoutDatabase())("PostgreSQL report pagination hardening", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;

  beforeEach(async () => {
    ctx = await createDbTestContext(`m22-report-${crypto.randomUUID()}`);
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => "2026-07-29T12:00:00.000Z" as never },
    };
  });
  afterEach(async () => ctx.close());

  const context = (): CommandContext => ({
    deps,
    principal: { actorId: ctx.actorId, subject: ctx.subject },
  });

  it("uses the total order across pages without missing, duplicating, or crossing workspaces", async () => {
    const transactionTime = new Date("2026-07-28T01:00:00.000Z");
    const recordedAt = new Date("2026-07-29T01:00:00.000Z");
    const ids = Array.from({ length: 205 }, () => crypto.randomUUID());
    await ctx.database.db.insert(customerAccountEntries).values(
      ids.map((id) => ({
        id,
        workspaceId: ctx.workspaceId,
        customerId: ctx.customerId,
        amountMinor: 1,
        currency: "VND" as const,
        sourceType: "manual_adjustment" as const,
        sourceId: id,
        reversalOfEntryId: null,
        reasonCode: "opening_balance" as const,
        reason: "PostgreSQL pagination evidence",
        transactionTime,
        recordedAt,
        actorId: ctx.actorId,
        commandId: crypto.randomUUID(),
      })),
    );

    const seen: string[] = [];
    let cursor: Cursor | null = null;
    do {
      const page = await getOperationalReport(context(), {
        workspaceId: ctx.workspaceId,
        reportType: "customer_account_activity",
        businessDate: null,
        productId: null,
        unit: null,
        cursor,
        limit: 100,
      });
      expect(page.ok).toBe(true);
      if (!page.ok) return;
      seen.push(...page.value.page.items.map((item) => item.id));
      cursor = page.value.page.nextCursor;
    } while (cursor !== null);

    expect(seen).toHaveLength(205);
    expect(new Set(seen).size).toBe(205);
    expect(new Set(seen)).toEqual(new Set(ids));

    const foreign = await getOperationalReport(context(), {
      workspaceId: ctx.foreignWorkspaceId,
      reportType: "customer_account_activity",
      businessDate: null,
      productId: null,
      unit: null,
      cursor: null,
      limit: 100,
    });
    expect(foreign).toMatchObject({
      ok: false,
      error: { code: "WORKSPACE_ACCESS_DENIED" },
    });
  });
});

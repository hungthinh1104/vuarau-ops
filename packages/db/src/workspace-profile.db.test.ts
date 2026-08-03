import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  createDbTestContext,
  captureDatabaseError,
  skipWithoutDatabase,
  type DbTestContext,
} from "./index.ts";
import { workspaceOperationalProfiles } from "./schema/index.ts";

describe.skipIf(skipWithoutDatabase())("workspace operational profile constraints", () => {
  let ctx: DbTestContext;

  beforeEach(async () => {
    ctx = await createDbTestContext(`workspace-profile-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    await ctx.close();
  });

  it("provisions one full-depot default for every workspace", async () => {
    const rows = await ctx.database.db
      .select()
      .from(workspaceOperationalProfiles)
      .where(eq(workspaceOperationalProfiles.workspaceId, ctx.workspaceId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      purchasingMode: "purchase_receiving",
      inventoryMode: "movement_ledger",
      qualityGradeMode: "required",
      deliveryMode: "sale_fulfilment",
      businessDayStartMinute: 0,
      version: 1,
    });
  });

  it("rejects a workflow dependency violation below the application layer", async () => {
    const error = await captureDatabaseError(
      ctx.database.db.execute(sql`
        update workspace_operational_profiles
        set inventory_mode = 'disabled', delivery_mode = 'sale_fulfilment'
        where workspace_id = ${ctx.workspaceId}::uuid
      `),
    );
    expect(error).toContain("workspace_operational_profiles_dependencies_ck");
  });

  it("rejects an invalid business-day boundary below the application layer", async () => {
    const error = await captureDatabaseError(
      ctx.database.db.execute(sql`
        update workspace_operational_profiles
        set business_day_start_minute = 1440
        where workspace_id = ${ctx.workspaceId}::uuid
      `),
    );
    expect(error).toContain("workspace_operational_profiles_day_start_ck");
  });
});

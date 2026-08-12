import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type { IdempotencyKey } from "@vuarau/domain-contracts";
import type { CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";

describe.skipIf(skipWithoutDatabase())("PostgreSQL durable workspace feed", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;

  beforeEach(async () => {
    ctx = await createDbTestContext(`realtime-${crypto.randomUUID()}`);
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => "2026-08-10T17:00:00.000Z" as never },
    };
  });

  afterEach(async () => ctx.close());

  it("assigns a monotonic revision in the same completion transaction and drains it by cursor", async () => {
    const commandId = crypto.randomUUID();
    const idempotencyKey = `realtime-${commandId}` as IdempotencyKey;
    const completion = await deps.uow.transaction(async (repos) => {
      const claimed = await repos.receipts.claim({
        commandId: commandId as never,
        workspaceId: ctx.workspaceId,
        idempotencyKey,
        commandType: "PostSale",
        payloadHash: commandId,
        status: "in_progress",
        result: null,
        recordedAt: "2026-08-10T17:00:00.000Z" as never,
      });
      expect(claimed).toBe(true);
      return repos.receipts.complete(
        ctx.workspaceId,
        idempotencyKey,
        { saleId: commandId },
        {
          topics: ["dashboard", "sale"],
        },
      );
    });

    const page = await deps.uow.transaction((repos) =>
      repos.receipts.changesSince(ctx.workspaceId, "0", 200),
    );
    const foreign = await deps.uow.transaction((repos) =>
      repos.receipts.changesSince(ctx.foreignWorkspaceId, "0", 200),
    );

    expect(completion.revision).toBe("1");
    expect(page).toMatchObject({ nextRevision: "1" });
    expect(page.changes).toHaveLength(1);
    expect(page.changes[0]).toMatchObject({
      revision: "1",
      commandType: "PostSale",
      topics: ["dashboard", "sale"],
    });
    expect(foreign).toEqual({ changes: [], nextRevision: "0" });
  });
});

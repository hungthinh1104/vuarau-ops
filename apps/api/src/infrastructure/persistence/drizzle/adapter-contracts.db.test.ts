import { beforeAll, describe, it } from "vitest";
import type { CustomerId } from "@vuarau/domain-contracts";
import { customers } from "@vuarau/db/schema";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import { randomIdGenerator } from "../../clock.ts";
import { assertCustomerReadContract } from "../../../testing/adapter-contracts.ts";
import type { CommandDeps } from "../../../modules/shared/command-pipeline.ts";

describe.skipIf(skipWithoutDatabase())("PostgreSQL repository contract", () => {
  let ctx: DbTestContext;
  const secondCustomerId = crypto.randomUUID() as CustomerId;
  const foreignCustomerId = crypto.randomUUID() as CustomerId;

  beforeAll(async () => {
    ctx = await createDbTestContext("adapter-contracts");
    const now = new Date();
    await ctx.database.db.insert(customers).values([
      {
        id: secondCustomerId,
        workspaceId: ctx.workspaceId,
        displayName: "Khách thứ hai",
        phone: null,
        note: null,
        isActive: true,
        version: 1,
        transactionTime: now,
        recordedAt: now,
        updatedAt: now,
      },
      {
        id: foreignCustomerId,
        workspaceId: ctx.foreignWorkspaceId,
        displayName: "Khách ngoài vựa",
        phone: null,
        note: null,
        isActive: true,
        version: 1,
        transactionTime: now,
        recordedAt: now,
        updatedAt: now,
      },
    ]);
  });

  it("TC-ADAPTER-POSTGRES-001 applies the same paging and workspace contract", async () => {
    const uow = createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"];
    await uow.transaction(async (repositories) => {
      await assertCustomerReadContract({
        adapter: {
          search: repositories.customerReads.search,
          get: repositories.customerReads.get,
        },
        workspaceId: ctx.workspaceId,
        foreignWorkspaceId: ctx.foreignWorkspaceId,
        firstCustomerId: ctx.customerId,
        secondCustomerId,
        foreignCustomerId,
      });
    });
  });
});

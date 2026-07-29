import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { createCustomer } from "../../../modules/customer/create-customer.handler.ts";
import { createProduct } from "../../../modules/product/product.handlers.ts";
import { readCustomerCsv, readProductCsv } from "../../../operations/pilot-csv.ts";
import { randomIdGenerator } from "../../clock.ts";

describe.skipIf(skipWithoutDatabase())("M23 — canonical pilot imports against Postgres", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;

  beforeAll(async () => {
    ctx = await createDbTestContext("m23-pilot-import");
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => new Date().toISOString() as ReturnType<CommandDeps["clock"]["now"]> },
    };
  });

  afterAll(async () => {
    await ctx.close();
  });

  const context = (actorId = ctx.actorId): CommandContext => ({
    deps,
    principal: { actorId, subject: ctx.subjectOf(actorId) },
  });

  it("replays Customer and Product rows with exact command identity and one audit each", async () => {
    const customer = readCustomerCsv(
      "ten,dien_thoai\nKhách pilot thật,0901000000\n",
      ctx.workspaceId,
    ).rows[0]!;
    const product = readProductCsv("ten,ten_khac,don_vi\nCải pilot,cai pilot,kg\n", ctx.workspaceId)
      .rows[0]!;
    const customerCommand = {
      commandId: customer.commandId,
      idempotencyKey: customer.idempotencyKey,
      workspaceId: ctx.workspaceId,
      actorId: ctx.actorId,
      occurredAt: new Date().toISOString(),
      payload: {
        customerId: customer.customerId,
        displayName: customer.displayName,
        phone: customer.phone,
        note: customer.note,
      },
    };
    const productCommand = {
      commandId: product.commandId,
      idempotencyKey: product.idempotencyKey,
      workspaceId: ctx.workspaceId,
      actorId: ctx.actorId,
      occurredAt: new Date().toISOString(),
      payload: {
        productId: product.productId,
        displayName: product.displayName,
        aliases: [...product.aliases],
        preferredUnit: product.preferredUnit,
      },
    };

    expect((await createCustomer(context(), customerCommand)).ok).toBe(true);
    expect((await createProduct(context(), productCommand)).ok).toBe(true);
    expect((await createCustomer(context(), customerCommand)).ok).toBe(true);
    expect((await createProduct(context(), productCommand)).ok).toBe(true);

    const actions = await ctx.auditActions();
    expect(actions.filter((action) => action === "customer.created")).toHaveLength(1);
    expect(actions.filter((action) => action === "product.created")).toHaveLength(1);
    await deps.uow.transaction(async (repos) => {
      expect(await repos.customers.findById(ctx.workspaceId, customer.customerId)).not.toBeNull();
      expect(await repos.products.findById(ctx.workspaceId, product.productId)).not.toBeNull();
      expect(
        await repos.customers.findById(ctx.foreignWorkspaceId, customer.customerId),
      ).toBeNull();
      expect(await repos.products.findById(ctx.foreignWorkspaceId, product.productId)).toBeNull();
    });
  });

  it("keeps a partially invalid file as a dry-run result with no database effect", async () => {
    const before = await ctx.auditActions();
    const parsed = readProductCsv("ten,don_vi\nHợp lệ,kg\n,kg\nSai đơn vị,bao\n", ctx.workspaceId);
    expect(parsed.inputRows).toBe(parsed.rows.length + parsed.problems.length);
    expect(parsed).toMatchObject({ inputRows: 3 });
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.problems).toHaveLength(2);
    expect(await ctx.auditActions()).toEqual(before);
  });
});

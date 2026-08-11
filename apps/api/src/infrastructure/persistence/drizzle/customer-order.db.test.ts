import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import type { CustomerOrderId } from "@vuarau/domain-contracts";
import { randomIdGenerator } from "../../clock.ts";
import {
  cancelCustomerOrder,
  confirmCustomerOrder,
  createCustomerOrderDraft,
  updateCustomerOrderDraft,
} from "../../../modules/customer-order/customer-order.handlers.ts";
import {
  getCustomerOrder,
  listCustomerOrders,
} from "../../../modules/customer-order/customer-order.queries.ts";

describe.skipIf(skipWithoutDatabase())("Customer Order against PostgreSQL", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;
  let owner: CommandContext;
  let orderId: CustomerOrderId;
  let recordedAt = "2026-07-23T02:00:00.000Z";

  beforeAll(async () => {
    ctx = await createDbTestContext("customer-order");
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => recordedAt as ReturnType<CommandDeps["clock"]["now"]> },
    };
    owner = { deps, principal: { actorId: ctx.actorId, subject: ctx.subject } };
    orderId = crypto.randomUUID() as CustomerOrderId;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  const envelope = (key: string) => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: key,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt: "2026-07-20T05:00:00.000Z",
  });

  it("BR-CUSTOMER-ORDER-005 / TC-CUSTOMER-ORDER-006 — persists, retries and reads one order", async () => {
    const create = {
      ...envelope("customer-order-create"),
      payload: {
        customerOrderId: orderId,
        customerId: ctx.customerId,
        channel: "account_customer" as const,
        currency: "VND" as const,
        lines: [
          {
            lineId: crypto.randomUUID(),
            productId: ctx.productIds[0],
            productName: "Cà chua",
            quantity: { valueScaled: 12_500, unit: "kg" as const },
            agreedUnitPrice: { amountMinor: 18_000, currency: "VND" as const },
          },
        ],
        note: null,
        paymentTermsSnapshot: { label: "Net 7", dueAt: "2026-07-27T05:00:00.000Z" },
        evidenceReferences: ["paper://order/001"],
        replacesCustomerOrderId: null,
      },
    };
    const created = await createCustomerOrderDraft(owner, create);
    const retried = await createCustomerOrderDraft(owner, create);
    expect(created.ok).toBe(true);
    expect(retried).toEqual(created);
    expect(await ctx.accountEntryRows()).toHaveLength(0);

    const confirmed = await confirmCustomerOrder(owner, {
      ...envelope("customer-order-confirm"),
      expectedVersion: 1,
      payload: { customerOrderId: orderId },
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.value.totalAmount).toEqual({ amountMinor: 225_000, currency: "VND" });
    expect(confirmed.value.paymentTermsSnapshot?.label).toBe("Net 7");
    expect(await ctx.accountEntryRows()).toHaveLength(0);

    const detail = await getCustomerOrder(owner, {
      workspaceId: ctx.workspaceId,
      customerOrderId: orderId,
    });
    expect(detail.ok).toBe(true);
    if (!detail.ok || detail.value === null) throw new Error("customer order was not found");
    expect(detail.value.status).toBe("confirmed");
    const page = await listCustomerOrders(owner, {
      workspaceId: ctx.workspaceId,
      customerId: ctx.customerId,
      status: "confirmed",
      query: "",
      cursor: null,
      limit: 10,
    });
    expect(page.ok && page.value.items.map((item) => item.id)).toContain(orderId);
  });

  it("keeps cancellation as a commercial state and protects the workspace boundary", async () => {
    const cancelledId = crypto.randomUUID() as CustomerOrderId;
    const created = await createCustomerOrderDraft(owner, {
      ...envelope("customer-order-cancel-create"),
      payload: {
        customerOrderId: cancelledId,
        customerId: null,
        channel: "walk_in" as const,
        currency: "VND" as const,
        lines: [],
        note: null,
        paymentTermsSnapshot: null,
        evidenceReferences: [],
        replacesCustomerOrderId: null,
      },
    });
    expect(created.ok).toBe(true);
    const cancelled = await cancelCustomerOrder(owner, {
      ...envelope("customer-order-cancel"),
      expectedVersion: 1,
      payload: { customerOrderId: cancelledId, reason: "Khách đổi lịch" },
    });
    expect(cancelled.ok && cancelled.value.status).toBe("cancelled");
    expect(await ctx.accountEntryRows()).toHaveLength(0);

    const foreignRead = await getCustomerOrder(owner, {
      workspaceId: ctx.foreignWorkspaceId,
      customerOrderId: cancelledId,
    });
    expect(foreignRead.ok).toBe(false);
    if (!foreignRead.ok) expect(foreignRead.error.code).toBe("WORKSPACE_ACCESS_DENIED");
  });

  it("persists input line order and the server recordedAt on draft updates", async () => {
    const persistedOrderId = crypto.randomUUID() as CustomerOrderId;
    const createPayload = {
      customerOrderId: persistedOrderId,
      customerId: ctx.customerId,
      channel: "account_customer" as const,
      currency: "VND" as const,
      lines: [
        {
          lineId: crypto.randomUUID(),
          productId: ctx.productIds[1],
          productName: "Rau muống",
          quantity: { valueScaled: 2_000, unit: "bo" as const },
          agreedUnitPrice: { amountMinor: 5_000, currency: "VND" as const },
        },
        {
          lineId: crypto.randomUUID(),
          productId: ctx.productIds[0],
          productName: "Cà chua",
          quantity: { valueScaled: 1_000, unit: "kg" as const },
          agreedUnitPrice: { amountMinor: 18_000, currency: "VND" as const },
        },
      ],
      note: null,
      paymentTermsSnapshot: null,
      evidenceReferences: [],
      replacesCustomerOrderId: null,
    };
    recordedAt = "2026-07-23T02:00:00.000Z";
    expect(
      await createCustomerOrderDraft(owner, {
        ...envelope("customer-order-position-create"),
        payload: createPayload,
      }),
    ).toMatchObject({ ok: true });

    recordedAt = "2026-07-23T03:00:00.000Z";
    expect(
      await updateCustomerOrderDraft(owner, {
        ...envelope("customer-order-position-update"),
        expectedVersion: 1,
        payload: createPayload,
      }),
    ).toMatchObject({ ok: true });

    const detail = await getCustomerOrder(owner, {
      workspaceId: ctx.workspaceId,
      customerOrderId: persistedOrderId,
    });
    expect(detail.ok).toBe(true);
    if (!detail.ok || detail.value === null) return;
    expect(detail.value.lines.map((line) => line.productName)).toEqual(["Rau muống", "Cà chua"]);
    expect(detail.value.recordedAt).toBe("2026-07-23T03:00:00.000Z");
  });
});

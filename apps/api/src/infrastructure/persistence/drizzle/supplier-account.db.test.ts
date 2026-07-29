import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type { SupplierId, SupplierPaymentId } from "@vuarau/domain-contracts";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import {
  adjustSupplierAccount,
  createSupplier,
  recordSupplierPayment,
  reverseSupplierPayment,
} from "../../../modules/supplier/supplier.handlers.ts";
import {
  getSupplierBalance,
  getSupplierTimeline,
} from "../../../modules/supplier/supplier.queries.ts";

describe.skipIf(skipWithoutDatabase())("M16 Supplier Account against Postgres", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;
  const supplierId = crypto.randomUUID() as SupplierId;
  const paymentId = crypto.randomUUID() as SupplierPaymentId;
  const context = (): CommandContext => ({
    deps,
    principal: { actorId: ctx.actorId, subject: ctx.subject },
  });
  const command = (key: string) => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: `${key}-${crypto.randomUUID()}`,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt: new Date().toISOString(),
  });

  beforeAll(async () => {
    ctx = await createDbTestContext("supplier-account");
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => new Date().toISOString() as ReturnType<CommandDeps["clock"]["now"]> },
    };
    expect(
      (
        await createSupplier(context(), {
          ...command("supplier-create"),
          payload: {
            supplierId,
            displayName: "Vựa nguồn A",
            phone: null,
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it("persists exact signed effects and replays without duplicate sources", async () => {
    const opening = {
      ...command("supplier-opening"),
      payload: {
        adjustmentId: crypto.randomUUID(),
        supplierId,
        amount: { amountMinor: 500_000, currency: "VND" as const },
        direction: "increase_payable" as const,
        reasonCode: "opening_balance" as const,
        reason: "Số dư đầu kỳ",
      },
    };
    expect((await adjustSupplierAccount(context(), opening)).ok).toBe(true);
    expect((await adjustSupplierAccount(context(), opening)).ok).toBe(true);

    const payment = {
      ...command("supplier-payment"),
      payload: {
        supplierPaymentId: paymentId,
        supplierId,
        amount: { amountMinor: 600_000, currency: "VND" as const },
        method: "bank_transfer" as const,
        note: null,
      },
    };
    expect((await recordSupplierPayment(context(), payment)).ok).toBe(true);
    expect((await recordSupplierPayment(context(), payment)).ok).toBe(true);

    expect(
      (
        await reverseSupplierPayment(context(), {
          ...command("supplier-payment-reverse"),
          expectedVersion: 1,
          payload: {
            reversalId: crypto.randomUUID(),
            supplierPaymentId: paymentId,
            amount: { amountMinor: 50_000, currency: "VND" },
            reason: "Hoàn lại phần chuyển thừa",
          },
        })
      ).ok,
    ).toBe(true);

    const balance = await getSupplierBalance(context(), {
      workspaceId: ctx.workspaceId,
      supplierId,
    });
    expect(balance.ok && balance.value).toMatchObject({
      balance: { amountMinor: -50_000, currency: "VND" },
      classification: "supplier_credit",
      entryCount: 3,
    });

    const rows = await ctx.database.sql<
      readonly { amount_minor: number }[]
    >`select amount_minor::int from supplier_account_entries
      where workspace_id = ${ctx.workspaceId}::uuid
        and supplier_id = ${supplierId}::uuid`;
    expect(rows).toHaveLength(3);
    expect(rows.reduce((sum, row) => sum + row.amount_minor, 0)).toBe(-50_000);

    const timeline = await getSupplierTimeline(context(), {
      workspaceId: ctx.workspaceId,
      supplierId,
      cursor: null,
      limit: 2,
    });
    expect(timeline.ok && timeline.value.items).toHaveLength(2);
    expect(timeline.ok && timeline.value.nextCursor).not.toBeNull();
  });

  it("does not leak a supplier across workspaces", async () => {
    const denied = await getSupplierBalance(context(), {
      workspaceId: ctx.foreignWorkspaceId,
      supplierId,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe("WORKSPACE_ACCESS_DENIED");
  });

  it("paginates equal business and recorded times without skipping or duplicating entries", async () => {
    const sameTimeSupplier = crypto.randomUUID() as SupplierId;
    expect(
      (
        await createSupplier(context(), {
          ...command("same-time-supplier"),
          payload: {
            supplierId: sameTimeSupplier,
            displayName: "Nhà cung cấp cùng thời điểm",
            phone: null,
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
    const ids = Array.from({ length: 3 }, () => crypto.randomUUID());
    const at = "2026-07-29T03:00:00.000Z";
    for (const [index, id] of ids.entries()) {
      const commandId = crypto.randomUUID();
      await ctx.database.sql`
        insert into command_receipts
          (command_id, workspace_id, idempotency_key, command_type, payload_hash, status,
           result, recorded_at)
        values (
          ${commandId}::uuid, ${ctx.workspaceId}::uuid, ${`supplier-order-${index}`},
          'TestSupplierOrder', ${`hash-${index}`}, 'completed', '{}'::jsonb, ${at}::timestamptz
        )
      `;
      await ctx.database.sql`
        insert into supplier_account_entries
          (id, workspace_id, supplier_id, amount_minor, currency, source_type,
           source_id, reason_code, reason, transaction_time, recorded_at, actor_id, command_id)
        values (
          ${id}::uuid, ${ctx.workspaceId}::uuid, ${sameTimeSupplier}::uuid,
          ${index + 1}, 'VND', 'manual_adjustment', ${crypto.randomUUID()}::uuid,
          'manual_adjustment', 'Cùng timestamp', ${at}::timestamptz, ${at}::timestamptz,
          ${ctx.actorId}::uuid, ${commandId}::uuid
        )
      `;
    }
    const first = await getSupplierTimeline(context(), {
      workspaceId: ctx.workspaceId,
      supplierId: sameTimeSupplier,
      cursor: null,
      limit: 2,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await getSupplierTimeline(context(), {
      workspaceId: ctx.workspaceId,
      supplierId: sameTimeSupplier,
      cursor: first.value.nextCursor,
      limit: 2,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const seen = [...first.value.items, ...second.value.items].map((entry) => entry.id);
    expect(seen).toEqual([...ids].sort().reverse());
    expect(new Set(seen).size).toBe(3);
  });
});

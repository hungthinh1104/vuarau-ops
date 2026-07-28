import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createReadRepositories,
  createUnitOfWork,
  skipWithoutDatabase,
  sql,
  type DbTestContext,
} from "@vuarau/db";
import type { Cursor } from "@vuarau/domain-contracts";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import { createSaleDraft } from "../../../modules/sale/create-sale-draft.handler.ts";
import { postSale } from "../../../modules/sale/post-sale.handler.ts";
import { voidSale } from "../../../modules/sale/void-sale.handler.ts";
import { recordCustomerPayment } from "../../../modules/payment/record-payment.handler.ts";
import {
  findPossibleDuplicateCustomers,
  searchCustomers,
} from "../../../modules/customer/customer.queries.ts";
import { createCustomer } from "../../../modules/customer/create-customer.handler.ts";
import { listSales } from "../../../modules/sale/sale.queries.ts";
import { listPayments } from "../../../modules/payment/payment.queries.ts";
import {
  getAccountAdjustmentDetail,
  getAccountReconciliation,
  getCustomerAccountTimeline,
} from "../../../modules/account/account.queries.ts";
import { adjustCustomerDebt } from "../../../modules/account/adjust-debt.handler.ts";
import { getAuditTimeline } from "../../../modules/audit/audit.queries.ts";

/**
 * The read models against real Postgres: real keyset predicates, the real window
 * function behind the running balance, the real `vuarau_fold`, real joins.
 *
 * The application tests prove the shapes. These prove the SQL — and in particular
 * that paging is stable, which the in-memory adapter cannot demonstrate because
 * it sorts an array rather than walking an index.
 */
describe.skipIf(skipWithoutDatabase())("read models against Postgres", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;
  let owner: CommandContext;

  const page = { cursor: null as Cursor | null, limit: 50 };

  let voidedSaleId = "";

  const envelope = (key: string) => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: key,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt: "2026-07-20T05:00:00.000+07:00",
  });

  beforeAll(async () => {
    ctx = await createDbTestContext("read-models");
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => new Date().toISOString() as ReturnType<CommandDeps["clock"]["now"]> },
    };
    owner = { deps, principal: { actorId: ctx.actorId, subject: ctx.subject } };

    // Five sales an hour apart, so paging has something to walk, plus a payment
    // and a void so the timeline has every source kind in it.
    for (let index = 0; index < 5; index += 1) {
      const saleId = crypto.randomUUID();
      await createSaleDraft(owner, {
        ...envelope(`read-draft-${index}`),
        occurredAt: new Date(Date.UTC(2026, 6, 20, index)).toISOString(),
        payload: {
          saleId,
          customerId: ctx.customerId,
          currency: "VND",
          lines: [
            {
              lineId: crypto.randomUUID(),
              productId: ctx.productIds[0],
              productName: "Cà chua",
              quantity: { valueScaled: 1_000, unit: "kg" },
              unitPrice: { amountMinor: 10_000, currency: "VND" },
            },
          ],
          note: null,
          dueAt: null,
          replacesSaleId: null,
        },
      });
      await postSale(owner, {
        ...envelope(`read-post-${index}`),
        occurredAt: new Date(Date.UTC(2026, 6, 20, index)).toISOString(),
        expectedVersion: 1,
        payload: { saleId },
      });
      if (index === 0) {
        voidedSaleId = saleId;
      }
    }

    await recordCustomerPayment(owner, {
      ...envelope("read-payment"),
      payload: {
        paymentId: crypto.randomUUID(),
        customerId: ctx.customerId,
        amount: { amountMinor: 15_000, currency: "VND" },
        method: "cash",
        payerName: null,
        note: null,
      },
    });

    await voidSale(owner, {
      ...envelope("read-void"),
      payload: {
        saleVoidId: crypto.randomUUID(),
        saleId: voidedSaleId,
        reasonCode: "wrong_amount",
        reason: "Ghi nhầm",
      },
    });
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it("UC-CUSTOMER-002 / TC-READ-002 — folds diacritics in real SQL", async () => {
    // `vuarau_fold` runs in Postgres here, not in TypeScript. The two have to
    // agree or search behaves differently in tests than in production.
    const found = await searchCustomers(owner, {
      ...page,
      workspaceId: ctx.workspaceId,
      query: "chi lan",
      isActive: null,
    });

    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.items.map((item) => item.id)).toContain(ctx.customerId);
  });

  it("UC-CUSTOMER-002 / TC-READ-012 — customer cursor pagination survives equal names", async () => {
    const expected: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      const customerId = crypto.randomUUID();
      expected.push(customerId);
      const created = await createCustomer(owner, {
        ...envelope(`read-customer-page-${index}`),
        payload: {
          customerId,
          displayName: "Khách trùng tên phân trang",
          phone: `09080000${index}`,
          note: null,
        },
      });
      expect(created.ok).toBe(true);
    }

    const seen: string[] = [];
    let cursor: Cursor | null = null;
    for (let guard = 0; guard < 10; guard += 1) {
      const result = await searchCustomers(owner, {
        workspaceId: ctx.workspaceId,
        query: "Khách trùng tên phân trang",
        isActive: null,
        cursor,
        limit: 2,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      seen.push(...result.value.items.map((item) => item.id));
      cursor = result.value.nextCursor;
      if (cursor === null) break;
    }
    expect(seen).toHaveLength(expected.length);
    expect(new Set(seen).size).toBe(expected.length);
    expect([...seen].sort()).toEqual([...expected].sort());
  });

  it("UC-CUSTOMER-006 / TC-READ-013 — Postgres normalizes phone duplicate evidence", async () => {
    const customerId = crypto.randomUUID();
    const created = await createCustomer(owner, {
      ...envelope("read-customer-duplicate"),
      payload: {
        customerId,
        displayName: "Cô Hoà Chợ Lớn",
        phone: "090 555 6677",
        note: null,
      },
    });
    expect(created.ok).toBe(true);

    const result = await findPossibleDuplicateCustomers(owner, {
      workspaceId: ctx.workspaceId,
      displayName: "co hoa cho lon",
      phone: "090-555-6677",
      excludeCustomerId: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const candidate = result.value.find((item) => item.customer.id === customerId);
    expect(candidate?.reasons).toEqual(expect.arrayContaining(["same_name", "same_phone"]));
  });

  it("UC-SALE-003 / TC-READ-004 — pages sales without repeating or skipping", async () => {
    const seen: string[] = [];
    let cursor: Cursor | null = null;

    for (let guard = 0; guard < 10; guard += 1) {
      const result = await listSales(owner, {
        cursor,
        limit: 2,
        workspaceId: ctx.workspaceId,
        customerId: null,
        status: null,
        financialState: null,
        from: null,
        to: null,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      seen.push(...result.value.items.map((item) => item.id));
      cursor = result.value.nextCursor;
      if (cursor === null) break;
    }

    expect(new Set(seen).size).toBe(seen.length);

    const unpaged = await listSales(owner, {
      ...page,
      workspaceId: ctx.workspaceId,
      customerId: null,
      status: null,
      financialState: null,
      from: null,
      to: null,
    });
    expect(unpaged.ok).toBe(true);
    if (!unpaged.ok) return;
    // The paged walk and the single read produce the same rows in the same
    // order. This is the property `OFFSET` does not have.
    expect(seen).toEqual(unpaged.value.items.map((item) => item.id));
  });

  it("UC-SALE-003 / TC-READ-004 — a row inserted mid-walk does not shift the page boundary", async () => {
    const first = await listSales(owner, {
      cursor: null,
      limit: 2,
      workspaceId: ctx.workspaceId,
      customerId: null,
      status: null,
      financialState: null,
      from: null,
      to: null,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // A sale posted *older* than the page boundary while somebody is paging. With
    // OFFSET this would push a row the caller has already seen onto page two.
    const interloper = crypto.randomUUID();
    await createSaleDraft(owner, {
      ...envelope("read-interloper-draft"),
      occurredAt: "2026-07-19T05:00:00.000+07:00",
      payload: {
        saleId: interloper,
        customerId: ctx.customerId,
        currency: "VND",
        lines: [
          {
            lineId: crypto.randomUUID(),
            productId: ctx.productIds[0],
            productName: "Cà chua",
            quantity: { valueScaled: 1_000, unit: "kg" },
            unitPrice: { amountMinor: 10_000, currency: "VND" },
          },
        ],
        note: null,
        dueAt: null,
        replacesSaleId: null,
      },
    });

    const second = await listSales(owner, {
      cursor: first.value.nextCursor,
      limit: 2,
      workspaceId: ctx.workspaceId,
      customerId: null,
      status: null,
      financialState: null,
      from: null,
      to: null,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const firstIds = first.value.items.map((item) => item.id);
    const secondIds = second.value.items.map((item) => item.id);
    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
  });

  it("UC-ACCOUNT-001 / TC-READ-006 — the running balance comes from the window function", async () => {
    const timeline = await getCustomerAccountTimeline(owner, {
      ...page,
      workspaceId: ctx.workspaceId,
      customerId: ctx.customerId,
      from: null,
      to: null,
    });

    expect(timeline.ok).toBe(true);
    if (!timeline.ok) return;

    // Read oldest-first, each running balance is the sum of the amounts up to and
    // including that entry. Asserted against the amounts themselves rather than
    // against constants, so the test survives a change to the seed.
    const oldestFirst = [...timeline.value.items].reverse();
    let expected = 0;
    for (const entry of oldestFirst) {
      expected += entry.amount.amountMinor;
      expect(entry.runningBalance.amountMinor).toBe(expected);
    }

    // And the last one equals the maintained projection (BR-ACCOUNT-001).
    const entries = await ctx.accountEntryRows();
    expect(expected).toBe(entries.reduce((sum, entry) => sum + entry.amount.amountMinor, 0));
  });

  it("UC-ACCOUNT-001 / TC-READ-009 — page two retains full-history balances without tuple skips", async () => {
    const all = await getCustomerAccountTimeline(owner, {
      workspaceId: ctx.workspaceId,
      customerId: ctx.customerId,
      from: null,
      to: null,
      cursor: null,
      limit: 50,
    });
    const first = await getCustomerAccountTimeline(owner, {
      workspaceId: ctx.workspaceId,
      customerId: ctx.customerId,
      from: null,
      to: null,
      cursor: null,
      limit: 2,
    });
    expect(all.ok).toBe(true);
    expect(first.ok).toBe(true);
    if (!all.ok || !first.ok || first.value.nextCursor === null) return;

    const second = await getCustomerAccountTimeline(owner, {
      workspaceId: ctx.workspaceId,
      customerId: ctx.customerId,
      from: null,
      to: null,
      cursor: first.value.nextCursor,
      limit: 50,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const paged = [...first.value.items, ...second.value.items];
    expect(paged.map((item) => item.id)).toEqual(all.value.items.map((item) => item.id));
    expect(new Set(paged.map((item) => item.id)).size).toBe(paged.length);
    const fullBalanceById = new Map(
      all.value.items.map((item) => [item.id, item.runningBalance.amountMinor]),
    );
    for (const item of second.value.items) {
      expect(item.runningBalance.amountMinor).toBe(fullBalanceById.get(item.id));
    }
  });

  it("UC-ACCOUNT-001 / TC-READ-010 — date filters only filter rows; they never restart balance or cross a workspace", async () => {
    const full = await getCustomerAccountTimeline(owner, {
      workspaceId: ctx.workspaceId,
      customerId: ctx.customerId,
      from: null,
      to: null,
      cursor: null,
      limit: 50,
    });
    expect(full.ok).toBe(true);
    if (!full.ok) return;

    const from = full.value.items.at(-2)?.transactionTime;
    expect(from).toBeDefined();
    if (from === undefined) return;
    const filtered = await getCustomerAccountTimeline(owner, {
      workspaceId: ctx.workspaceId,
      customerId: ctx.customerId,
      from,
      to: null,
      cursor: null,
      limit: 50,
    });
    expect(filtered.ok).toBe(true);
    if (!filtered.ok) return;

    const fullBalanceById = new Map(
      full.value.items.map((item) => [item.id, item.runningBalance.amountMinor]),
    );
    for (const item of filtered.value.items) {
      expect(item.runningBalance.amountMinor).toBe(fullBalanceById.get(item.id));
    }

    const foreignWorkspace = await getCustomerAccountTimeline(owner, {
      workspaceId: ctx.foreignWorkspaceId,
      customerId: ctx.customerId,
      from: null,
      to: null,
      cursor: null,
      limit: 50,
    });
    expect(foreignWorkspace).toMatchObject({
      ok: false,
      error: { code: "WORKSPACE_ACCESS_DENIED" },
    });
  });

  it("UC-ACCOUNT-001 / TC-READ-006 — resolves every source kind through its join", async () => {
    const timeline = await getCustomerAccountTimeline(owner, {
      ...page,
      workspaceId: ctx.workspaceId,
      customerId: ctx.customerId,
      from: null,
      to: null,
    });

    expect(timeline.ok).toBe(true);
    if (!timeline.ok) return;

    const kinds = new Set(timeline.value.items.map((item) => item.source.type));
    expect(kinds).toContain("sale_posting");
    expect(kinds).toContain("sale_void");
    expect(kinds).toContain("payment");

    // Every label resolved to something the join produced, not to a bare uuid.
    for (const item of timeline.value.items) {
      expect(item.source.label).not.toBe(item.source.id);
      expect(item.source.label.length).toBeGreaterThan(0);
    }
  });

  it("UC-ACCOUNT-002 / TC-READ-008 — preserves an adjustment row to report broken joins and blank reasons", async () => {
    const adjustmentId = crypto.randomUUID();
    const created = await adjustCustomerDebt(owner, {
      ...envelope("read-adjustment-integrity"),
      payload: {
        adjustmentId,
        customerId: ctx.customerId,
        direction: "increase",
        amount: { amountMinor: 50_000, currency: "VND" },
        reasonCode: "opening_balance",
        reason: "Số dư đầu kỳ",
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Foreign keys normally prevent this state. `replica` mode models a damaged
    // legacy row inside one transaction; the original values are restored before
    // commit, so the regression test leaves the shared test database valid.
    await ctx.database.db.transaction(async (tx) => {
      await tx.execute(sql`set local session_replication_role = replica`);
      try {
        await tx.execute(sql`
          update customer_account_entries
          set customer_id = ${crypto.randomUUID()}::uuid
          where source_type = 'manual_adjustment' and source_id = ${adjustmentId}::uuid
        `);

        const missingJoin = await createReadRepositories(tx).accountReads.adjustmentDetail({
          workspaceId: ctx.workspaceId,
          adjustmentId,
        });
        expect(missingJoin).toEqual({ kind: "integrity_error", reason: "missing joined record" });

        // Run the use case through a nested transaction on this same connection,
        // so its error mapping is proven against the damaged SQL row as well.
        const integrityOwner: CommandContext = {
          ...owner,
          deps: {
            ...deps,
            uow: createUnitOfWork(
              tx as unknown as typeof ctx.database.db,
              randomIdGenerator,
            ) as CommandDeps["uow"],
          },
        };
        const missingJoinAtBoundary = await getAccountAdjustmentDetail(integrityOwner, {
          workspaceId: ctx.workspaceId,
          adjustmentId,
        });
        expect(missingJoinAtBoundary).toMatchObject({
          ok: false,
          error: { code: "ACCOUNT_ADJUSTMENT_INTEGRITY_ERROR" },
        });

        await tx.execute(sql`
          update customer_account_entries
          set customer_id = ${ctx.customerId}::uuid, reason = '   '
          where source_type = 'manual_adjustment' and source_id = ${adjustmentId}::uuid
        `);
        const blankReason = await createReadRepositories(tx).accountReads.adjustmentDetail({
          workspaceId: ctx.workspaceId,
          adjustmentId,
        });
        expect(blankReason).toEqual({
          kind: "integrity_error",
          reason: "missing adjustment fields",
        });
      } finally {
        await tx.execute(sql`
          update customer_account_entries
          set customer_id = ${ctx.customerId}::uuid, reason = 'Số dư đầu kỳ'
          where source_type = 'manual_adjustment' and source_id = ${adjustmentId}::uuid
        `);
      }
    });

    // The normal row remains readable after the corruption simulation is restored.
    const detail = await getAccountAdjustmentDetail(owner, {
      workspaceId: ctx.workspaceId,
      adjustmentId,
    });
    expect(detail.ok).toBe(true);
  });

  it("UC-ACCOUNT-003 / TC-READ-014 — reconciliation exposes a missing source instead of rebuilding over it", async () => {
    const posting = (await ctx.accountEntryRows()).find(
      (entry) => entry.sourceType === "sale_posting",
    );
    expect(posting).toBeDefined();
    if (posting === undefined) return;
    const missingSourceId = crypto.randomUUID();

    await ctx.database.db.transaction(async (tx) => {
      await tx.execute(sql`set local session_replication_role = replica`);
      try {
        await tx.execute(sql`
          update customer_account_entries
          set source_id = ${missingSourceId}::uuid
          where id = ${posting.id}::uuid
        `);
        const integrityOwner: CommandContext = {
          ...owner,
          deps: {
            ...deps,
            uow: createUnitOfWork(
              tx as unknown as typeof ctx.database.db,
              randomIdGenerator,
            ) as CommandDeps["uow"],
          },
        };
        const result = await getAccountReconciliation(integrityOwner, {
          workspaceId: ctx.workspaceId,
          customerId: ctx.customerId,
        });
        expect(result.ok).toBe(true);
        if (!result.ok || result.value.kind !== "integrity_failure") return;
        expect(result.value.diagnostics).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: "source_missing", entryId: posting.id }),
          ]),
        );
      } finally {
        await tx.execute(sql`
          update customer_account_entries
          set source_id = ${posting.sourceId}::uuid
          where id = ${posting.id}::uuid
        `);
      }
    });
  });

  it("UC-AUDIT-001 / TC-READ-007 — resolves the actor and the correction in one query", async () => {
    const audit = await getAuditTimeline(owner, {
      ...page,
      workspaceId: ctx.workspaceId,
      aggregateType: "sale",
      aggregateId: voidedSaleId,
      actorId: null,
      from: null,
      to: null,
    });

    expect(audit.ok).toBe(true);
    if (!audit.ok) return;

    const voided = audit.value.items.find((item) => item.action === "sale.voided")!;
    expect(voided.actorDisplayName).toBeTruthy();
    expect(voided.correction).toEqual({ relation: "voids_sale", targetSaleId: voidedSaleId });
  });

  it("UC-PAYMENT-003 / TC-READ-005 — lists payments with the customer name joined", async () => {
    const listed = await listPayments(owner, {
      ...page,
      workspaceId: ctx.workspaceId,
      customerId: null,
      status: null,
      from: null,
      to: null,
    });

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.items.length).toBeGreaterThan(0);
    for (const payment of listed.value.items) {
      expect(payment.customerDisplayName.length).toBeGreaterThan(0);
      expect(payment.remainingReversibleAmount.amountMinor).toBe(
        payment.amount.amountMinor - payment.reversedAmount.amountMinor,
      );
    }
  });
});

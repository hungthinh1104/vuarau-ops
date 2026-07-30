import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import { createSaleDraft } from "../../../modules/sale/create-sale-draft.handler.ts";
import { postSale } from "../../../modules/sale/post-sale.handler.ts";
import { recordCustomerPayment } from "../../../modules/payment/record-payment.handler.ts";
import { reverseCustomerPayment } from "../../../modules/payment/reverse-payment.handler.ts";
import { voidSale } from "../../../modules/sale/void-sale.handler.ts";
import { adjustCustomerDebt } from "../../../modules/account/adjust-debt.handler.ts";
import {
  deactivateCustomer,
  reactivateCustomer,
  updateCustomer,
} from "../../../modules/customer/update-customer.handler.ts";
import { getCustomer } from "../../../modules/customer/customer.queries.ts";
import {
  getAccountReconciliation,
  getCustomerAccountBalance,
  rebuildAccountBalance,
} from "../../../modules/account/account.queries.ts";
import { rebuildAccountProjection } from "../../../modules/account/rebuild-account-projection.handler.ts";

/**
 * The whole slice, end to end, against real Postgres: real transactions, real
 * row locks, real constraints, real triggers.
 *
 * The application tests prove the rules; this proves the Drizzle adapters
 * actually satisfy the ports and that the transaction boundary is real rather
 * than an artefact of the in-memory implementation.
 */
describe.skipIf(skipWithoutDatabase())("full slice against Postgres", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;
  /** The command context an authenticated owner would have. */
  let owner: CommandContext;

  beforeAll(async () => {
    ctx = await createDbTestContext("full-slice");
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => new Date().toISOString() as ReturnType<CommandDeps["clock"]["now"]> },
    };
    owner = { deps, principal: { actorId: ctx.actorId, subject: ctx.subject } };
  });

  afterAll(async () => {
    await ctx?.close();
  });

  const saleId = crypto.randomUUID();
  const paymentId = crypto.randomUUID();
  const reversalId = crypto.randomUUID();
  const transactionTime = "2026-07-20T05:00:00.000+07:00";

  const envelope = (key: string) => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: key,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt: transactionTime,
  });

  const accountEntryRows = () => ctx.accountEntryRows();

  it("BR-SALE-007 / TC-SALE-003 — posting creates exactly one account entry", async () => {
    const created = await createSaleDraft(owner, {
      ...envelope("db-sale-create"),
      payload: {
        saleId,
        customerId: ctx.customerId,
        currency: "VND",
        lines: [
          {
            lineId: crypto.randomUUID(),
            productId: ctx.productIds[0],
            productName: "Cà chua",
            qualityGradeId: ctx.qualityGradeId,
            qualityGradeName: "Loại 1",
            quantity: { valueScaled: 12_500, unit: "kg" },
            unitPrice: { amountMinor: 18_000, currency: "VND" },
          },
          {
            lineId: crypto.randomUUID(),
            productId: ctx.productIds[1],
            productName: "Rau muống",
            qualityGradeId: ctx.qualityGradeId,
            qualityGradeName: "Loại 1",
            quantity: { valueScaled: 30_000, unit: "bo" },
            unitPrice: { amountMinor: 5_000, currency: "VND" },
          },
          {
            lineId: crypto.randomUUID(),
            productId: ctx.productIds[2],
            productName: "Ớt hiểm",
            qualityGradeId: ctx.qualityGradeId,
            qualityGradeName: "Loại 1",
            quantity: { valueScaled: 2_000, unit: "thung" },
            unitPrice: { amountMinor: 250_000, currency: "VND" },
          },
        ],
        note: null,
      },
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.totalAmount.amountMinor).toBe(875_000);
    // A draft moves no money.
    expect(await accountEntryRows()).toHaveLength(0);

    const posted = await postSale(owner, {
      ...envelope("db-sale-post"),
      expectedVersion: 1,
      payload: { saleId },
    });

    expect(posted.ok).toBe(true);
    const entries = await accountEntryRows();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.amount.amountMinor).toBe(875_000);
    expect(entries[0]?.sourceType).toBe("sale_posting");
  });

  it("BR-COMMAND-001 / TC-SALE-004 — a retried posting does not duplicate the receivable", async () => {
    const replay = await postSale(owner, {
      ...envelope("db-sale-post"),
      expectedVersion: 1,
      payload: { saleId },
    });

    expect(replay.ok).toBe(true);
    expect(await accountEntryRows()).toHaveLength(1);

    const summary = await getCustomerAccountBalance(owner, ctx.workspaceId, ctx.customerId);
    expect(summary.ok && summary.value.balance.amountMinor).toBe(875_000);
  });

  it("BR-SALE-006 / TC-SALE-005 — a stale version is rejected by the real update", async () => {
    const stale = await postSale(owner, {
      ...envelope("db-sale-post-stale"),
      expectedVersion: 1,
      payload: { saleId },
    });

    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.error.code).toBe("SALE_VERSION_CONFLICT");
  });

  it("BR-PAYMENT-002 / TC-PAYMENT-001 — a payment reduces the balance once", async () => {
    const paid = await recordCustomerPayment(owner, {
      ...envelope("db-payment-record"),
      payload: {
        paymentId,
        customerId: ctx.customerId,
        amount: { amountMinor: 500_000, currency: "VND" },
        method: "cash",
        payerName: "Tài xế anh Hùng",
        note: null,
      },
    });

    expect(paid.ok).toBe(true);
    const summary = await getCustomerAccountBalance(owner, ctx.workspaceId, ctx.customerId);
    expect(summary.ok).toBe(true);
    if (!summary.ok) return;
    expect(summary.value.balance.amountMinor).toBe(375_000);
    expect(summary.value.entryCount).toBe(2);
  });

  it("BR-PAYMENT-005 / TC-PAYMENT-004 — a reversal compensates without erasing", async () => {
    const reversed = await reverseCustomerPayment(owner, {
      ...envelope("db-payment-reverse"),
      expectedVersion: 1,
      payload: {
        paymentId,
        reversalId,
        amount: { amountMinor: 500_000, currency: "VND" },
        reason: "Chuyển khoản bị hoàn",
      },
    });

    expect(reversed.ok).toBe(true);
    if (!reversed.ok) return;
    expect(reversed.value.status).toBe("reversed");

    const entries = await accountEntryRows();
    expect(entries).toHaveLength(3);

    const original = entries.find((entry) => entry.sourceType === "payment");
    const compensating = entries.find((entry) => entry.sourceType === "payment_reversal");
    expect(original?.amount.amountMinor).toBe(-500_000);
    expect(compensating?.amount.amountMinor).toBe(500_000);
    expect(compensating?.reversalOfEntryId).toBe(original?.id);

    const summary = await getCustomerAccountBalance(owner, ctx.workspaceId, ctx.customerId);
    expect(summary.ok && summary.value.balance.amountMinor).toBe(875_000);
  });

  it("BR-SALE-012 / TC-SALE-027 — a wrong posted sale is corrected by voiding and replacing it", async () => {
    // CASE-SALE-007, against real SQL. This is the path BR-ACCOUNT-010 mandates:
    // the sale said 875 000 ₫, the customer took one thùng of ớt and not two, and
    // the truth is 625 000 ₫.
    //
    // It used to be one `AdjustCustomerDebt` of −250 000 with a free-text reason.
    // That produced the right balance beside a sale document that still said the
    // wrong thing, so the two disagreed and only the ledger explained why.
    const voided = await voidSale(owner, {
      ...envelope("db-sale-void-correction"),
      payload: {
        saleVoidId: crypto.randomUUID(),
        saleId,
        reasonCode: "wrong_amount",
        reason: "Ghi nhầm 2 thùng ớt, thực tế 1 thùng",
      },
    });

    expect(voided.ok).toBe(true);
    if (!voided.ok) return;
    expect(voided.value.financialState).toBe("voided");

    // Exact compensation: posting and void sum to zero for that sale.
    const afterVoid = await getCustomerAccountBalance(owner, ctx.workspaceId, ctx.customerId);
    expect(afterVoid.ok && afterVoid.value.balance.amountMinor).toBe(0);

    const replacementId = crypto.randomUUID();
    const replacement = await createSaleDraft(owner, {
      ...envelope("db-sale-replacement-draft"),
      payload: {
        saleId: replacementId,
        customerId: ctx.customerId,
        currency: "VND",
        lines: [
          {
            lineId: crypto.randomUUID(),
            productId: ctx.productIds[0],
            productName: "Cà chua",
            qualityGradeId: ctx.qualityGradeId,
            qualityGradeName: "Loại 1",
            quantity: { valueScaled: 12_500, unit: "kg" },
            unitPrice: { amountMinor: 18_000, currency: "VND" },
          },
          {
            lineId: crypto.randomUUID(),
            productId: ctx.productIds[1],
            productName: "Rau muống",
            qualityGradeId: ctx.qualityGradeId,
            qualityGradeName: "Loại 1",
            quantity: { valueScaled: 30_000, unit: "bo" },
            unitPrice: { amountMinor: 5_000, currency: "VND" },
          },
          {
            lineId: crypto.randomUUID(),
            productId: ctx.productIds[2],
            productName: "Ớt hiểm",
            qualityGradeId: ctx.qualityGradeId,
            qualityGradeName: "Loại 1",
            quantity: { valueScaled: 1_000, unit: "thung" },
            unitPrice: { amountMinor: 250_000, currency: "VND" },
          },
        ],
        note: null,
        dueAt: null,
        replacesSaleId: saleId,
      },
    });

    expect(replacement.ok).toBe(true);
    if (!replacement.ok) return;
    // The link is stored, so the correction chain is followable from the database
    // and not only from a sentence somebody typed (BR-SALE-016).
    expect(replacement.value.replacesSaleId).toBe(saleId);

    const posted = await postSale(owner, {
      ...envelope("db-sale-replacement-post"),
      expectedVersion: 1,
      payload: { saleId: replacementId },
    });
    expect(posted.ok).toBe(true);

    // +875 000, −875 000, +625 000. Three entries, all standing, arithmetic right.
    const entries = await accountEntryRows();
    expect(entries.filter((entry) => entry.sourceType === "sale_posting")).toHaveLength(2);
    expect(entries.filter((entry) => entry.sourceType === "sale_void")).toHaveLength(1);
    expect(entries.filter((entry) => entry.sourceType === "manual_adjustment")).toHaveLength(0);

    const balance = await getCustomerAccountBalance(owner, ctx.workspaceId, ctx.customerId);
    expect(balance.ok && balance.value.balance.amountMinor).toBe(625_000);
  });

  it("BR-ACCOUNT-003 / TC-ACCOUNT-003 — an adjustment carries its reason onto the entry", async () => {
    // A movement with no underlying document, which is what this command is for:
    // nợ cũ carried in from the paper book. Correcting a sale is not on that list
    // (BR-ACCOUNT-010) and is tested through VoidSale above.
    const adjusted = await adjustCustomerDebt(owner, {
      ...envelope("db-debt-adjust"),
      payload: {
        adjustmentId: crypto.randomUUID(),
        customerId: ctx.customerId,
        direction: "increase",
        amount: { amountMinor: 50_000, currency: "VND" },
        reasonCode: "opening_balance",
        reason: "Nợ cũ từ sổ giấy, chốt ngày 30/6",
      },
    });

    expect(adjusted.ok).toBe(true);
    if (!adjusted.ok) return;
    expect(adjusted.value.balance.amountMinor).toBe(675_000);

    const entries = await accountEntryRows();
    const adjustment = entries.find((entry) => entry.sourceType === "manual_adjustment");
    expect(adjustment?.reason).toBe("Nợ cũ từ sổ giấy, chốt ngày 30/6");
    expect(adjustment?.reasonCode).toBe("opening_balance");
  });

  it("BR-ACCOUNT-001 / TC-ACCOUNT-001 — the summary equals the sum of the stored entries", async () => {
    const entries = await accountEntryRows();
    const sum = entries.reduce((total, entry) => total + entry.amount.amountMinor, 0);

    const summary = await getCustomerAccountBalance(owner, ctx.workspaceId, ctx.customerId);
    expect(summary.ok).toBe(true);
    if (!summary.ok) return;
    expect(summary.value.balance.amountMinor).toBe(sum);
    expect(summary.value.entryCount).toBe(entries.length);
  });

  it("BR-ACCOUNT-006 / TC-ACCOUNT-002 — a rebuild reproduces the maintained summary exactly", async () => {
    const incremental = await getCustomerAccountBalance(owner, ctx.workspaceId, ctx.customerId);
    const rebuilt = await rebuildAccountBalance(deps, ctx.workspaceId, ctx.customerId);

    expect(incremental.ok).toBe(true);
    if (!incremental.ok) return;
    expect(rebuilt.balance).toEqual(incremental.value.balance);
    expect(rebuilt.entryCount).toBe(incremental.value.entryCount);
    expect(rebuilt.lastEntryTransactionTime).toBe(incremental.value.lastEntryTransactionTime);
  });

  it("BR-ACCOUNT-006 / TC-ACCOUNT-012 — Postgres detects and repairs projection-only drift idempotently", async () => {
    const entriesBefore = await accountEntryRows();
    const expectedBalance = entriesBefore.reduce(
      (total, entry) => total + entry.amount.amountMinor,
      0,
    );
    await ctx.overwriteAccountProjection({
      balanceMinor: expectedBalance + 123_456,
      entryCount: entriesBefore.length + 7,
      lastEntryTransactionTime: null,
    });

    const drift = await getAccountReconciliation(owner, {
      workspaceId: ctx.workspaceId,
      customerId: ctx.customerId,
    });
    expect(drift.ok).toBe(true);
    if (!drift.ok || drift.value.kind !== "inconsistent") return;
    expect(drift.value.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "projection_balance_mismatch",
        "projection_entry_count_mismatch",
        "projection_last_transaction_mismatch",
      ]),
    );

    const command = {
      ...envelope("db-reconcile-rebuild"),
      payload: {
        customerId: ctx.customerId,
        reason: "PostgreSQL reconciliation regression",
      },
    };
    const first = await rebuildAccountProjection(owner, command);
    const replay = await rebuildAccountProjection(owner, command);

    expect(first.ok).toBe(true);
    expect(replay).toEqual(first);
    if (!first.ok) return;
    expect(first.value.reconciliation.kind).toBe("consistent");
    expect(first.value.after.balance.amountMinor).toBe(expectedBalance);
    expect(await accountEntryRows()).toEqual(entriesBefore);
    const actions = await ctx.auditActions();
    expect(actions.filter((action) => action === "account.projection_rebuilt")).toHaveLength(1);
  });

  it("BR-COMMAND-005 / TC-COMMAND-004 — a refused command leaves no row behind", async () => {
    const before = await accountEntryRows();

    const refused = await recordCustomerPayment(owner, {
      ...envelope("db-payment-invalid"),
      payload: {
        paymentId: crypto.randomUUID(),
        customerId: ctx.customerId,
        amount: { amountMinor: 0, currency: "VND" },
        method: "cash",
        payerName: null,
        note: null,
      },
    });

    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.code).toBe("PAYMENT_AMOUNT_INVALID");
    expect(await accountEntryRows()).toHaveLength(before.length);
  });

  it("BR-CUSTOMER-002 / TC-CUSTOMER-002 — an actor cannot act in a workspace they do not belong to", async () => {
    // The owner of *this* depot, aiming at a workspace they are not a member of.
    const result = await recordCustomerPayment(owner, {
      ...envelope("db-payment-foreign"),
      workspaceId: ctx.foreignWorkspaceId,
      payload: {
        paymentId: crypto.randomUUID(),
        customerId: ctx.customerId,
        amount: { amountMinor: 100_000, currency: "VND" },
        method: "cash",
        payerName: null,
        note: null,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("WORKSPACE_ACCESS_DENIED");
  });

  it("BR-AUTH-002 / TC-AUTH-002 — a command may not name an actor other than the caller", async () => {
    const result = await recordCustomerPayment(owner, {
      ...envelope("db-payment-impersonate"),
      actorId: ctx.roleActors.sales,
      payload: {
        paymentId: crypto.randomUUID(),
        customerId: ctx.customerId,
        amount: { amountMinor: 100_000, currency: "VND" },
        method: "cash",
        payerName: null,
        note: null,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ACTOR_IMPERSONATION_DENIED");
  });

  it("BR-AUTH-004 / TC-AUTH-004 — sales cannot adjust debt against a real database", async () => {
    const salesActorId = ctx.roleActors.sales;
    const sales: CommandContext = {
      deps,
      principal: { actorId: salesActorId, subject: ctx.subjectOf(salesActorId) },
    };

    const before = await accountEntryRows();
    const result = await adjustCustomerDebt(sales, {
      ...envelope("db-debt-adjust-sales"),
      actorId: salesActorId,
      payload: {
        adjustmentId: crypto.randomUUID(),
        customerId: ctx.customerId,
        direction: "decrease",
        amount: { amountMinor: 1_000_000, currency: "VND" },
        reasonCode: "write_off",
        reason: "Không được phép",
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PERMISSION_DENIED");
    expect(result.error.details).toMatchObject({ permission: "debt.adjust", role: "sales" });
    // The refusal wrote nothing at all.
    expect(await accountEntryRows()).toHaveLength(before.length);
  });

  it("BR-AUTH-003 / TC-AUTH-003 — a revoked membership is refused, distinctly", async () => {
    const revoked: CommandContext = {
      deps,
      principal: {
        actorId: ctx.revokedActorId,
        subject: ctx.subjectOf(ctx.revokedActorId),
      },
    };

    const result = await recordCustomerPayment(revoked, {
      ...envelope("db-payment-revoked"),
      actorId: ctx.revokedActorId,
      payload: {
        paymentId: crypto.randomUUID(),
        customerId: ctx.customerId,
        amount: { amountMinor: 100_000, currency: "VND" },
        method: "cash",
        payerName: null,
        note: null,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("WORKSPACE_MEMBERSHIP_INACTIVE");
  });

  // -------------------------------------------------------------------------
  // Sale correction, against the real constraints (ADR-0012)
  // -------------------------------------------------------------------------

  /** A fresh posted sale of 100 000 ₫, so a void test starts from a known state. */
  async function postASale(): Promise<{ id: string; total: number }> {
    const id = crypto.randomUUID();
    const created = await createSaleDraft(owner, {
      ...envelope(`db-void-draft-${id}`),
      payload: {
        saleId: id,
        customerId: ctx.customerId,
        currency: "VND",
        lines: [
          {
            lineId: crypto.randomUUID(),
            productId: ctx.productIds[0],
            productName: "Cà chua",
            qualityGradeId: ctx.qualityGradeId,
            qualityGradeName: "Loại 1",
            quantity: { valueScaled: 10_000, unit: "kg" },
            unitPrice: { amountMinor: 10_000, currency: "VND" },
          },
        ],
        note: null,
        dueAt: null,
        replacesSaleId: null,
      },
    });
    expect(created.ok).toBe(true);

    const posted = await postSale(owner, {
      ...envelope(`db-void-post-${id}`),
      expectedVersion: 1,
      payload: { saleId: id },
    });
    expect(posted.ok).toBe(true);
    return { id, total: 100_000 };
  }

  it("BR-SALE-012 / TC-SALE-021 — a void offsets the posting exactly, through real SQL", async () => {
    const before = await accountEntryRows();
    const sale = await postASale();

    const result = await voidSale(owner, {
      ...envelope(`db-void-${sale.id}`),
      payload: {
        saleVoidId: crypto.randomUUID(),
        saleId: sale.id,
        reasonCode: "wrong_amount",
        reason: "Ghi nhầm số lượng",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.financialState).toBe("voided");

    const added = (await accountEntryRows()).slice(before.length);
    expect(added.map((entry) => entry.amount.amountMinor)).toEqual([sale.total, -sale.total]);
    expect(added[1]!.sourceType).toBe("sale_void");

    // The projection moved with them, in the same transactions.
    const balance = await getCustomerAccountBalance(owner, ctx.workspaceId, ctx.customerId);
    expect(balance.ok).toBe(true);
    if (!balance.ok) return;
    const entries = await accountEntryRows();
    expect(balance.value.balance.amountMinor).toBe(
      entries.reduce((sum, entry) => sum + entry.amount.amountMinor, 0),
    );
  });

  it("BR-SALE-013 / TC-SALE-024 — two concurrent voids produce exactly one effect", async () => {
    const sale = await postASale();
    const before = await accountEntryRows();

    // Genuinely concurrent, against real transactions: two different commands,
    // two different void ids, started together. Postgres decides the winner
    // through the row lock and `UNIQUE (sale_id)` — the in-memory adapter cannot
    // prove this, because it models atomicity without isolation.
    const attempt = (key: string) =>
      voidSale(owner, {
        ...envelope(key),
        payload: {
          saleVoidId: crypto.randomUUID(),
          saleId: sale.id,
          reasonCode: "duplicate_entry",
          reason: "Cả hai người cùng phát hiện",
        },
      });

    const results = await Promise.all([
      attempt(`db-void-race-a-${sale.id}`),
      attempt(`db-void-race-b-${sale.id}`),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const refused = results.find((result) => !result.ok)!;
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    // A business answer, not a constraint-violation stack trace.
    expect(refused.error.code).toBe("SALE_ALREADY_VOIDED");

    // The customer is credited once. This is the assertion that matters.
    const added = (await accountEntryRows()).slice(before.length);
    expect(added).toHaveLength(1);
    expect(added[0]!.amount.amountMinor).toBe(-sale.total);
  });

  // TC-SALE-016 — the trigger that refuses an UPDATE against a posted sale —
  // lives in `packages/db/src/repositories/append-only.db.test.ts`, with the other
  // database guarantees. Proving it needs raw SQL, and `apps/api` may not import
  // drizzle-orm: it reaches persistence only through ports (REPO_MAP).

  it("BR-ACCOUNT-006 / TC-ACCOUNT-009 — a rebuild equals the entry sum after sale, payment and void", async () => {
    const sale = await postASale();

    await recordCustomerPayment(owner, {
      ...envelope(`db-rebuild-payment-${sale.id}`),
      payload: {
        paymentId: crypto.randomUUID(),
        customerId: ctx.customerId,
        amount: { amountMinor: 40_000, currency: "VND" },
        method: "cash",
        payerName: null,
        note: null,
      },
    });

    await voidSale(owner, {
      ...envelope(`db-rebuild-void-${sale.id}`),
      payload: {
        saleVoidId: crypto.randomUUID(),
        saleId: sale.id,
        reasonCode: "goods_returned",
        reason: "Khách trả hàng",
      },
    });

    const entries = await accountEntryRows();
    const sum = entries.reduce((total, entry) => total + entry.amount.amountMinor, 0);

    const rebuilt = await rebuildAccountBalance(deps, ctx.workspaceId, ctx.customerId);
    expect(rebuilt.balance.amountMinor).toBe(sum);
    expect(rebuilt.entryCount).toBe(entries.length);

    // And the incrementally-maintained projection agrees with the rebuild — which
    // is the whole claim of BR-ACCOUNT-006, and the reason the balance is safe to
    // treat as a disposable cache (ADR-0004).
    const stored = await getCustomerAccountBalance(owner, ctx.workspaceId, ctx.customerId);
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    expect(stored.value.balance.amountMinor).toBe(sum);
  });

  it("BR-CUSTOMER-003 / TC-CUSTOMER-012 — profile lifecycle preserves PostgreSQL money truth", async () => {
    const entriesBefore = await accountEntryRows();
    const balanceBefore = entriesBefore.reduce(
      (total, entry) => total + entry.amount.amountMinor,
      0,
    );
    const updated = await updateCustomer(owner, {
      ...envelope("db-customer-update"),
      expectedVersion: 1,
      payload: {
        customerId: ctx.customerId,
        displayName: "Chị Lan — hồ sơ đã cập nhật",
        phone: "090 999 8888",
        note: "Chỉ sửa master data",
      },
    });
    expect(updated.ok).toBe(true);

    const deactivated = await deactivateCustomer(owner, {
      ...envelope("db-customer-deactivate"),
      expectedVersion: 2,
      payload: { customerId: ctx.customerId, reason: "Tạm ngưng giao dịch" },
    });
    expect(deactivated.ok).toBe(true);
    const reactivated = await reactivateCustomer(owner, {
      ...envelope("db-customer-reactivate"),
      expectedVersion: 3,
      payload: { customerId: ctx.customerId, reason: "Khách quay lại" },
    });
    expect(reactivated.ok).toBe(true);

    expect(await accountEntryRows()).toEqual(entriesBefore);
    const detail = await getCustomer(owner, {
      workspaceId: ctx.workspaceId,
      customerId: ctx.customerId,
    });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.value.customer.isActive).toBe(true);
    expect(detail.value.customer.version).toBe(4);
    expect(detail.value.balance.amountMinor).toBe(balanceBefore);
  });
});

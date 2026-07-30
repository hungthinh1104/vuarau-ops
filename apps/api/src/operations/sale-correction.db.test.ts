import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type {
  ActorId,
  IsoInstant,
  SaleId,
  SaleLineId,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import { randomIdGenerator } from "../infrastructure/clock.ts";
import type { CommandContext, CommandDeps } from "../modules/shared/command-pipeline.ts";
import { createSaleDraft } from "../modules/sale/create-sale-draft.handler.ts";
import { postSale } from "../modules/sale/post-sale.handler.ts";
import { getSale } from "../modules/sale/sale.queries.ts";
import { applyCorrection, planCorrection, type CorrectionRequest } from "./sale-correction.ts";

/**
 * BR-OPS-003 / TC-OPS-005 — an operator can correct a mistaken posted sale
 * without touching a row.
 *
 * Against real Postgres, because the properties that matter are properties of the
 * database: the compensating entry, the immutability trigger on `sales`, the
 * `UNIQUE (sale_id)` on `sale_voids`, and the idempotency table that makes a
 * re-run a replay. An in-memory version of this test would prove the in-memory
 * repository.
 */
describe.skipIf(skipWithoutDatabase())("correcting a posted sale against Postgres", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;
  let owner: CommandContext;
  let sales: CommandContext;

  beforeAll(async () => {
    ctx = await createDbTestContext("sale-correction");
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => new Date().toISOString() as IsoInstant },
    };
    owner = { deps, principal: { actorId: ctx.actorId, subject: ctx.subject } };
    sales = {
      deps,
      principal: {
        actorId: ctx.roleActors.sales,
        subject: ctx.subjectOf(ctx.roleActors.sales),
      },
    };
  });

  afterAll(async () => {
    await ctx?.close();
  });

  const transactionTime = "2026-07-25T05:00:00.000+07:00" as IsoInstant;

  const line = (name: string, milliUnits: number, priceMinor: number) => ({
    lineId: crypto.randomUUID() as SaleLineId,
    productId: ctx.productIds[2],
    productName: name,
    qualityGradeId: ctx.qualityGradeId,
    qualityGradeName: "Loại 1",
    quantity: { valueScaled: milliUnits, unit: "thung" as const },
    unitPrice: { amountMinor: priceMinor, currency: "VND" as const },
  });

  /** A posted sale to correct, with its own customer so balances stay readable. */
  async function postASale(label: string, thung: number): Promise<{ saleId: SaleId }> {
    const saleId = crypto.randomUUID() as SaleId;
    const envelope = (key: string) => ({
      commandId: crypto.randomUUID(),
      idempotencyKey: `${label}-${key}`,
      workspaceId: ctx.workspaceId,
      actorId: ctx.actorId,
      occurredAt: transactionTime,
    });

    const draft = await createSaleDraft(owner, {
      ...envelope("draft"),
      payload: {
        saleId,
        customerId: ctx.customerId,
        currency: "VND",
        lines: [line("Ớt hiểm", thung * 1_000, 250_000)],
        note: null,
      },
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) throw new Error("setup failed");

    const posted = await postSale(owner, {
      ...envelope("post"),
      expectedVersion: draft.value.version,
      payload: { saleId },
    });
    expect(posted.ok).toBe(true);
    return { saleId };
  }

  const request = (saleId: SaleId, over: Partial<CorrectionRequest> = {}): CorrectionRequest => ({
    workspaceId: ctx.workspaceId as WorkspaceId,
    saleId,
    actorId: ctx.actorId as ActorId,
    expectedVersion: 2,
    reasonCode: "wrong_amount",
    reason: "Ghi nhầm 2 thùng ớt, thực tế 1 thùng",
    replacement: null,
    occurredAt: transactionTime,
    correctionKey: `key-${saleId}`,
    ...over,
  });

  it("plans a correction without writing anything", async () => {
    const { saleId } = await postASale("plan", 2);

    const planned = await planCorrection(owner, request(saleId));
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;

    expect(planned.result.committed).toBe(false);
    expect(planned.result.plan.sale.totalMinor).toBe(500_000);
    expect(planned.result.plan.balanceProjectedMinor).toBe(
      planned.result.plan.balanceBeforeMinor - 500_000,
    );

    // The whole point of a dry run: the sale is untouched.
    const after = await getSale(owner, { workspaceId: ctx.workspaceId, saleId });
    expect(after.ok && after.value.voidRecord).toBeNull();
    expect(after.ok && after.value.financialState).toBe("active");
  });

  it("voids and replaces through the real commands, and the balance lands where it was projected", async () => {
    const { saleId } = await postASale("void-replace", 2);

    const planned = await planCorrection(
      owner,
      request(saleId, {
        replacement: {
          lines: [line("Ớt hiểm", 1_000, 250_000)],
          note: "Sửa lại: 1 thùng",
          dueAt: null,
        },
      }),
    );
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;

    const applied = await applyCorrection(
      owner,
      request(saleId, {
        replacement: {
          lines: [line("Ớt hiểm", 1_000, 250_000)],
          note: "Sửa lại: 1 thùng",
          dueAt: null,
        },
      }),
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    expect(applied.result.steps.map((step) => step.status)).toEqual(["done", "done", "done"]);

    // The number printed before is the number the server produced after. Asserted
    // rather than assumed: the projection is arithmetic done in the operator tool,
    // and the balance is a projection the server rebuilt from the entries.
    expect(applied.result.balanceAfterMinor).toBe(applied.result.plan.balanceProjectedMinor);
    expect(applied.result.balanceAfterMinor).toBe(
      applied.result.plan.balanceBeforeMinor - 500_000 + 250_000,
    );
  });

  it("leaves the original sale immutable, voided, and linked from its replacement", async () => {
    const { saleId } = await postASale("linkage", 2);
    const replacementLines = [line("Ớt hiểm", 1_000, 250_000)];

    const applied = await applyCorrection(
      owner,
      request(saleId, {
        replacement: { lines: replacementLines, note: null, dueAt: null },
      }),
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const original = await getSale(owner, { workspaceId: ctx.workspaceId, saleId });
    expect(original.ok).toBe(true);
    if (!original.ok) return;

    // Nothing edited: the row still says what it always said, and the void is a
    // record beside it (BR-SALE-008).
    expect(original.value.totalAmount.amountMinor).toBe(500_000);
    expect(original.value.status).toBe("posted");
    expect(original.value.financialState).toBe("voided");
    expect(original.value.voidRecord?.reasonCode).toBe("wrong_amount");
    expect(original.value.replacedBySaleId).not.toBeNull();

    const replacementId = original.value.replacedBySaleId as SaleId;
    const replacement = await getSale(owner, {
      workspaceId: ctx.workspaceId,
      saleId: replacementId,
    });
    expect(replacement.ok && replacement.value.replacesSaleId).toBe(saleId);
    expect(replacement.ok && replacement.value.totalAmount.amountMinor).toBe(250_000);
  });

  it("replays a re-run of the same correction rather than voiding twice", async () => {
    const { saleId } = await postASale("replay", 2);
    const input = request(saleId);

    const first = await applyCorrection(owner, input);
    expect(first.ok && first.result.steps[0]?.status).toBe("done");

    // Same key → same ids → the idempotency layer answers with the original
    // result (BR-COMMAND-001). Without derived ids this would be a second void,
    // which credits the customer twice for one mistake.
    const second = await applyCorrection(owner, input);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.result.steps[0]?.status).toBe("done");
    expect(second.result.balanceAfterMinor).toBe(first.ok ? first.result.balanceAfterMinor : -1);
  });

  it("refuses when the version is not the one the operator read", async () => {
    const { saleId } = await postASale("stale", 1);

    const outcome = await planCorrection(owner, request(saleId, { expectedVersion: 99 }));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("SALE_VERSION_CONFLICT");
  });

  it("refuses an operator whose role does not hold sale.void", async () => {
    const { saleId } = await postASale("permission", 1);

    // `sales` may post a sale and may not erase one: somebody who can do both can
    // make a load disappear with nothing missing from the balance (BR-AUTH-004).
    const outcome = await applyCorrection(
      sales,
      request(saleId, { actorId: ctx.roleActors.sales as ActorId }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.steps[0]).toMatchObject({
      step: "void",
      status: "failed",
      code: "PERMISSION_DENIED",
    });

    const untouched = await getSale(owner, { workspaceId: ctx.workspaceId, saleId });
    expect(untouched.ok && untouched.value.voidRecord).toBeNull();
  });

  it("refuses to void a sale that is already voided", async () => {
    const { saleId } = await postASale("twice", 1);
    await applyCorrection(owner, request(saleId, { expectedVersion: 2 }));

    const again = await planCorrection(
      owner,
      request(saleId, { expectedVersion: 2, correctionKey: "different-key" }),
    );
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.code).toBe("SALE_ALREADY_VOIDED");
  });
});

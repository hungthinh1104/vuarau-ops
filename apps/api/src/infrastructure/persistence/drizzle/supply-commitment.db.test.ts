import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type { SupplierId, SupplyCommitmentId } from "@vuarau/domain-contracts";
import { createSupplier } from "../../../modules/supplier/supplier.handlers.ts";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import {
  cancelSupplyCommitment,
  confirmSupplyCommitment,
  createSupplyCommitmentDraft,
} from "../../../modules/supply-commitment/supply-commitment.handlers.ts";
import {
  getSupplyCommitment,
  listSupplyCommitments,
} from "../../../modules/supply-commitment/supply-commitment.queries.ts";
import { exportWorkspaceBackup } from "../../../modules/operations/operations.queries.ts";

describe.skipIf(skipWithoutDatabase())("Supply Commitment against PostgreSQL", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;
  let supplierId: SupplierId;
  let commitmentId: SupplyCommitmentId;
  const context = (): CommandContext => ({
    deps,
    principal: { actorId: ctx.actorId, subject: ctx.subject },
  });
  const command = (key: string) => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: `${key}-${crypto.randomUUID()}`,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt: "2026-07-20T05:00:00.000Z",
  });

  beforeAll(async () => {
    ctx = await createDbTestContext("supply-commitment");
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => new Date().toISOString() as ReturnType<CommandDeps["clock"]["now"]> },
    };
    supplierId = crypto.randomUUID() as SupplierId;
    commitmentId = crypto.randomUUID() as SupplyCommitmentId;
    expect(
      (
        await createSupplier(context(), {
          ...command("supplier"),
          payload: {
            supplierId,
            displayName: "Vựa nguồn PostgreSQL",
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

  it("TC-SUPPLY-COMMITMENT-007 persists the commercial lifecycle, replays safely, scopes reads and exports it", async () => {
    const create = {
      ...command("commitment-create"),
      payload: {
        supplyCommitmentId: commitmentId,
        supplierId,
        currency: "VND" as const,
        lines: [
          {
            lineId: crypto.randomUUID(),
            productId: ctx.productIds[0],
            qualityGradeId: ctx.qualityGradeId,
            productName: "Cà chua",
            quantity: { valueScaled: 12_500, unit: "kg" as const },
            agreedUnitPrice: { amountMinor: 12_000, currency: "VND" as const },
          },
        ],
        expectedArrivalAt: "2026-07-27T05:00:00.000Z",
        paymentTermsSnapshot: { label: "Net 7", dueAt: "2026-07-27T05:00:00.000Z" },
        note: "Không tạo payable khi mới cam kết",
        evidenceReferences: ["paper://commitment/001"],
        replacesSupplyCommitmentId: null,
      },
    };
    const created = await createSupplyCommitmentDraft(context(), create);
    const retry = await createSupplyCommitmentDraft(context(), create);
    expect(created.ok).toBe(true);
    expect(retry).toEqual(created);

    const confirmed = await confirmSupplyCommitment(context(), {
      ...command("commitment-confirm"),
      expectedVersion: 1,
      payload: { supplyCommitmentId: commitmentId },
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.value.totalAmount).toEqual({ amountMinor: 150_000, currency: "VND" });

    const detail = await getSupplyCommitment(context(), {
      workspaceId: ctx.workspaceId,
      supplyCommitmentId: commitmentId,
    });
    expect(detail.ok && detail.value?.status).toBe("confirmed");
    const page = await listSupplyCommitments(context(), {
      workspaceId: ctx.workspaceId,
      supplierId,
      status: "confirmed",
      cursor: null,
      limit: 10,
    });
    expect(page.ok && page.value.items.map((item) => item.id)).toContain(commitmentId);

    const backup = await exportWorkspaceBackup(context(), {
      ...command("commitment-backup"),
      payload: {},
    });
    expect(backup.ok && backup.value.version).toBe(18);
    expect(backup.ok && backup.value.payload.supplyCommitments).toContainEqual(
      expect.objectContaining({ id: commitmentId, supplierId }),
    );

    const cancelled = await cancelSupplyCommitment(context(), {
      ...command("commitment-cancel"),
      expectedVersion: 2,
      payload: { supplyCommitmentId: commitmentId, reason: "Đổi lịch thu mua" },
    });
    expect(cancelled.ok && cancelled.value.status).toBe("cancelled");
  });

  it("TC-SUPPLY-COMMITMENT-008 hides a commitment from a foreign workspace even when the id is known", async () => {
    const foreign = await getSupplyCommitment(context(), {
      workspaceId: ctx.foreignWorkspaceId,
      supplyCommitmentId: commitmentId,
    });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error.code).toBe("WORKSPACE_ACCESS_DENIED");
  });
});

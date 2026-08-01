import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  captureDatabaseError,
  createDbTestContext,
  createUnitOfWork,
  eq,
  goodsArrivals,
  qualityDispositionAllocations,
  skipWithoutDatabase,
  sql,
  workspaceOperationalProfiles,
  type DbTestContext,
} from "@vuarau/db";
import type {
  GoodsArrivalId,
  GoodsArrivalLineId,
  PurchaseId,
  PurchaseLineId,
  QualityDispositionAllocationId,
  QualityDispositionId,
  QualityInspectionId,
  SupplierId,
} from "@vuarau/domain-contracts";
import { randomIdGenerator } from "../../clock.ts";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { createSupplier } from "../../../modules/supplier/supplier.handlers.ts";
import {
  confirmPurchase,
  createPurchaseDraft,
} from "../../../modules/purchase/purchase.handlers.ts";
import {
  recordGoodsArrival,
  recordQualityDisposition,
  recordQualityInspection,
} from "../../../modules/intake/intake.handlers.ts";
import {
  getArrivalLineHistory,
  getDispositionSourceSummary,
} from "../../../modules/intake/intake.queries.ts";
import { getInventoryReconciliation } from "../../../modules/inventory/inventory.queries.ts";

describe.skipIf(skipWithoutDatabase())("inspected intake against PostgreSQL", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;
  const supplierId = crypto.randomUUID() as SupplierId;
  const purchaseId = crypto.randomUUID() as PurchaseId;
  const purchaseLineId = crypto.randomUUID() as PurchaseLineId;
  const arrivalId = crypto.randomUUID() as GoodsArrivalId;
  const arrivalLineId = crypto.randomUUID() as GoodsArrivalLineId;
  const inspectionId = crypto.randomUUID() as QualityInspectionId;
  const dispositionId = crypto.randomUUID() as QualityDispositionId;
  const quarantineAllocationId = crypto.randomUUID() as QualityDispositionAllocationId;
  const childDispositionId = crypto.randomUUID() as QualityDispositionId;

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
    ctx = await createDbTestContext(`intake-${crypto.randomUUID()}`);
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: {
        now: () => new Date().toISOString() as ReturnType<CommandDeps["clock"]["now"]>,
      },
    };
    await ctx.database.db
      .update(workspaceOperationalProfiles)
      .set({
        intakeMode: "inspected_arrival",
        weighingMode: "gross_tare_net",
        version: 2,
      })
      .where(eq(workspaceOperationalProfiles.workspaceId, ctx.workspaceId));

    expect(
      (
        await createSupplier(context(), {
          ...command("supplier"),
          payload: {
            supplierId,
            displayName: "Vựa nguồn kiểm định",
            phone: null,
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await createPurchaseDraft(context(), {
          ...command("purchase"),
          payload: {
            purchaseId,
            supplierId,
            currency: "VND",
            lines: [
              {
                lineId: purchaseLineId,
                productId: ctx.productIds[0],
                productName: "Cà chua",
                quantity: { valueScaled: 100_000, unit: "kg" },
                unitPrice: { amountMinor: 20_000, currency: "VND" },
              },
            ],
            note: null,
            dueAt: null,
            replacesPurchaseId: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await confirmPurchase(context(), {
          ...command("confirm"),
          expectedVersion: 1,
          payload: { purchaseId },
        })
      ).ok,
    ).toBe(true);

    expect(
      (
        await recordGoodsArrival(context(), {
          ...command("arrival"),
          payload: {
            arrivalId,
            supplierId,
            purchaseId,
            vehicleReference: "51C-DB-TEST",
            lines: [
              {
                arrivalLineId,
                purchaseLineId,
                productId: ctx.productIds[0],
                productName: "Cà chua",
                arrivedQuantity: { valueScaled: 100_000, unit: "kg" },
                weighing: {
                  containerCount: 10,
                  grossWeight: { valueScaled: 105_000, unit: "kg" },
                  tareWeight: { valueScaled: 5_000, unit: "kg" },
                  netWeight: { valueScaled: 100_000, unit: "kg" },
                },
                supplierLotCode: "DB-LOT-001",
                note: null,
              },
            ],
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await recordQualityInspection(context(), {
          ...command("inspection"),
          payload: {
            inspectionId,
            arrivalLineId,
            inspectedQuantity: { valueScaled: 100_000, unit: "kg" },
            issues: [],
            note: "Kiểm toàn bộ",
            evidenceReferences: ["photo://db-intake"],
          },
        })
      ).ok,
    ).toBe(true);

    expect(
      (
        await recordQualityDisposition(context(), {
          ...command("disposition"),
          payload: {
            dispositionId,
            source: { type: "arrival_line", arrivalLineId },
            allocations: [
              {
                allocationId: crypto.randomUUID() as QualityDispositionAllocationId,
                outcome: "accepted",
                quantity: { valueScaled: 80_000, unit: "kg" },
                qualityGradeId: ctx.qualityGradeId,
                qualityGradeName: "Loại 1",
                note: null,
              },
              {
                allocationId: quarantineAllocationId,
                outcome: "quarantined",
                quantity: { valueScaled: 20_000, unit: "kg" },
                qualityGradeId: null,
                qualityGradeName: null,
                note: "Chờ kiểm lại",
              },
            ],
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await recordQualityDisposition(context(), {
          ...command("quarantine-child"),
          payload: {
            dispositionId: childDispositionId,
            source: {
              type: "quarantine_allocation",
              allocationId: quarantineAllocationId,
            },
            allocations: [
              {
                allocationId: crypto.randomUUID() as QualityDispositionAllocationId,
                outcome: "rejected",
                quantity: { valueScaled: 20_000, unit: "kg" },
                qualityGradeId: null,
                qualityGradeName: null,
                note: "Không đạt sau kiểm lại",
              },
            ],
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it("TC-INTAKE-009 — PostgreSQL preserves recursive quality lineage and inventory truth", async () => {
    const history = await getArrivalLineHistory(context(), {
      workspaceId: ctx.workspaceId,
      arrivalLineId,
    });
    expect(history.ok && history.value).toMatchObject({
      arrivalLineId,
      inspections: [{ id: inspectionId, reversal: null }],
    });
    expect(history.ok && history.value.dispositions.map((row) => row.id)).toEqual([
      dispositionId,
      childDispositionId,
    ]);

    const arrivalSource = await getDispositionSourceSummary(context(), {
      workspaceId: ctx.workspaceId,
      source: { type: "arrival_line", arrivalLineId },
    });
    expect(arrivalSource.ok && arrivalSource.value).toMatchObject({
      sourceQuantity: { valueScaled: 100_000, unit: "kg" },
      inspectedQuantity: { valueScaled: 100_000, unit: "kg" },
      allocatedQuantity: { valueScaled: 100_000, unit: "kg" },
      eligibleQuantity: { valueScaled: 0, unit: "kg" },
    });

    const reconciliation = await getInventoryReconciliation(context(), {
      workspaceId: ctx.workspaceId,
      productId: ctx.productIds[0],
      qualityGradeId: ctx.qualityGradeId,
      unit: "kg",
    });
    expect(reconciliation.ok && reconciliation.value).toMatchObject({
      status: "consistent",
      projected: { quantity: { valueScaled: 80_000, unit: "kg" } },
      canonical: { quantity: { valueScaled: 80_000, unit: "kg" } },
      diagnostics: [],
    });
  });

  it("TC-INTAKE-010 — database guards arrival and disposition facts from mutation", async () => {
    const arrivalError = await captureDatabaseError(
      ctx.database.db.execute(sql`
        update goods_arrivals set note = 'rewritten'
        where workspace_id = ${ctx.workspaceId}::uuid and id = ${arrivalId}::uuid
      `),
    );
    expect(arrivalError).toContain("immutable");

    const allocationError = await captureDatabaseError(
      ctx.database.db.execute(sql`
        delete from quality_disposition_allocations
        where workspace_id = ${ctx.workspaceId}::uuid
          and disposition_id = ${dispositionId}::uuid
      `),
    );
    expect(allocationError).toContain("immutable");
    expect(
      await ctx.database.db
        .select({ id: goodsArrivals.id })
        .from(goodsArrivals)
        .where(eq(goodsArrivals.id, arrivalId)),
    ).toHaveLength(1);
    expect(
      await ctx.database.db
        .select({ id: qualityDispositionAllocations.id })
        .from(qualityDispositionAllocations)
        .where(eq(qualityDispositionAllocations.dispositionId, dispositionId)),
    ).toHaveLength(2);
  });
});

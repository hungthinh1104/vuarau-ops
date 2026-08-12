import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  captureDatabaseError,
  createDbTestContext,
  createUnitOfWork,
  eq,
  goodsArrivals,
  products,
  qualityDispositionAllocations,
  PersistedIntegrityError,
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
  listGoodsArrivals,
} from "../../../modules/intake/intake.queries.ts";
import {
  getInventoryReconciliation,
  getProductCoverage,
} from "../../../modules/inventory/inventory.queries.ts";

// TC-EVIDENCE-005
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
    await ctx.database.db
      .update(products)
      .set({ preferredUnit: "kg" })
      .where(eq(products.id, ctx.productIds[0]));

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
            evidenceReferences: ["photo://db-arrival"],
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
            evidenceReferences: ["note://db-disposition"],
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
            evidenceReferences: ["note://db-quarantine"],
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
      dispositions: [
        { id: dispositionId, evidenceReferences: ["note://db-disposition"] },
        { id: childDispositionId, evidenceReferences: ["note://db-quarantine"] },
      ],
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
      projected: { quantityScaled: 80_000, unit: "kg" },
      canonical: { quantityScaled: 80_000, unit: "kg" },
      diagnostics: [],
    });

    const coverage = await getProductCoverage(context(), {
      workspaceId: ctx.workspaceId,
      productIds: [ctx.productIds[0]!],
    });
    expect(coverage.ok && coverage.value[0]?.quantities).toEqual([
      {
        unit: "kg",
        qualityGradeId: null,
        qualityGradeName: null,
        onHand: { valueScaled: 0, unit: "kg" },
        inboundRemaining: { valueScaled: 20_000, unit: "kg" },
        outboundRemaining: { valueScaled: 0, unit: "kg" },
        availableAfterCommitments: { valueScaled: 20_000, unit: "kg" },
        classification: "covered",
      },
      {
        unit: "kg",
        qualityGradeId: ctx.qualityGradeId,
        qualityGradeName: "Loại 1",
        onHand: { valueScaled: 80_000, unit: "kg" },
        inboundRemaining: { valueScaled: 0, unit: "kg" },
        outboundRemaining: { valueScaled: 0, unit: "kg" },
        availableAfterCommitments: { valueScaled: 80_000, unit: "kg" },
        classification: "covered",
      },
    ]);
    const acceptedByPurchaseLine = await deps.uow.transaction((repos) =>
      repos.qualityDispositions.acceptedQuantitiesForPurchaseLines(ctx.workspaceId, [
        purchaseLineId,
      ]),
    );
    expect(acceptedByPurchaseLine.get(purchaseLineId)).toEqual({
      valueScaled: 80_000,
      unit: "kg",
    });
  });

  it("TC-INTAKE-014 — inventory grade existence is scoped without loading movement history", async () => {
    const result = await deps.uow.transaction(async (repos) => ({
      existing: await repos.inventoryMovements.hasByProductQualityGrade(
        ctx.workspaceId,
        ctx.productIds[0]!,
        ctx.qualityGradeId,
        "kg",
      ),
      wrongUnit: await repos.inventoryMovements.hasByProductQualityGrade(
        ctx.workspaceId,
        ctx.productIds[0]!,
        ctx.qualityGradeId,
        "bo",
      ),
      otherWorkspace: await repos.inventoryMovements.hasByProductQualityGrade(
        crypto.randomUUID() as typeof ctx.workspaceId,
        ctx.productIds[0]!,
        ctx.qualityGradeId,
        "kg",
      ),
    }));

    expect(result).toEqual({ existing: true, wrongUnit: false, otherWorkspace: false });
  });

  it("TC-INTAKE-010 — database guards arrival and disposition facts from mutation", async () => {
    const arrivalError = await captureDatabaseError(
      ctx.database.db.execute(sql`
        update goods_arrivals set note = 'rewritten'
        where workspace_id = ${ctx.workspaceId}::uuid and id = ${arrivalId}::uuid
      `),
    );
    expect(arrivalError).toMatch(/append-only|compensating/i);

    const allocationError = await captureDatabaseError(
      ctx.database.db.execute(sql`
        delete from quality_disposition_allocations
        where workspace_id = ${ctx.workspaceId}::uuid
          and disposition_id = ${dispositionId}::uuid
      `),
    );
    expect(allocationError).toMatch(/append-only|compensating/i);
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

  it("TC-INTAKE-012 — mixed persisted inspection units fail closed", async () => {
    const commandId = crypto.randomUUID();
    const recordedAt = new Date().toISOString();
    await ctx.database.db.execute(sql`
      insert into command_receipts (
        command_id, workspace_id, idempotency_key, command_type,
        payload_hash, status, recorded_at
      ) values (
        ${commandId}::uuid, ${ctx.workspaceId}::uuid, ${`corrupt-${commandId}`},
        'CorruptInspectionFixture', 'corrupt-fixture', 'completed', ${recordedAt}
      )
    `);
    await ctx.database.db.execute(sql`
      insert into quality_inspections (
        id, workspace_id, arrival_line_id, inspected_value_scaled, inspected_unit,
        note, evidence_references, transaction_time, recorded_at, actor_id, command_id
      ) values (
        ${crypto.randomUUID()}::uuid, ${ctx.workspaceId}::uuid, ${arrivalLineId}::uuid,
        1, 'bo', 'corrupt mixed-unit fixture', ARRAY[]::text[], ${recordedAt},
        ${recordedAt}, ${ctx.actorId}::uuid, ${commandId}::uuid
      )
    `);

    await ctx.database.db.execute(sql`
      insert into quality_disposition_allocations (
        id, workspace_id, disposition_id, outcome, value_scaled, unit,
        quality_grade_id, quality_grade_name, note
      ) values (
        ${crypto.randomUUID()}::uuid, ${ctx.workspaceId}::uuid, ${dispositionId}::uuid,
        'accepted', 1, 'bo', NULL, NULL, 'corrupt mixed-unit fixture'
      )
    `);

    const uow = createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"];
    await expect(
      uow.transaction((repos) =>
        repos.qualityInspections.activeInspectedQuantity(ctx.workspaceId, arrivalLineId),
      ),
    ).rejects.toBeInstanceOf(PersistedIntegrityError);
    await expect(
      uow.transaction((repos) =>
        repos.qualityDispositions.acceptedQuantitiesForPurchaseLines(ctx.workspaceId, [
          purchaseLineId,
        ]),
      ),
    ).rejects.toBeInstanceOf(PersistedIntegrityError);

    expect(
      await getProductCoverage(context(), {
        workspaceId: ctx.workspaceId,
        productIds: [ctx.productIds[0]!],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "INVENTORY_RECONCILIATION_INTEGRITY_FAILURE", retryable: false },
    });
  });

  it("TC-INTAKE-013 — lists multiple arrivals with complete lines in one read contract", async () => {
    const extraArrivalIds = [
      crypto.randomUUID() as GoodsArrivalId,
      crypto.randomUUID() as GoodsArrivalId,
    ];
    for (const [index, arrivalId] of extraArrivalIds.entries()) {
      const result = await recordGoodsArrival(context(), {
        ...command(`batch-arrival-${index}`),
        payload: {
          arrivalId,
          supplierId,
          purchaseId: null,
          vehicleReference: `XE-${index}`,
          lines: [
            {
              arrivalLineId: crypto.randomUUID() as GoodsArrivalLineId,
              purchaseLineId: null,
              productId: ctx.productIds[0]!,
              productName: "Cà chua",
              arrivedQuantity: { valueScaled: 1_000 + index, unit: "kg" },
              weighing: {
                containerCount: 1,
                grossWeight: { valueScaled: 1_100 + index, unit: "kg" },
                tareWeight: { valueScaled: 100, unit: "kg" },
                netWeight: { valueScaled: 1_000 + index, unit: "kg" },
              },
              supplierLotCode: null,
              note: null,
            },
          ],
          note: null,
          evidenceReferences: [],
        },
      });
      expect(result.ok).toBe(true);
    }

    const result = await listGoodsArrivals(context(), {
      workspaceId: ctx.workspaceId,
      supplierId,
      purchaseId: null,
      cursor: null,
      limit: 20,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items.map((arrival) => arrival.id)).toEqual(
      expect.arrayContaining(extraArrivalIds),
    );
    for (const arrivalId of extraArrivalIds) {
      expect(result.value.items.find((arrival) => arrival.id === arrivalId)?.lines).toHaveLength(1);
    }
  });
});

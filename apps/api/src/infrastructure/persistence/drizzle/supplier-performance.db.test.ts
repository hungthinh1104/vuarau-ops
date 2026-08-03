import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import type {
  SupplierId,
  SupplierObservationId,
  WorkspacePolicyVersionId,
} from "@vuarau/domain-contracts";
import { randomIdGenerator } from "../../clock.ts";
import { recordSupplierObservation } from "../../../modules/evidence/evidence.handlers.ts";
import {
  approveWorkspacePolicy,
  createWorkspacePolicyDraft,
} from "../../../modules/policy/policy.handlers.ts";
import { createSupplier } from "../../../modules/supplier/supplier.handlers.ts";
import { getSupplierPerformance } from "../../../modules/supplier/supplier-performance.queries.ts";

describe.skipIf(skipWithoutDatabase())("supplier performance against PostgreSQL", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;
  const supplierId = crypto.randomUUID() as SupplierId;

  const context = (): CommandContext => ({
    deps,
    principal: { actorId: ctx.actorId, subject: ctx.subject },
  });

  const command = (label: string) => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: `supplier-performance-db-${label}-${crypto.randomUUID()}`,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt: "2026-07-20T05:00:00.000Z",
  });

  beforeEach(async () => {
    ctx = await createDbTestContext(`supplier-performance-${crypto.randomUUID()}`);
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => "2026-07-23T09:00:00.000Z" as never },
    };
  });

  afterEach(async () => {
    await ctx?.close();
  });

  it("TC-SUPPLIER-PERFORMANCE-001 preserves policy lineage and PostgreSQL source lineage", async () => {
    expect(
      (
        await createSupplier(context(), {
          ...command("supplier"),
          payload: {
            supplierId,
            displayName: "Nhà vườn PostgreSQL",
            phone: null,
            note: null,
          },
        })
      ).ok,
    ).toBe(true);

    const policyVersionId = crypto.randomUUID() as WorkspacePolicyVersionId;
    expect(
      (
        await createWorkspacePolicyDraft(context(), {
          ...command("policy-draft"),
          payload: {
            policyVersionId,
            policyKind: "supplier_evaluation",
            version: 1,
            effectiveFrom: "2026-07-01T00:00:00.000Z",
            effectiveTo: null,
            definition: {
              contractVersion: 1,
              parameters: {
                strategy: "observed_outcomes_summary",
                windowDays: 30,
                minimumObservationCount: 1,
              },
            },
            evidenceReferences: [],
            reason: "Policy supplier performance PostgreSQL.",
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await approveWorkspacePolicy(context(), {
          ...command("policy-approve"),
          payload: {
            policyVersionId,
            evidenceReferences: ["field://supplier-performance/postgres-001"],
            reason: "Đã duyệt cửa sổ và cách đọc dữ kiện.",
          },
        })
      ).ok,
    ).toBe(true);

    const observationId = crypto.randomUUID() as SupplierObservationId;
    expect(
      (
        await recordSupplierObservation(context(), {
          ...command("observation"),
          payload: {
            supplierObservationId: observationId,
            kind: "actual_quantity",
            caseKind: "normal",
            description: "Đối chiếu giao hàng PostgreSQL.",
            participantWording: "Đã nhận đủ thông tin chuyến hàng.",
            facts: {
              supplierId,
              productId: null,
              qualityGradeId: null,
              role: null,
              sourceArea: null,
              pickupResponsibility: null,
              packingResponsibility: null,
              transportResponsibility: null,
              expectedLeadTimeText: null,
              paymentArrangement: null,
              traceabilityLevel: null,
              promisedQuantity: { valueScaled: 100_000, unit: "kg" },
              actualQuantity: { valueScaled: 90_000, unit: "kg" },
              acceptedQuantity: { valueScaled: 80_000, unit: "kg" },
              rejectedQuantity: { valueScaled: 10_000, unit: "kg" },
              expectedAt: "2026-07-22T02:00:00.000Z",
              actualAt: "2026-07-22T01:00:00.000Z",
              price: null,
              claimReference: null,
              observationReference: "notebook://supplier-performance/postgres-001",
            },
            evidenceReferences: ["notebook://supplier-performance/postgres-001"],
            relatedObservationId: null,
          },
        })
      ).ok,
    ).toBe(true);

    const result = await getSupplierPerformance(context(), {
      workspaceId: ctx.workspaceId,
      supplierId,
      asOf: "2026-07-23T09:00:00.000Z",
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        status: "available",
        policyVersionId,
        measurementObservationCount: 1,
        sourceObservationIds: [observationId],
        quantityMetrics: [
          { unit: "kg", fulfilmentRateBasisPoints: 9_000, acceptanceRateBasisPoints: 8_889 },
        ],
        timing: { measuredCount: 1, onTimeCount: 1, lateCount: 0 },
      },
    });
  });
});

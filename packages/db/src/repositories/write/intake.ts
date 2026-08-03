import { and, eq, isNull } from "drizzle-orm";
import type {
  GoodsArrivalDto,
  GoodsArrivalId,
  GoodsArrivalLineId,
  PurchaseLineId,
  QualityDispositionDto,
  QualityDispositionId,
  QualityInspectionDto,
  QualityInspectionId,
  QualityIssueCodeDto,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import {
  goodsArrivalLines,
  goodsArrivalReversals,
  goodsArrivals,
  qualityDispositionAllocations,
  qualityDispositionReversals,
  qualityDispositions,
  qualityInspectionIssues,
  qualityInspectionReversals,
  qualityInspections,
  qualityIssueCodes,
} from "../../schema/index.ts";
import { fromIso } from "../row-mappers.ts";
import {
  dispositionSourceSummary,
  findArrivalLine,
  issueCodeDto,
  readArrival,
  readDisposition,
  readInspection,
  sourceRoot,
} from "../shared/intake-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createIntakeWriteRepositories = (tx: Tx) => ({
  qualityIssueCodes: {
    async findById(workspaceId: WorkspaceId, qualityIssueCodeId: QualityIssueCodeDto["id"]) {
      const row = (
        await tx
          .select()
          .from(qualityIssueCodes)
          .where(
            and(
              eq(qualityIssueCodes.workspaceId, workspaceId),
              eq(qualityIssueCodes.id, qualityIssueCodeId),
            ),
          )
          .limit(1)
      )[0];
      return row === undefined ? null : issueCodeDto(row);
    },
    async findByIdForUpdate(
      workspaceId: WorkspaceId,
      qualityIssueCodeId: QualityIssueCodeDto["id"],
    ) {
      const row = (
        await tx
          .select()
          .from(qualityIssueCodes)
          .where(
            and(
              eq(qualityIssueCodes.workspaceId, workspaceId),
              eq(qualityIssueCodes.id, qualityIssueCodeId),
            ),
          )
          .limit(1)
          .for("update")
      )[0];
      return row === undefined ? null : issueCodeDto(row);
    },
    async insert(code: QualityIssueCodeDto) {
      const rows = await tx
        .insert(qualityIssueCodes)
        .values({
          id: code.id,
          workspaceId: code.workspaceId,
          code: code.code,
          displayName: code.displayName,
          category: code.category,
          description: code.description,
          isActive: code.isActive,
          version: code.version,
          createdAt: fromIso(code.createdAt),
          updatedAt: fromIso(code.updatedAt),
        })
        .onConflictDoNothing()
        .returning({ id: qualityIssueCodes.id });
      return rows.length === 1;
    },
    async update(code: QualityIssueCodeDto, expectedVersion: number) {
      const rows = await tx
        .update(qualityIssueCodes)
        .set({
          code: code.code,
          displayName: code.displayName,
          category: code.category,
          description: code.description,
          isActive: code.isActive,
          version: code.version,
          updatedAt: fromIso(code.updatedAt),
        })
        .where(
          and(
            eq(qualityIssueCodes.workspaceId, code.workspaceId),
            eq(qualityIssueCodes.id, code.id),
            eq(qualityIssueCodes.version, expectedVersion),
          ),
        )
        .returning({ id: qualityIssueCodes.id });
      return rows.length === 1;
    },
  },
  goodsArrivals: {
    findById: (workspaceId: WorkspaceId, arrivalId: GoodsArrivalId) =>
      readArrival(tx, workspaceId, arrivalId),
    findByIdForUpdate: (workspaceId: WorkspaceId, arrivalId: GoodsArrivalId) =>
      readArrival(tx, workspaceId, arrivalId, true),
    findLine: (workspaceId: WorkspaceId, arrivalLineId: GoodsArrivalLineId) =>
      findArrivalLine(tx, workspaceId, arrivalLineId),
    async insert(arrival: GoodsArrivalDto) {
      const rows = await tx
        .insert(goodsArrivals)
        .values({
          id: arrival.id,
          workspaceId: arrival.workspaceId,
          supplierId: arrival.supplierId,
          purchaseId: arrival.purchaseId,
          vehicleReference: arrival.vehicleReference,
          note: arrival.note,
          evidenceReferences: [...arrival.evidenceReferences],
          transactionTime: fromIso(arrival.transactionTime),
          recordedAt: fromIso(arrival.recordedAt),
          actorId: arrival.actorId,
          commandId: arrival.commandId,
        })
        .onConflictDoNothing()
        .returning({ id: goodsArrivals.id });
      if (rows.length !== 1) return false;
      await tx.insert(goodsArrivalLines).values(
        arrival.lines.map((line) => ({
          id: line.arrivalLineId,
          workspaceId: arrival.workspaceId,
          arrivalId: arrival.id,
          purchaseId: arrival.purchaseId,
          purchaseLineId: line.purchaseLineId,
          productId: line.productId,
          productName: line.productName,
          arrivedValueScaled: line.arrivedQuantity.valueScaled,
          arrivedUnit: line.arrivedQuantity.unit,
          containerCount: line.weighing?.containerCount ?? null,
          grossWeightValueScaled: line.weighing?.grossWeight.valueScaled ?? null,
          tareWeightValueScaled: line.weighing?.tareWeight.valueScaled ?? null,
          netWeightValueScaled: line.weighing?.netWeight.valueScaled ?? null,
          weightUnit: line.weighing?.netWeight.unit ?? null,
          supplierLotCode: line.supplierLotCode,
          note: line.note,
        })),
      );
      return true;
    },
    async insertReversal(arrival: GoodsArrivalDto) {
      if (arrival.reversal === null) return false;
      const rows = await tx
        .insert(goodsArrivalReversals)
        .values({
          id: arrival.reversal.id,
          workspaceId: arrival.workspaceId,
          arrivalId: arrival.id,
          reason: arrival.reversal.reason,
          evidenceReferences: [...arrival.reversal.evidenceReferences],
          transactionTime: fromIso(arrival.reversal.transactionTime),
          recordedAt: fromIso(arrival.reversal.recordedAt),
          actorId: arrival.reversal.actorId,
          commandId: arrival.reversal.commandId,
        })
        .onConflictDoNothing()
        .returning({ id: goodsArrivalReversals.id });
      return rows.length === 1;
    },
    async downstreamFactCount(workspaceId: WorkspaceId, arrivalId: GoodsArrivalId) {
      const lineRows = await tx
        .select({ id: goodsArrivalLines.id })
        .from(goodsArrivalLines)
        .where(
          and(
            eq(goodsArrivalLines.workspaceId, workspaceId),
            eq(goodsArrivalLines.arrivalId, arrivalId),
          ),
        );
      let count = 0;
      for (const line of lineRows) {
        const [inspectionRows, dispositionRows] = await Promise.all([
          tx
            .select({ id: qualityInspections.id })
            .from(qualityInspections)
            .leftJoin(
              qualityInspectionReversals,
              and(
                eq(qualityInspectionReversals.workspaceId, qualityInspections.workspaceId),
                eq(qualityInspectionReversals.inspectionId, qualityInspections.id),
              ),
            )
            .where(
              and(
                eq(qualityInspections.workspaceId, workspaceId),
                eq(qualityInspections.arrivalLineId, line.id),
                isNull(qualityInspectionReversals.id),
              ),
            ),
          tx
            .select({ id: qualityDispositions.id })
            .from(qualityDispositions)
            .leftJoin(
              qualityDispositionReversals,
              and(
                eq(qualityDispositionReversals.workspaceId, qualityDispositions.workspaceId),
                eq(qualityDispositionReversals.dispositionId, qualityDispositions.id),
              ),
            )
            .where(
              and(
                eq(qualityDispositions.workspaceId, workspaceId),
                eq(qualityDispositions.sourceType, "arrival_line"),
                eq(qualityDispositions.sourceArrivalLineId, line.id),
                isNull(qualityDispositionReversals.id),
              ),
            ),
        ]);
        count += inspectionRows.length + dispositionRows.length;
      }
      return count;
    },
    async hasActiveForPurchase(workspaceId: WorkspaceId, purchaseId: string) {
      const row = (
        await tx
          .select({ id: goodsArrivals.id })
          .from(goodsArrivals)
          .leftJoin(
            goodsArrivalReversals,
            and(
              eq(goodsArrivalReversals.workspaceId, goodsArrivals.workspaceId),
              eq(goodsArrivalReversals.arrivalId, goodsArrivals.id),
            ),
          )
          .where(
            and(
              eq(goodsArrivals.workspaceId, workspaceId),
              eq(goodsArrivals.purchaseId, purchaseId),
              isNull(goodsArrivalReversals.id),
            ),
          )
          .limit(1)
      )[0];
      return row !== undefined;
    },
  },
  qualityInspections: {
    findById: (workspaceId: WorkspaceId, inspectionId: QualityInspectionId) =>
      readInspection(tx, workspaceId, inspectionId),
    findByIdForUpdate: (workspaceId: WorkspaceId, inspectionId: QualityInspectionId) =>
      readInspection(tx, workspaceId, inspectionId, true),
    async activeInspectedQuantity(workspaceId: WorkspaceId, arrivalLineId: GoodsArrivalLineId) {
      const rows = await tx
        .select({ inspection: qualityInspections, reversal: qualityInspectionReversals })
        .from(qualityInspections)
        .leftJoin(
          qualityInspectionReversals,
          and(
            eq(qualityInspectionReversals.workspaceId, qualityInspections.workspaceId),
            eq(qualityInspectionReversals.inspectionId, qualityInspections.id),
          ),
        )
        .where(
          and(
            eq(qualityInspections.workspaceId, workspaceId),
            eq(qualityInspections.arrivalLineId, arrivalLineId),
          ),
        );
      const active = rows.filter(({ reversal }) => reversal === null);
      if (active.length === 0) return null;
      const unit = active[0]!.inspection.inspectedUnit;
      if (active.some(({ inspection }) => inspection.inspectedUnit !== unit)) {
        throw new Error(`Arrival line ${arrivalLineId} has mixed inspection units.`);
      }
      return {
        valueScaled: active.reduce(
          (sum, { inspection }) => sum + inspection.inspectedValueScaled,
          0,
        ),
        unit,
      };
    },
    async downstreamFactCount(workspaceId: WorkspaceId, arrivalLineId: GoodsArrivalLineId) {
      const rows = await tx
        .select({ id: qualityDispositions.id })
        .from(qualityDispositions)
        .leftJoin(
          qualityDispositionReversals,
          and(
            eq(qualityDispositionReversals.workspaceId, qualityDispositions.workspaceId),
            eq(qualityDispositionReversals.dispositionId, qualityDispositions.id),
          ),
        )
        .where(
          and(
            eq(qualityDispositions.workspaceId, workspaceId),
            eq(qualityDispositions.sourceType, "arrival_line"),
            eq(qualityDispositions.sourceArrivalLineId, arrivalLineId),
            isNull(qualityDispositionReversals.id),
          ),
        );
      return rows.length;
    },
    async insert(inspection: QualityInspectionDto) {
      const rows = await tx
        .insert(qualityInspections)
        .values({
          id: inspection.id,
          workspaceId: inspection.workspaceId,
          arrivalLineId: inspection.arrivalLineId,
          inspectedValueScaled: inspection.inspectedQuantity.valueScaled,
          inspectedUnit: inspection.inspectedQuantity.unit,
          note: inspection.note,
          evidenceReferences: inspection.evidenceReferences,
          transactionTime: fromIso(inspection.transactionTime),
          recordedAt: fromIso(inspection.recordedAt),
          actorId: inspection.actorId,
          commandId: inspection.commandId,
        })
        .onConflictDoNothing()
        .returning({ id: qualityInspections.id });
      if (rows.length !== 1) return false;
      if (inspection.issues.length > 0) {
        await tx.insert(qualityInspectionIssues).values(
          inspection.issues.map((issue) => ({
            workspaceId: inspection.workspaceId,
            inspectionId: inspection.id,
            qualityIssueCodeId: issue.qualityIssueCodeId,
            qualityIssueCode: issue.qualityIssueCode,
            qualityIssueName: issue.qualityIssueName,
            severity: issue.severity,
            note: issue.note,
          })),
        );
      }
      return true;
    },
    async insertReversal(inspection: QualityInspectionDto) {
      if (inspection.reversal === null) return false;
      const rows = await tx
        .insert(qualityInspectionReversals)
        .values({
          id: inspection.reversal.id,
          workspaceId: inspection.workspaceId,
          inspectionId: inspection.id,
          reason: inspection.reversal.reason,
          transactionTime: fromIso(inspection.reversal.transactionTime),
          recordedAt: fromIso(inspection.reversal.recordedAt),
          actorId: inspection.reversal.actorId,
          commandId: inspection.reversal.commandId,
        })
        .onConflictDoNothing()
        .returning({ id: qualityInspectionReversals.id });
      return rows.length === 1;
    },
  },
  qualityDispositions: {
    findById: (workspaceId: WorkspaceId, dispositionId: QualityDispositionId) =>
      readDisposition(tx, workspaceId, dispositionId),
    findByIdForUpdate: (workspaceId: WorkspaceId, dispositionId: QualityDispositionId) =>
      readDisposition(tx, workspaceId, dispositionId, true),
    sourceSummary: (workspaceId: WorkspaceId, source: QualityDispositionDto["source"]) =>
      dispositionSourceSummary(tx, workspaceId, source),
    async downstreamFactCount(workspaceId: WorkspaceId, dispositionId: QualityDispositionId) {
      const allocations = await tx
        .select({ id: qualityDispositionAllocations.id })
        .from(qualityDispositionAllocations)
        .where(
          and(
            eq(qualityDispositionAllocations.workspaceId, workspaceId),
            eq(qualityDispositionAllocations.dispositionId, dispositionId),
            eq(qualityDispositionAllocations.outcome, "quarantined"),
          ),
        );
      let count = 0;
      for (const allocation of allocations) {
        const rows = await tx
          .select({ id: qualityDispositions.id })
          .from(qualityDispositions)
          .leftJoin(
            qualityDispositionReversals,
            and(
              eq(qualityDispositionReversals.workspaceId, qualityDispositions.workspaceId),
              eq(qualityDispositionReversals.dispositionId, qualityDispositions.id),
            ),
          )
          .where(
            and(
              eq(qualityDispositions.workspaceId, workspaceId),
              eq(qualityDispositions.sourceType, "quarantine_allocation"),
              eq(qualityDispositions.sourceQuarantineAllocationId, allocation.id),
              isNull(qualityDispositionReversals.id),
            ),
          );
        count += rows.length;
      }
      return count;
    },
    async acceptedQuantityForPurchaseLine(
      workspaceId: WorkspaceId,
      purchaseLineId: PurchaseLineId,
    ) {
      const rows = await tx
        .select({ allocation: qualityDispositionAllocations, disposition: qualityDispositions })
        .from(qualityDispositionAllocations)
        .innerJoin(
          qualityDispositions,
          and(
            eq(qualityDispositions.workspaceId, qualityDispositionAllocations.workspaceId),
            eq(qualityDispositions.id, qualityDispositionAllocations.dispositionId),
          ),
        )
        .leftJoin(
          qualityDispositionReversals,
          and(
            eq(qualityDispositionReversals.workspaceId, qualityDispositions.workspaceId),
            eq(qualityDispositionReversals.dispositionId, qualityDispositions.id),
          ),
        )
        .where(
          and(
            eq(qualityDispositionAllocations.workspaceId, workspaceId),
            eq(qualityDispositionAllocations.outcome, "accepted"),
            isNull(qualityDispositionReversals.id),
          ),
        );
      let valueScaled = 0;
      let unit: QualityDispositionDto["allocations"][number]["quantity"]["unit"] | null = null;
      for (const row of rows) {
        const root = await sourceRoot(
          tx,
          workspaceId,
          row.disposition.sourceType === "arrival_line"
            ? {
                type: "arrival_line",
                arrivalLineId: row.disposition.sourceArrivalLineId as GoodsArrivalLineId,
              }
            : {
                type: "quarantine_allocation",
                allocationId: row.disposition
                  .sourceQuarantineAllocationId as QualityDispositionDto["allocations"][number]["allocationId"],
              },
        );
        if (root === null || root.line.purchaseLineId !== purchaseLineId) continue;
        unit ??= row.allocation.unit;
        if (unit !== row.allocation.unit)
          throw new Error(`Purchase line ${purchaseLineId} has mixed accepted units.`);
        valueScaled += row.allocation.valueScaled;
      }
      return unit === null ? null : { valueScaled, unit };
    },
    async insert(disposition: QualityDispositionDto) {
      const rows = await tx
        .insert(qualityDispositions)
        .values({
          id: disposition.id,
          workspaceId: disposition.workspaceId,
          sourceType: disposition.source.type,
          sourceArrivalLineId:
            disposition.source.type === "arrival_line" ? disposition.source.arrivalLineId : null,
          sourceQuarantineAllocationId:
            disposition.source.type === "quarantine_allocation"
              ? disposition.source.allocationId
              : null,
          note: disposition.note,
          evidenceReferences: [...disposition.evidenceReferences],
          transactionTime: fromIso(disposition.transactionTime),
          recordedAt: fromIso(disposition.recordedAt),
          actorId: disposition.actorId,
          commandId: disposition.commandId,
        })
        .onConflictDoNothing()
        .returning({ id: qualityDispositions.id });
      if (rows.length !== 1) return false;
      await tx.insert(qualityDispositionAllocations).values(
        disposition.allocations.map((allocation) => ({
          id: allocation.allocationId,
          workspaceId: disposition.workspaceId,
          dispositionId: disposition.id,
          outcome: allocation.outcome,
          valueScaled: allocation.quantity.valueScaled,
          unit: allocation.quantity.unit,
          qualityGradeId: allocation.qualityGradeId,
          qualityGradeName: allocation.qualityGradeName,
          note: allocation.note,
        })),
      );
      return true;
    },
    async insertReversal(disposition: QualityDispositionDto) {
      if (disposition.reversal === null) return false;
      const rows = await tx
        .insert(qualityDispositionReversals)
        .values({
          id: disposition.reversal.id,
          workspaceId: disposition.workspaceId,
          dispositionId: disposition.id,
          reason: disposition.reversal.reason,
          evidenceReferences: [...disposition.reversal.evidenceReferences],
          transactionTime: fromIso(disposition.reversal.transactionTime),
          recordedAt: fromIso(disposition.reversal.recordedAt),
          actorId: disposition.reversal.actorId,
          commandId: disposition.reversal.commandId,
        })
        .onConflictDoNothing()
        .returning({ id: qualityDispositionReversals.id });
      return rows.length === 1;
    },
  },
});

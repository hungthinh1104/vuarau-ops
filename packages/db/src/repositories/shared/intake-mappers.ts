import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type {
  GoodsArrivalDto,
  GoodsArrivalId,
  GoodsArrivalLineId,
  QualityDispositionDto,
  QualityDispositionId,
  QualityDispositionSource,
  QualityDispositionSourceSummaryDto,
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
} from "../../schema/index.ts";
import type { qualityIssueCodes as QualityIssueCodesTable } from "../../schema/index.ts";
import { toIso } from "../row-mappers.ts";
import { persistedBigintToSafeNumber } from "../../schema/safe-bigint.ts";
import type { Tx } from "./types.ts";

export const issueCodeDto = (
  row: typeof QualityIssueCodesTable.$inferSelect,
): QualityIssueCodeDto => ({
  id: row.id as QualityIssueCodeDto["id"],
  workspaceId: row.workspaceId as WorkspaceId,
  code: row.code,
  displayName: row.displayName,
  category: row.category,
  description: row.description,
  isActive: row.isActive,
  version: row.version,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

type GoodsArrivalRow = typeof goodsArrivals.$inferSelect;
type GoodsArrivalLineRow = typeof goodsArrivalLines.$inferSelect;
type GoodsArrivalReversalRow = typeof goodsArrivalReversals.$inferSelect;
type QualityInspectionRow = typeof qualityInspections.$inferSelect;
type QualityInspectionIssueRow = typeof qualityInspectionIssues.$inferSelect;
type QualityInspectionReversalRow = typeof qualityInspectionReversals.$inferSelect;
type QualityDispositionRow = typeof qualityDispositions.$inferSelect;
type QualityDispositionAllocationRow = typeof qualityDispositionAllocations.$inferSelect;
type QualityDispositionReversalRow = typeof qualityDispositionReversals.$inferSelect;

function mapArrival(
  row: GoodsArrivalRow,
  lines: readonly GoodsArrivalLineRow[],
  reversalRow: GoodsArrivalReversalRow | undefined,
): GoodsArrivalDto {
  return {
    id: row.id as GoodsArrivalDto["id"],
    workspaceId: row.workspaceId as WorkspaceId,
    supplierId: row.supplierId as GoodsArrivalDto["supplierId"],
    purchaseId: row.purchaseId as GoodsArrivalDto["purchaseId"],
    vehicleReference: row.vehicleReference,
    evidenceReferences: row.evidenceReferences ?? [],
    lines: lines.map((line) => ({
      arrivalLineId: line.id as GoodsArrivalDto["lines"][number]["arrivalLineId"],
      purchaseLineId: line.purchaseLineId as GoodsArrivalDto["lines"][number]["purchaseLineId"],
      productId: line.productId as GoodsArrivalDto["lines"][number]["productId"],
      productName: line.productName,
      arrivedQuantity: { valueScaled: line.arrivedValueScaled, unit: line.arrivedUnit },
      weighing:
        line.grossWeightValueScaled === null ||
        line.tareWeightValueScaled === null ||
        line.netWeightValueScaled === null ||
        line.weightUnit === null
          ? null
          : {
              containerCount: line.containerCount,
              grossWeight: { valueScaled: line.grossWeightValueScaled, unit: line.weightUnit },
              tareWeight: { valueScaled: line.tareWeightValueScaled, unit: line.weightUnit },
              netWeight: { valueScaled: line.netWeightValueScaled, unit: line.weightUnit },
            },
      supplierLotCode: line.supplierLotCode,
      note: line.note,
    })),
    note: row.note,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    actorId: row.actorId as GoodsArrivalDto["actorId"],
    commandId: row.commandId as GoodsArrivalDto["commandId"],
    reversal:
      reversalRow === undefined
        ? null
        : {
            id: reversalRow.id as NonNullable<GoodsArrivalDto["reversal"]>["id"],
            reason: reversalRow.reason,
            transactionTime: toIso(reversalRow.transactionTime),
            recordedAt: toIso(reversalRow.recordedAt),
            actorId: reversalRow.actorId as NonNullable<GoodsArrivalDto["reversal"]>["actorId"],
            commandId: reversalRow.commandId as NonNullable<
              GoodsArrivalDto["reversal"]
            >["commandId"],
            evidenceReferences: reversalRow.evidenceReferences ?? [],
          },
  };
}

export async function readArrivals(
  tx: Tx,
  workspaceId: WorkspaceId,
  arrivalIds: readonly GoodsArrivalId[],
  lock = false,
): Promise<readonly GoodsArrivalDto[]> {
  if (arrivalIds.length === 0) return [];
  const query = tx
    .select()
    .from(goodsArrivals)
    .where(and(eq(goodsArrivals.workspaceId, workspaceId), inArray(goodsArrivals.id, arrivalIds)));
  const rows = lock ? await query.for("update") : await query;
  if (rows.length === 0) return [];
  const [lineRows, reversalRows] = await Promise.all([
    tx
      .select()
      .from(goodsArrivalLines)
      .where(
        and(
          eq(goodsArrivalLines.workspaceId, workspaceId),
          inArray(
            goodsArrivalLines.arrivalId,
            rows.map((row) => row.id),
          ),
        ),
      )
      .orderBy(asc(goodsArrivalLines.arrivalId), asc(goodsArrivalLines.id)),
    tx
      .select()
      .from(goodsArrivalReversals)
      .where(
        and(
          eq(goodsArrivalReversals.workspaceId, workspaceId),
          inArray(
            goodsArrivalReversals.arrivalId,
            rows.map((row) => row.id),
          ),
        ),
      ),
  ]);
  const linesByArrival = new Map<string, GoodsArrivalLineRow[]>();
  for (const line of lineRows) {
    const lines = linesByArrival.get(line.arrivalId) ?? [];
    lines.push(line);
    linesByArrival.set(line.arrivalId, lines);
  }
  const reversalByArrival = new Map<string, GoodsArrivalReversalRow>();
  for (const reversal of reversalRows) reversalByArrival.set(reversal.arrivalId, reversal);
  return rows.map((row) =>
    mapArrival(row, linesByArrival.get(row.id) ?? [], reversalByArrival.get(row.id)),
  );
}

export async function readArrival(
  tx: Tx,
  workspaceId: WorkspaceId,
  arrivalId: GoodsArrivalId,
  lock = false,
): Promise<GoodsArrivalDto | null> {
  return (await readArrivals(tx, workspaceId, [arrivalId], lock))[0] ?? null;
}

export async function findArrivalLine(
  tx: Tx,
  workspaceId: WorkspaceId,
  arrivalLineId: GoodsArrivalLineId,
  lock = false,
): Promise<{ arrival: GoodsArrivalDto; line: GoodsArrivalDto["lines"][number] } | null> {
  const query = tx
    .select({ arrivalId: goodsArrivalLines.arrivalId })
    .from(goodsArrivalLines)
    .where(
      and(eq(goodsArrivalLines.workspaceId, workspaceId), eq(goodsArrivalLines.id, arrivalLineId)),
    )
    .limit(1);
  const line = (lock ? await query.for("update") : await query)[0];
  if (line === undefined) return null;
  const arrival = await readArrival(tx, workspaceId, line.arrivalId as GoodsArrivalId, lock);
  const found = arrival?.lines.find((candidate) => candidate.arrivalLineId === arrivalLineId);
  return arrival === null || found === undefined ? null : { arrival, line: found };
}

function mapInspection(
  row: QualityInspectionRow,
  issues: readonly QualityInspectionIssueRow[],
  reversal: QualityInspectionReversalRow | undefined,
): QualityInspectionDto {
  return {
    id: row.id as QualityInspectionDto["id"],
    workspaceId: row.workspaceId as WorkspaceId,
    arrivalLineId: row.arrivalLineId as QualityInspectionDto["arrivalLineId"],
    inspectedQuantity: { valueScaled: row.inspectedValueScaled, unit: row.inspectedUnit },
    issues: issues.map((issue) => ({
      qualityIssueCodeId:
        issue.qualityIssueCodeId as QualityInspectionDto["issues"][number]["qualityIssueCodeId"],
      qualityIssueCode: issue.qualityIssueCode,
      qualityIssueName: issue.qualityIssueName,
      severity: issue.severity,
      note: issue.note,
    })),
    note: row.note,
    evidenceReferences: row.evidenceReferences,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    actorId: row.actorId as QualityInspectionDto["actorId"],
    commandId: row.commandId as QualityInspectionDto["commandId"],
    reversal:
      reversal === undefined
        ? null
        : {
            id: reversal.id as NonNullable<QualityInspectionDto["reversal"]>["id"],
            reason: reversal.reason,
            transactionTime: toIso(reversal.transactionTime),
            recordedAt: toIso(reversal.recordedAt),
            actorId: reversal.actorId as NonNullable<QualityInspectionDto["reversal"]>["actorId"],
            commandId: reversal.commandId as NonNullable<
              QualityInspectionDto["reversal"]
            >["commandId"],
          },
  };
}

export async function readInspections(
  tx: Tx,
  workspaceId: WorkspaceId,
  inspectionIds: readonly QualityInspectionId[],
  lock = false,
): Promise<readonly QualityInspectionDto[]> {
  if (inspectionIds.length === 0) return [];
  const query = tx
    .select()
    .from(qualityInspections)
    .where(
      and(
        eq(qualityInspections.workspaceId, workspaceId),
        inArray(qualityInspections.id, inspectionIds),
      ),
    );
  const rows = lock ? await query.for("update") : await query;
  if (rows.length === 0) return [];
  const [issueRows, reversalRows] = await Promise.all([
    tx
      .select()
      .from(qualityInspectionIssues)
      .where(
        and(
          eq(qualityInspectionIssues.workspaceId, workspaceId),
          inArray(
            qualityInspectionIssues.inspectionId,
            rows.map((row) => row.id),
          ),
        ),
      )
      .orderBy(
        asc(qualityInspectionIssues.inspectionId),
        asc(qualityInspectionIssues.qualityIssueCode),
      ),
    tx
      .select()
      .from(qualityInspectionReversals)
      .where(
        and(
          eq(qualityInspectionReversals.workspaceId, workspaceId),
          inArray(
            qualityInspectionReversals.inspectionId,
            rows.map((row) => row.id),
          ),
        ),
      ),
  ]);
  const issuesByInspection = new Map<string, QualityInspectionIssueRow[]>();
  for (const issue of issueRows) {
    const issues = issuesByInspection.get(issue.inspectionId) ?? [];
    issues.push(issue);
    issuesByInspection.set(issue.inspectionId, issues);
  }
  const reversalByInspection = new Map<string, QualityInspectionReversalRow>();
  for (const reversal of reversalRows) reversalByInspection.set(reversal.inspectionId, reversal);
  return rows.map((row) =>
    mapInspection(row, issuesByInspection.get(row.id) ?? [], reversalByInspection.get(row.id)),
  );
}

export async function readInspection(
  tx: Tx,
  workspaceId: WorkspaceId,
  inspectionId: QualityInspectionId,
  lock = false,
): Promise<QualityInspectionDto | null> {
  return (await readInspections(tx, workspaceId, [inspectionId], lock))[0] ?? null;
}

const sourceFromRow = (row: typeof qualityDispositions.$inferSelect): QualityDispositionSource =>
  row.sourceType === "arrival_line"
    ? {
        type: "arrival_line",
        arrivalLineId: row.sourceArrivalLineId as Extract<
          QualityDispositionSource,
          { type: "arrival_line" }
        >["arrivalLineId"],
      }
    : {
        type: "quarantine_allocation",
        allocationId: row.sourceQuarantineAllocationId as Extract<
          QualityDispositionSource,
          { type: "quarantine_allocation" }
        >["allocationId"],
      };

function mapDisposition(
  row: QualityDispositionRow,
  allocations: readonly QualityDispositionAllocationRow[],
  reversal: QualityDispositionReversalRow | undefined,
): QualityDispositionDto {
  return {
    id: row.id as QualityDispositionDto["id"],
    workspaceId: row.workspaceId as WorkspaceId,
    source: sourceFromRow(row),
    allocations: allocations.map((allocation) => ({
      allocationId: allocation.id as QualityDispositionDto["allocations"][number]["allocationId"],
      outcome: allocation.outcome,
      quantity: { valueScaled: allocation.valueScaled, unit: allocation.unit },
      qualityGradeId:
        allocation.qualityGradeId as QualityDispositionDto["allocations"][number]["qualityGradeId"],
      qualityGradeName: allocation.qualityGradeName,
      note: allocation.note,
    })),
    note: row.note,
    evidenceReferences: row.evidenceReferences ?? [],
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    actorId: row.actorId as QualityDispositionDto["actorId"],
    commandId: row.commandId as QualityDispositionDto["commandId"],
    reversal:
      reversal === undefined
        ? null
        : {
            id: reversal.id as NonNullable<QualityDispositionDto["reversal"]>["id"],
            reason: reversal.reason,
            transactionTime: toIso(reversal.transactionTime),
            recordedAt: toIso(reversal.recordedAt),
            actorId: reversal.actorId as NonNullable<QualityDispositionDto["reversal"]>["actorId"],
            commandId: reversal.commandId as NonNullable<
              QualityDispositionDto["reversal"]
            >["commandId"],
            evidenceReferences: reversal.evidenceReferences ?? [],
          },
  };
}

export async function readDispositions(
  tx: Tx,
  workspaceId: WorkspaceId,
  dispositionIds: readonly QualityDispositionId[],
  lock = false,
): Promise<readonly QualityDispositionDto[]> {
  if (dispositionIds.length === 0) return [];
  const query = tx
    .select()
    .from(qualityDispositions)
    .where(
      and(
        eq(qualityDispositions.workspaceId, workspaceId),
        inArray(qualityDispositions.id, dispositionIds),
      ),
    );
  const rows = lock ? await query.for("update") : await query;
  if (rows.length === 0) return [];
  const [allocationRows, reversalRows] = await Promise.all([
    tx
      .select()
      .from(qualityDispositionAllocations)
      .where(
        and(
          eq(qualityDispositionAllocations.workspaceId, workspaceId),
          inArray(
            qualityDispositionAllocations.dispositionId,
            rows.map((row) => row.id),
          ),
        ),
      )
      .orderBy(
        asc(qualityDispositionAllocations.dispositionId),
        asc(qualityDispositionAllocations.id),
      ),
    tx
      .select()
      .from(qualityDispositionReversals)
      .where(
        and(
          eq(qualityDispositionReversals.workspaceId, workspaceId),
          inArray(
            qualityDispositionReversals.dispositionId,
            rows.map((row) => row.id),
          ),
        ),
      ),
  ]);
  const allocationsByDisposition = new Map<string, QualityDispositionAllocationRow[]>();
  for (const allocation of allocationRows) {
    const allocations = allocationsByDisposition.get(allocation.dispositionId) ?? [];
    allocations.push(allocation);
    allocationsByDisposition.set(allocation.dispositionId, allocations);
  }
  const reversalByDisposition = new Map<string, QualityDispositionReversalRow>();
  for (const reversal of reversalRows) reversalByDisposition.set(reversal.dispositionId, reversal);
  return rows.map((row) =>
    mapDisposition(
      row,
      allocationsByDisposition.get(row.id) ?? [],
      reversalByDisposition.get(row.id),
    ),
  );
}

export async function readDisposition(
  tx: Tx,
  workspaceId: WorkspaceId,
  dispositionId: QualityDispositionId,
  lock = false,
): Promise<QualityDispositionDto | null> {
  return (await readDispositions(tx, workspaceId, [dispositionId], lock))[0] ?? null;
}

type SourceRoot = {
  arrival: GoodsArrivalDto;
  line: GoodsArrivalDto["lines"][number];
  quantity: GoodsArrivalDto["lines"][number]["arrivedQuantity"];
  active: boolean;
};

export async function sourceRoot(
  tx: Tx,
  workspaceId: WorkspaceId,
  source: QualityDispositionSource,
  seen = new Set<string>(),
  lock = false,
): Promise<SourceRoot | null> {
  const sourceKey =
    source.type === "arrival_line"
      ? `line:${source.arrivalLineId}`
      : `allocation:${source.allocationId}`;
  if (seen.has(sourceKey) || seen.size > 100) return null;
  seen.add(sourceKey);
  if (source.type === "arrival_line") {
    const found = await findArrivalLine(tx, workspaceId, source.arrivalLineId, lock);
    return found === null
      ? null
      : {
          ...found,
          quantity: found.line.arrivedQuantity,
          active: found.arrival.reversal === null,
        };
  }
  const allocationQuery = tx
    .select({ allocation: qualityDispositionAllocations, disposition: qualityDispositions })
    .from(qualityDispositionAllocations)
    .innerJoin(
      qualityDispositions,
      and(
        eq(qualityDispositions.workspaceId, qualityDispositionAllocations.workspaceId),
        eq(qualityDispositions.id, qualityDispositionAllocations.dispositionId),
      ),
    )
    .where(
      and(
        eq(qualityDispositionAllocations.workspaceId, workspaceId),
        eq(qualityDispositionAllocations.id, source.allocationId),
        eq(qualityDispositionAllocations.outcome, "quarantined"),
      ),
    )
    .limit(1);
  const allocation = (lock ? await allocationQuery.for("update") : await allocationQuery)[0];
  if (allocation === undefined) return null;
  const parent = await sourceRoot(
    tx,
    workspaceId,
    sourceFromRow(allocation.disposition),
    seen,
    lock,
  );
  if (parent === null) return null;
  const reversed = (
    await tx
      .select({ id: qualityDispositionReversals.id })
      .from(qualityDispositionReversals)
      .where(
        and(
          eq(qualityDispositionReversals.workspaceId, workspaceId),
          eq(qualityDispositionReversals.dispositionId, allocation.disposition.id),
        ),
      )
      .limit(1)
  )[0];
  return {
    ...parent,
    quantity: {
      valueScaled: allocation.allocation.valueScaled,
      unit: allocation.allocation.unit,
    },
    active: parent.active && reversed === undefined,
  };
}

export async function dispositionSourceSummary(
  tx: Tx,
  workspaceId: WorkspaceId,
  source: QualityDispositionSource,
  lock = false,
): Promise<{ summary: QualityDispositionSourceSummaryDto; active: boolean } | null> {
  const root = await sourceRoot(tx, workspaceId, source, new Set<string>(), lock);
  if (root === null) return null;
  const sourceFilter =
    source.type === "arrival_line"
      ? and(
          eq(qualityDispositions.sourceType, "arrival_line"),
          eq(qualityDispositions.sourceArrivalLineId, source.arrivalLineId),
        )
      : and(
          eq(qualityDispositions.sourceType, "quarantine_allocation"),
          eq(qualityDispositions.sourceQuarantineAllocationId, source.allocationId),
        );
  const allocatedRow = (
    await tx
      .select({
        total: sql<number>`coalesce(sum(${qualityDispositionAllocations.valueScaled}), 0)`,
      })
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
          eq(qualityDispositions.workspaceId, workspaceId),
          sourceFilter,
          isNull(qualityDispositionReversals.id),
        ),
      )
  )[0];
  const allocated = persistedBigintToSafeNumber(
    allocatedRow?.total ?? 0,
    "quality disposition allocated quantity",
  );
  let inspected: number | null = null;
  if (source.type === "arrival_line") {
    const inspectionRow = (
      await tx
        .select({
          total: sql<number>`coalesce(sum(${qualityInspections.inspectedValueScaled}), 0)`,
        })
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
            eq(qualityInspections.arrivalLineId, source.arrivalLineId),
            isNull(qualityInspectionReversals.id),
          ),
        )
    )[0];
    inspected = persistedBigintToSafeNumber(
      inspectionRow?.total ?? 0,
      "quality inspection quantity",
    );
  }
  const remaining = root.quantity.valueScaled - allocated;
  const eligible =
    inspected === null
      ? remaining
      : Math.max(0, Math.min(root.quantity.valueScaled, inspected) - allocated);
  return {
    active: root.active,
    summary: {
      source,
      sourceQuantity: root.quantity,
      allocatedQuantity: { valueScaled: allocated, unit: root.quantity.unit },
      remainingQuantity: { valueScaled: remaining, unit: root.quantity.unit },
      inspectedQuantity:
        inspected === null ? null : { valueScaled: inspected, unit: root.quantity.unit },
      eligibleQuantity: { valueScaled: eligible, unit: root.quantity.unit },
      productId: root.line.productId,
      productName: root.line.productName,
      purchaseId: root.arrival.purchaseId,
      purchaseLineId: root.line.purchaseLineId,
      supplierId: root.arrival.supplierId,
    },
  };
}

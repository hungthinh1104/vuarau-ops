import { and, asc, eq } from "drizzle-orm";
import type { SupplyCommitmentState } from "@vuarau/domain-kernel";
import { supplyCommitmentLines, supplyCommitments } from "../../schema/index.ts";
import { toIso, toIsoOrNull } from "../row-mappers.ts";
import type { Tx } from "./types.ts";

export type SupplyCommitmentRow = typeof supplyCommitments.$inferSelect;
export type SupplyCommitmentLineRow = typeof supplyCommitmentLines.$inferSelect;

export function mapSupplyCommitmentRows(
  rows: readonly SupplyCommitmentRow[],
  lineRows: readonly SupplyCommitmentLineRow[],
): SupplyCommitmentState[] {
  return rows.map((row) => {
    const lines = lineRows
      .filter((line) => line.supplyCommitmentId === row.id)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((line) => ({
        lineId: line.id,
        productId: line.productId,
        qualityGradeId: line.qualityGradeId,
        productName: line.productName,
        quantity: { valueScaled: line.quantityScaled, unit: line.unit },
        agreedUnitPrice:
          line.agreedUnitPriceMinor === null
            ? null
            : { amountMinor: line.agreedUnitPriceMinor, currency: line.currency },
        lineTotal:
          line.lineTotalMinor === null
            ? null
            : { amountMinor: line.lineTotalMinor, currency: line.currency },
      }));
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      supplierId: row.supplierId,
      status: row.status,
      currency: row.currency,
      lines,
      totalAmount:
        row.totalAmountMinor === null
          ? null
          : { amountMinor: row.totalAmountMinor, currency: row.currency },
      expectedArrivalAt: toIsoOrNull(row.expectedArrivalAt),
      paymentTermsSnapshot:
        row.paymentTermsLabel === null
          ? null
          : { label: row.paymentTermsLabel, dueAt: toIsoOrNull(row.paymentTermsDueAt) },
      note: row.note,
      evidenceReferences: row.evidenceReferences ?? [],
      version: row.version,
      transactionTime: toIso(row.transactionTime),
      recordedAt: toIso(row.recordedAt),
      confirmedAt: toIsoOrNull(row.confirmedAt),
      cancelledAt: toIsoOrNull(row.cancelledAt),
      cancellationReason: row.cancellationReason,
      replacesSupplyCommitmentId: row.replacesSupplyCommitmentId,
    } as unknown as SupplyCommitmentState;
  });
}

export async function loadSupplyCommitment(
  tx: Tx,
  workspaceId: string,
  id: string,
): Promise<SupplyCommitmentState | null> {
  const rows = await tx
    .select()
    .from(supplyCommitments)
    .where(and(eq(supplyCommitments.workspaceId, workspaceId), eq(supplyCommitments.id, id)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  const lines = await tx
    .select()
    .from(supplyCommitmentLines)
    .where(
      and(
        eq(supplyCommitmentLines.workspaceId, workspaceId),
        eq(supplyCommitmentLines.supplyCommitmentId, id),
      ),
    )
    .orderBy(asc(supplyCommitmentLines.id));
  return mapSupplyCommitmentRows([row], lines)[0] ?? null;
}

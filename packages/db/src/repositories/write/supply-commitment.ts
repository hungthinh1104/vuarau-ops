import { and, eq } from "drizzle-orm";
import type { SupplyCommitmentState } from "@vuarau/domain-kernel";
import { supplyCommitmentLines, supplyCommitments } from "../../schema/index.ts";
import { fromIso, fromIsoOrNull } from "../row-mappers.ts";
import { loadSupplyCommitment } from "../shared/supply-commitment-mappers.ts";
import type { Tx } from "../shared/types.ts";

function lineValues(commitment: SupplyCommitmentState) {
  return commitment.lines.map((line) => ({
    id: line.lineId,
    workspaceId: commitment.workspaceId,
    supplyCommitmentId: commitment.id,
    productId: line.productId,
    qualityGradeId: line.qualityGradeId,
    productName: line.productName,
    quantityScaled: line.quantity.valueScaled,
    unit: line.quantity.unit,
    agreedUnitPriceMinor: line.agreedUnitPrice?.amountMinor ?? null,
    lineTotalMinor: line.lineTotal?.amountMinor ?? null,
    currency: commitment.currency,
  }));
}

export const createSupplyCommitmentWriteRepositories = (tx: Tx) => ({
  supplyCommitments: {
    findById: (workspaceId: string, id: string) => loadSupplyCommitment(tx, workspaceId, id),
    findByIdForUpdate: async (workspaceId: string, id: string) => {
      await tx
        .select({ id: supplyCommitments.id })
        .from(supplyCommitments)
        .where(and(eq(supplyCommitments.workspaceId, workspaceId), eq(supplyCommitments.id, id)))
        .limit(1)
        .for("update");
      return loadSupplyCommitment(tx, workspaceId, id);
    },
    async findReplacementOf(workspaceId: string, id: string) {
      const rows = await tx
        .select({ id: supplyCommitments.id })
        .from(supplyCommitments)
        .where(
          and(
            eq(supplyCommitments.workspaceId, workspaceId),
            eq(supplyCommitments.replacesSupplyCommitmentId, id),
          ),
        )
        .limit(1);
      return rows[0] === undefined ? null : loadSupplyCommitment(tx, workspaceId, rows[0].id);
    },
    async insert(commitment: SupplyCommitmentState) {
      const inserted = await tx
        .insert(supplyCommitments)
        .values({
          id: commitment.id,
          workspaceId: commitment.workspaceId,
          supplierId: commitment.supplierId,
          status: commitment.status,
          currency: commitment.currency,
          totalAmountMinor: commitment.totalAmount?.amountMinor ?? null,
          expectedArrivalAt: fromIsoOrNull(commitment.expectedArrivalAt),
          paymentTermsLabel: commitment.paymentTermsSnapshot?.label ?? null,
          paymentTermsDueAt: fromIsoOrNull(commitment.paymentTermsSnapshot?.dueAt ?? null),
          note: commitment.note,
          evidenceReferences: [...commitment.evidenceReferences],
          version: commitment.version,
          transactionTime: fromIso(commitment.transactionTime),
          recordedAt: fromIso(commitment.recordedAt),
          confirmedAt: fromIsoOrNull(commitment.confirmedAt),
          cancelledAt: fromIsoOrNull(commitment.cancelledAt),
          cancellationReason: commitment.cancellationReason,
          replacesSupplyCommitmentId: commitment.replacesSupplyCommitmentId,
        })
        .onConflictDoNothing()
        .returning({ id: supplyCommitments.id });
      if (inserted.length === 0) return false;
      if (commitment.lines.length > 0)
        await tx.insert(supplyCommitmentLines).values(lineValues(commitment));
      return true;
    },
    async updateDraft(commitment: SupplyCommitmentState, expectedVersion: number) {
      const rows = await tx
        .update(supplyCommitments)
        .set({
          supplierId: commitment.supplierId,
          currency: commitment.currency,
          totalAmountMinor: commitment.totalAmount?.amountMinor ?? null,
          expectedArrivalAt: fromIsoOrNull(commitment.expectedArrivalAt),
          paymentTermsLabel: commitment.paymentTermsSnapshot?.label ?? null,
          paymentTermsDueAt: fromIsoOrNull(commitment.paymentTermsSnapshot?.dueAt ?? null),
          note: commitment.note,
          evidenceReferences: [...commitment.evidenceReferences],
          version: commitment.version,
        })
        .where(
          and(
            eq(supplyCommitments.workspaceId, commitment.workspaceId),
            eq(supplyCommitments.id, commitment.id),
            eq(supplyCommitments.version, expectedVersion),
          ),
        )
        .returning({ id: supplyCommitments.id });
      if (rows.length !== 1) return false;
      await tx
        .delete(supplyCommitmentLines)
        .where(
          and(
            eq(supplyCommitmentLines.workspaceId, commitment.workspaceId),
            eq(supplyCommitmentLines.supplyCommitmentId, commitment.id),
          ),
        );
      if (commitment.lines.length > 0)
        await tx.insert(supplyCommitmentLines).values(lineValues(commitment));
      return true;
    },
    async confirm(commitment: SupplyCommitmentState, expectedVersion: number) {
      const rows = await tx
        .update(supplyCommitments)
        .set({
          status: commitment.status,
          totalAmountMinor: commitment.totalAmount?.amountMinor ?? null,
          version: commitment.version,
          confirmedAt: fromIsoOrNull(commitment.confirmedAt),
        })
        .where(
          and(
            eq(supplyCommitments.workspaceId, commitment.workspaceId),
            eq(supplyCommitments.id, commitment.id),
            eq(supplyCommitments.version, expectedVersion),
            eq(supplyCommitments.status, "draft"),
          ),
        )
        .returning({ id: supplyCommitments.id });
      return rows.length === 1;
    },
    async cancel(commitment: SupplyCommitmentState, expectedVersion: number) {
      const rows = await tx
        .update(supplyCommitments)
        .set({
          status: commitment.status,
          version: commitment.version,
          cancelledAt: fromIsoOrNull(commitment.cancelledAt),
          cancellationReason: commitment.cancellationReason,
        })
        .where(
          and(
            eq(supplyCommitments.workspaceId, commitment.workspaceId),
            eq(supplyCommitments.id, commitment.id),
            eq(supplyCommitments.version, expectedVersion),
          ),
        )
        .returning({ id: supplyCommitments.id });
      return rows.length === 1;
    },
  },
});

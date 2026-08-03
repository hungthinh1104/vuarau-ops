import type { Repositories } from "../../ports.ts";
import type { InventoryValuationMovement } from "@vuarau/domain-kernel";
import { key, takePage } from "../store.ts";
import type { Store } from "../store.ts";
import { intakeSourceRoot } from "../repositories/intake.ts";

export const createInventoryReads = (store: Store): Pick<Repositories, "inventoryReads"> => ({
  inventoryReads: {
    receipt: async (workspaceId, receiptId) => {
      const row = store.purchaseReceipts.get(key(workspaceId, receiptId));
      return row === undefined
        ? null
        : {
            ...row,
            evidenceReferences: [...(row.evidenceReferences ?? [])],
            lines: row.lines.map((line) => ({ ...line })),
            reversal:
              row.reversal === null
                ? null
                : {
                    id: row.reversal.id,
                    reasonCode: row.reversal.reasonCode,
                    reason: row.reversal.reason,
                    transactionTime: row.reversal.transactionTime,
                    recordedAt: row.reversal.recordedAt,
                    evidenceReferences: [...(row.reversal.evidenceReferences ?? [])],
                  },
          };
    },
    receipts: async (workspaceId, purchaseId) =>
      [...store.purchaseReceipts.values()]
        .filter((row) => row.workspaceId === workspaceId && row.purchaseId === purchaseId)
        .map((row) => ({
          ...row,
          evidenceReferences: [...(row.evidenceReferences ?? [])],
          lines: row.lines.map((line) => ({ ...line })),
          reversal:
            row.reversal === null
              ? null
              : {
                  id: row.reversal.id,
                  reasonCode: row.reversal.reasonCode,
                  reason: row.reversal.reason,
                  transactionTime: row.reversal.transactionTime,
                  recordedAt: row.reversal.recordedAt,
                  evidenceReferences: [...(row.reversal.evidenceReferences ?? [])],
                },
        })),
    adjustment: async (workspaceId, adjustmentId) => {
      const row = store.inventoryMovements.find(
        (movement) =>
          movement.workspaceId === workspaceId &&
          movement.sourceType === "inventory_adjustment" &&
          movement.sourceId === adjustmentId,
      );
      return row === undefined
        ? null
        : {
            ...row,
            sourceDocument: { type: "inventory_adjustment" as const, id: row.sourceId },
          };
    },
    balances: async (workspaceId, productId) =>
      [...store.inventoryBalances.values()]
        .filter((row) => row.workspaceId === workspaceId && row.productId === productId)
        .map((row) => ({
          ...row,
          qualityGradeName:
            row.qualityGradeId === null
              ? null
              : (store.qualityGrades.get(key(workspaceId, row.qualityGradeId))?.name ?? null),
          classification:
            row.quantityScaled > 0
              ? ("positive" as const)
              : row.quantityScaled < 0
                ? ("negative" as const)
                : ("zero" as const),
        })),
    valuationSources: async ({ workspaceId, productId, qualityGradeId, unit, asOf }) => {
      const unitCost = (movement: (typeof store.inventoryMovements)[number]) => {
        if (
          movement.sourceType !== "purchase_receipt" &&
          movement.sourceType !== "purchase_receipt_reversal"
        )
          return null;
        const receipt =
          movement.sourceType === "purchase_receipt"
            ? store.purchaseReceipts.get(key(workspaceId, movement.sourceId))
            : [...store.purchaseReceipts.values()].find(
                (candidate) =>
                  candidate.workspaceId === workspaceId &&
                  candidate.reversal?.id === movement.sourceId,
              );
        const receiptLine = receipt?.lines.find(
          (line) => line.receiptLineId === movement.sourceLineId,
        );
        const purchase =
          receipt === undefined
            ? undefined
            : store.purchases.get(key(workspaceId, receipt.purchaseId));
        return (
          purchase?.lines.find((line) => line.lineId === receiptLine?.purchaseLineId)?.unitPrice ??
          null
        );
      };
      return store.inventoryMovements
        .filter(
          (movement) =>
            movement.workspaceId === workspaceId &&
            movement.productId === productId &&
            (qualityGradeId === null || movement.qualityGradeId === qualityGradeId) &&
            (unit === null || movement.quantity.unit === unit) &&
            movement.transactionTime <= asOf,
        )
        .map(
          (movement) =>
            ({
              movementId: movement.id,
              qualityGradeId: movement.qualityGradeId,
              unit: movement.quantity.unit,
              quantityScaled: movement.quantity.valueScaled,
              sourceType: movement.sourceType,
              sourceId: movement.sourceId,
              sourceLineId: movement.sourceLineId,
              reversalOfMovementId: movement.reversalOfMovementId,
              transactionTime: movement.transactionTime,
              recordedAt: movement.recordedAt,
              unitCost: unitCost(movement),
            }) satisfies InventoryValuationMovement,
        );
    },
    timeline: async ({ workspaceId, productId, qualityGradeId, unit, page }) => {
      const rows = store.inventoryMovements
        .filter(
          (row) =>
            row.workspaceId === workspaceId &&
            row.productId === productId &&
            (qualityGradeId === undefined || row.qualityGradeId === qualityGradeId) &&
            (unit === null || row.quantity.unit === unit),
        )
        .sort((a, b) =>
          a.transactionTime !== b.transactionTime
            ? b.transactionTime.localeCompare(a.transactionTime)
            : a.recordedAt !== b.recordedAt
              ? b.recordedAt.localeCompare(a.recordedAt)
              : b.id.localeCompare(a.id),
        )
        .filter((row) => {
          if (page.after === null) return true;
          const sort = `${row.transactionTime}|${row.recordedAt}`;
          return (
            sort < page.after.sortValue || (sort === page.after.sortValue && row.id < page.after.id)
          );
        });
      return takePage(
        rows.map((row) => ({
          ...row,
          sourceDocument:
            row.sourceType === "inventory_adjustment"
              ? { type: "inventory_adjustment" as const, id: row.sourceId }
              : row.sourceType === "inventory_reclassification"
                ? { type: "inventory_reclassification" as const, id: row.sourceId }
                : row.sourceType === "delivery_dispatch"
                  ? { type: "delivery" as const, id: row.sourceId }
                  : row.sourceType === "delivery_return"
                    ? {
                        type: "delivery" as const,
                        id:
                          store.deliveryReturns.find((returned) => returned.id === row.sourceId)
                            ?.deliveryId ?? row.sourceId,
                      }
                    : row.sourceType === "quality_disposition"
                      ? { type: "quality_disposition" as const, id: row.sourceId }
                      : row.sourceType === "quality_disposition_reversal"
                        ? {
                            type: "quality_disposition" as const,
                            id:
                              [...store.qualityDispositions.values()].find(
                                (disposition) => disposition.reversal?.id === row.sourceId,
                              )?.id ?? row.sourceId,
                          }
                        : row.sourceType === "stocktake_variance"
                          ? { type: "stocktake" as const, id: row.sourceId }
                          : {
                              type: "receipt" as const,
                              id:
                                row.sourceType === "purchase_receipt"
                                  ? row.sourceId
                                  : ([...store.purchaseReceipts.values()].find(
                                      (receipt) => receipt.reversal?.id === row.sourceId,
                                    )?.id ?? row.sourceId),
                            },
        })),
        page,
        (row) => ({
          sortValue: `${row.transactionTime}|${row.recordedAt}`,
          id: row.id,
        }),
      );
    },
    integrity: async (workspaceId, productId, qualityGradeId, unit) => {
      const diagnostics: string[] = [];
      for (const movement of store.inventoryMovements.filter(
        (row) =>
          row.workspaceId === workspaceId &&
          row.productId === productId &&
          row.qualityGradeId === qualityGradeId &&
          row.quantity.unit === unit,
      )) {
        if (movement.quantity.valueScaled === 0) diagnostics.push("zero_quantity");
        if (
          movement.qualityGradeId !== null &&
          !store.qualityGrades.has(key(workspaceId, movement.qualityGradeId))
        )
          diagnostics.push("missing_quality_grade");
        if (
          movement.sourceType === "inventory_adjustment" &&
          (movement.reasonCode === null || (movement.reason ?? "").trim().length === 0)
        )
          diagnostics.push("malformed_adjustment");
        if (movement.sourceType === "purchase_receipt") {
          const receipt = store.purchaseReceipts.get(key(workspaceId, movement.sourceId));
          const line = receipt?.lines.find((item) => item.receiptLineId === movement.sourceLineId);
          if (
            line === undefined ||
            line.productId !== productId ||
            line.qualityGradeId !== qualityGradeId ||
            line.quantity.unit !== unit ||
            line.quantity.valueScaled !== movement.quantity.valueScaled
          )
            diagnostics.push("missing_or_mismatched_receipt");
        }
        if (movement.sourceType === "quality_disposition") {
          const disposition = store.qualityDispositions.get(key(workspaceId, movement.sourceId));
          const allocation = disposition?.allocations.find(
            (item) => item.allocationId === movement.sourceLineId && item.outcome === "accepted",
          );
          const root =
            disposition === undefined
              ? null
              : intakeSourceRoot(store, workspaceId, disposition.source);
          if (
            disposition === undefined ||
            allocation === undefined ||
            root === null ||
            root.line.productId !== productId ||
            allocation.qualityGradeId !== qualityGradeId ||
            allocation.quantity.unit !== unit ||
            allocation.quantity.valueScaled !== movement.quantity.valueScaled
          )
            diagnostics.push("missing_or_mismatched_quality_disposition");
        }
        if (movement.sourceType === "quality_disposition_reversal") {
          const disposition = [...store.qualityDispositions.values()].find(
            (item) => item.workspaceId === workspaceId && item.reversal?.id === movement.sourceId,
          );
          const allocation = disposition?.allocations.find(
            (item) => item.allocationId === movement.sourceLineId && item.outcome === "accepted",
          );
          const original = store.inventoryMovements.find(
            (item) => item.id === movement.reversalOfMovementId,
          );
          if (
            disposition === undefined ||
            allocation === undefined ||
            original?.sourceType !== "quality_disposition" ||
            original.sourceId !== disposition.id ||
            original.sourceLineId !== allocation.allocationId ||
            original.productId !== productId ||
            original.qualityGradeId !== qualityGradeId ||
            original.quantity.unit !== unit ||
            movement.quantity.valueScaled !== -original.quantity.valueScaled
          )
            diagnostics.push("broken_quality_disposition_reversal");
        }
        if (movement.sourceType === "delivery_dispatch") {
          const delivery = store.deliveries.get(key(workspaceId, movement.sourceId));
          const line = delivery?.lines.find(
            (item) => item.deliveryLineId === movement.sourceLineId,
          );
          if (
            line === undefined ||
            line.productId !== productId ||
            line.qualityGradeId !== qualityGradeId ||
            line.quantity.unit !== unit ||
            -line.quantity.valueScaled !== movement.quantity.valueScaled
          )
            diagnostics.push("missing_or_mismatched_delivery_dispatch");
        }
        if (movement.sourceType === "delivery_return") {
          const returned = store.deliveryReturns.find(
            (item) => item.workspaceId === workspaceId && item.id === movement.sourceId,
          );
          const returnLine = returned?.lines.find(
            (item) => item.deliveryLineId === movement.sourceLineId,
          );
          const delivery = returned
            ? store.deliveries.get(key(workspaceId, returned.deliveryId))
            : undefined;
          const deliveryLine = delivery?.lines.find(
            (item) => item.deliveryLineId === returnLine?.deliveryLineId,
          );
          const original = store.inventoryMovements.find(
            (item) => item.id === movement.reversalOfMovementId,
          );
          if (
            returnLine === undefined ||
            deliveryLine === undefined ||
            deliveryLine.productId !== productId ||
            deliveryLine.qualityGradeId !== qualityGradeId ||
            returnLine.quantity.unit !== unit ||
            returnLine.quantity.valueScaled !== movement.quantity.valueScaled ||
            original?.sourceType !== "delivery_dispatch" ||
            original.sourceId !== returned?.deliveryId ||
            original.sourceLineId !== returnLine.deliveryLineId
          )
            diagnostics.push("broken_delivery_return");
        }
      }
      return diagnostics;
    },
  },
});

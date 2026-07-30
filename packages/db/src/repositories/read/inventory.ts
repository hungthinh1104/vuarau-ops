import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  purchaseReceipts,
  purchaseReceiptLines,
  purchaseReceiptReversals,
  inventoryMovements,
  inventoryBalances,
  deliveryReturns,
  qualityGrades,
} from "../../schema/index.ts";
import { classifyInventory } from "@vuarau/domain-kernel";
import { toIso, toIsoOrNull } from "../row-mappers.ts";
import type { Page } from "../shared/read-helpers.ts";
import { fetchLimit, paged, readReceiptDto } from "../shared/read-helpers.ts";
import type { Tx } from "../shared/types.ts";

export const createInventoryReadRepositories = (tx: Tx) => ({
  inventoryReads: {
    async receipt(workspaceId: string, receiptId: string) {
      return readReceiptDto(tx, workspaceId, receiptId);
    },
    async receipts(workspaceId: string, purchaseId: string) {
      const rows = await tx
        .select()
        .from(purchaseReceipts)
        .where(
          and(
            eq(purchaseReceipts.workspaceId, workspaceId),
            eq(purchaseReceipts.purchaseId, purchaseId),
          ),
        )
        .orderBy(
          asc(purchaseReceipts.transactionTime),
          asc(purchaseReceipts.recordedAt),
          asc(purchaseReceipts.id),
        );
      const receiptIds = rows.map((row) => row.id);
      if (receiptIds.length === 0) return [];
      const [lines, reversals] = await Promise.all([
        tx
          .select()
          .from(purchaseReceiptLines)
          .where(
            and(
              eq(purchaseReceiptLines.workspaceId, workspaceId),
              inArray(purchaseReceiptLines.receiptId, receiptIds),
            ),
          )
          .orderBy(asc(purchaseReceiptLines.id)),
        tx
          .select()
          .from(purchaseReceiptReversals)
          .where(
            and(
              eq(purchaseReceiptReversals.workspaceId, workspaceId),
              inArray(purchaseReceiptReversals.receiptId, receiptIds),
            ),
          ),
      ]);
      return rows.map((row) => {
        const reversal = reversals.find((candidate) => candidate.receiptId === row.id);
        return {
          id: row.id,
          workspaceId: row.workspaceId,
          purchaseId: row.purchaseId,
          lines: lines
            .filter((line) => line.receiptId === row.id)
            .map((line) => ({
              receiptLineId: line.id,
              purchaseLineId: line.purchaseLineId,
              productId: line.productId,
              qualityGradeId: line.qualityGradeId,
              qualityGradeName: line.qualityGradeName,
              quantity: { valueScaled: line.quantityScaled, unit: line.unit },
            })),
          note: row.note,
          transactionTime: toIso(row.transactionTime),
          recordedAt: toIso(row.recordedAt),
          actorId: row.actorId,
          reversal:
            reversal === undefined
              ? null
              : {
                  id: reversal.id,
                  reasonCode: reversal.reasonCode,
                  reason: reversal.reason,
                  transactionTime: toIso(reversal.transactionTime),
                  recordedAt: toIso(reversal.recordedAt),
                },
        };
      });
    },
    async adjustment(workspaceId: string, adjustmentId: string) {
      const rows = await tx
        .select()
        .from(inventoryMovements)
        .where(
          and(
            eq(inventoryMovements.workspaceId, workspaceId),
            eq(inventoryMovements.sourceType, "inventory_adjustment"),
            eq(inventoryMovements.sourceId, adjustmentId),
          ),
        )
        .limit(1);
      const row = rows[0];
      return row === undefined
        ? null
        : {
            id: row.id,
            workspaceId: row.workspaceId,
            productId: row.productId,
            qualityGradeId: row.qualityGradeId,
            qualityGradeName: row.qualityGradeName,
            quantity: { valueScaled: row.quantityScaled, unit: row.unit },
            sourceType: row.sourceType,
            sourceId: row.sourceId,
            sourceLineId: row.sourceLineId,
            reversalOfMovementId: row.reversalOfMovementId,
            reasonCode: row.reasonCode,
            reason: row.reason,
            transactionTime: toIso(row.transactionTime),
            recordedAt: toIso(row.recordedAt),
            actorId: row.actorId,
            commandId: row.commandId,
            sourceDocument: { type: "inventory_adjustment" as const, id: row.sourceId },
          };
    },
    async balances(workspaceId: string, productId: string) {
      const rows = await tx
        .select({
          balance: inventoryBalances,
          qualityGradeName: qualityGrades.name,
        })
        .from(inventoryBalances)
        .leftJoin(
          qualityGrades,
          and(
            eq(qualityGrades.workspaceId, inventoryBalances.workspaceId),
            eq(qualityGrades.id, inventoryBalances.qualityGradeId),
          ),
        )
        .where(
          and(
            eq(inventoryBalances.workspaceId, workspaceId),
            eq(inventoryBalances.productId, productId),
          ),
        )
        .orderBy(
          asc(qualityGrades.sortOrder),
          asc(qualityGrades.name),
          asc(inventoryBalances.unit),
        );
      return rows.map(({ balance: row, qualityGradeName }) => ({
        workspaceId: row.workspaceId,
        productId: row.productId,
        qualityGradeId: row.qualityGradeId,
        qualityGradeName,
        unit: row.unit,
        quantityScaled: row.quantityScaled,
        classification: classifyInventory(row.quantityScaled),
        movementCount: row.movementCount,
        lastMovementTransactionTime: toIsoOrNull(row.lastMovementTransactionTime),
        updatedAt: toIso(row.updatedAt),
      }));
    },
    async timeline(args: {
      workspaceId: string;
      productId: string;
      qualityGradeId: typeof inventoryMovements.$inferSelect.qualityGradeId | undefined;
      unit: typeof inventoryMovements.$inferSelect.unit | null;
      page: Page;
    }) {
      const filters: SQL[] = [
        eq(inventoryMovements.workspaceId, args.workspaceId),
        eq(inventoryMovements.productId, args.productId),
      ];
      if (args.qualityGradeId !== undefined)
        filters.push(
          args.qualityGradeId === null
            ? isNull(inventoryMovements.qualityGradeId)
            : eq(inventoryMovements.qualityGradeId, args.qualityGradeId),
        );
      if (args.unit !== null) filters.push(eq(inventoryMovements.unit, args.unit));
      if (args.page.after !== null) {
        const [transactionTime, recordedAt] = args.page.after.sortValue.split("|");
        filters.push(sql`(${inventoryMovements.transactionTime}, ${inventoryMovements.recordedAt}, ${inventoryMovements.id})
            < (${transactionTime}::timestamptz, ${recordedAt}::timestamptz, ${args.page.after.id}::uuid)`);
      }
      const rows = await tx
        .select()
        .from(inventoryMovements)
        .where(and(...filters))
        .orderBy(
          desc(inventoryMovements.transactionTime),
          desc(inventoryMovements.recordedAt),
          desc(inventoryMovements.id),
        )
        .limit(fetchLimit(args.page));
      const reversalIds = rows
        .filter((row) => row.sourceType === "purchase_receipt_reversal")
        .map((row) => row.sourceId);
      const reversalSources =
        reversalIds.length === 0
          ? []
          : await tx
              .select({
                reversalId: purchaseReceiptReversals.id,
                receiptId: purchaseReceiptReversals.receiptId,
              })
              .from(purchaseReceiptReversals)
              .where(
                and(
                  eq(purchaseReceiptReversals.workspaceId, args.workspaceId),
                  inArray(purchaseReceiptReversals.id, reversalIds),
                ),
              );
      const deliveryReturnIds = rows
        .filter((row) => row.sourceType === "delivery_return")
        .map((row) => row.sourceId);
      const deliveryReturnSources =
        deliveryReturnIds.length === 0
          ? []
          : await tx
              .select({
                returnId: deliveryReturns.id,
                deliveryId: deliveryReturns.deliveryId,
              })
              .from(deliveryReturns)
              .where(
                and(
                  eq(deliveryReturns.workspaceId, args.workspaceId),
                  inArray(deliveryReturns.id, deliveryReturnIds),
                ),
              );
      return paged(
        rows.map((row) => ({
          id: row.id,
          workspaceId: row.workspaceId,
          productId: row.productId,
          qualityGradeId: row.qualityGradeId,
          qualityGradeName: row.qualityGradeName,
          quantity: { valueScaled: row.quantityScaled, unit: row.unit },
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          sourceLineId: row.sourceLineId,
          reversalOfMovementId: row.reversalOfMovementId,
          reasonCode: row.reasonCode,
          reason: row.reason,
          transactionTime: toIso(row.transactionTime),
          recordedAt: toIso(row.recordedAt),
          actorId: row.actorId,
          commandId: row.commandId,
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
                          deliveryReturnSources.find((source) => source.returnId === row.sourceId)
                            ?.deliveryId ?? row.sourceId,
                      }
                    : {
                        type: "receipt" as const,
                        id:
                          row.sourceType === "purchase_receipt"
                            ? row.sourceId
                            : (reversalSources.find((source) => source.reversalId === row.sourceId)
                                ?.receiptId ?? row.sourceId),
                      },
        })),
        args.page,
        (row) => ({
          sortValue: `${row.transactionTime}|${row.recordedAt}`,
          id: row.id,
        }),
      );
    },
    async integrity(
      workspaceId: string,
      productId: string,
      qualityGradeId: typeof inventoryMovements.$inferSelect.qualityGradeId,
      unit: typeof inventoryMovements.$inferSelect.unit,
    ) {
      const rows = await tx.execute(sql`
          select case
            when im.quantity_scaled = 0 then 'zero_quantity'
            when im.quality_grade_id is not null and qg.id is null then 'missing_quality_grade'
            when im.source_type = 'inventory_adjustment'
              and (im.reason_code is null or length(btrim(coalesce(im.reason, ''))) = 0)
              then 'malformed_adjustment'
            when im.source_type = 'purchase_receipt'
              and (prl.id is null or prl.workspace_id <> im.workspace_id
                or prl.product_id <> im.product_id or prl.unit <> im.unit
                or prl.quality_grade_id is distinct from im.quality_grade_id
                or prl.quantity_scaled <> im.quantity_scaled)
              then 'missing_or_mismatched_receipt'
            when im.source_type = 'purchase_receipt_reversal'
              and (prr.id is null or original.id is null
                or im.reversal_of_movement_id <> original.id
                or im.quantity_scaled <> -original.quantity_scaled)
              then 'broken_receipt_reversal'
            when im.source_type = 'delivery_dispatch'
              and (dl.id is null or d.id is null
                or dl.product_id <> im.product_id or dl.unit <> im.unit
                or dl.quality_grade_id is distinct from im.quality_grade_id
                or -dl.quantity_scaled <> im.quantity_scaled)
              then 'missing_or_mismatched_delivery_dispatch'
            when im.source_type = 'delivery_return'
              and (dr.id is null or drl.delivery_line_id is null or return_dl.id is null
                or return_dl.product_id <> im.product_id or return_dl.unit <> im.unit
                or return_dl.quality_grade_id is distinct from im.quality_grade_id
                or drl.quantity_scaled <> im.quantity_scaled
                or original.id is null
                or original.source_type <> 'delivery_dispatch'
                or original.source_id <> dr.delivery_id
                or original.source_line_id <> drl.delivery_line_id)
              then 'broken_delivery_return'
            else null end as diagnostic
          from inventory_movements im
          left join purchase_receipt_lines prl
            on im.source_type = 'purchase_receipt'
            and prl.receipt_id = im.source_id and prl.id = im.source_line_id
          left join purchase_receipt_reversals prr
            on im.source_type = 'purchase_receipt_reversal' and prr.id = im.source_id
          left join inventory_movements original on original.id = im.reversal_of_movement_id
          left join delivery_lines dl
            on im.source_type = 'delivery_dispatch'
            and dl.workspace_id = im.workspace_id
            and dl.delivery_id = im.source_id and dl.id = im.source_line_id
          left join deliveries d
            on d.workspace_id = dl.workspace_id and d.id = dl.delivery_id
          left join delivery_returns dr
            on im.source_type = 'delivery_return'
            and dr.workspace_id = im.workspace_id and dr.id = im.source_id
          left join delivery_return_lines drl
            on drl.return_id = dr.id and drl.delivery_line_id = im.source_line_id
          left join delivery_lines return_dl
            on return_dl.workspace_id = im.workspace_id and return_dl.id = drl.delivery_line_id
          left join quality_grades qg
            on qg.workspace_id = im.workspace_id and qg.id = im.quality_grade_id
          where im.workspace_id = ${workspaceId}::uuid
            and im.product_id = ${productId}::uuid
            and im.quality_grade_id is not distinct from ${qualityGradeId}::uuid
            and im.unit = ${unit}::unit
        `);
      return (rows as unknown as Array<{ diagnostic: string | null }>).flatMap((row) =>
        row.diagnostic === null ? [] : [row.diagnostic],
      );
    },
  },
});

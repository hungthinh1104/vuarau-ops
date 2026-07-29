import { and, asc, eq, sql } from "drizzle-orm";
import type { IsoInstant, ProductId, WorkspaceId } from "@vuarau/domain-contracts";
import type { InventoryMovementState } from "@vuarau/domain-kernel";
import { inventoryMovements, inventoryBalances } from "../../schema/index.ts";
import { fromIso, fromIsoOrNull, toIso, toIsoOrNull } from "../row-mappers.ts";
import type { Tx, IdMinter } from "../shared/types.ts";

export const createInventoryWriteRepositories = (tx: Tx, ids: IdMinter) => ({
  inventoryMovements: {
    async append(movements: readonly Omit<InventoryMovementState, "id">[]) {
      if (movements.length === 0) return [];
      const rows = await tx
        .insert(inventoryMovements)
        .values(
          movements.map((movement) => ({
            id: ids.newId(),
            workspaceId: movement.workspaceId,
            productId: movement.productId,
            quantityScaled: movement.quantity.valueScaled,
            unit: movement.quantity.unit,
            sourceType: movement.sourceType,
            sourceId: movement.sourceId,
            sourceLineId: movement.sourceLineId,
            reversalOfMovementId: movement.reversalOfMovementId,
            reasonCode: movement.reasonCode,
            reason: movement.reason,
            transactionTime: fromIso(movement.transactionTime),
            recordedAt: fromIso(movement.recordedAt),
            actorId: movement.actorId,
            commandId: movement.commandId,
          })),
        )
        .onConflictDoNothing()
        .returning();
      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspaceId,
        productId: row.productId,
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
      })) as unknown as readonly InventoryMovementState[];
    },
    async listByProduct(
      workspaceId: WorkspaceId,
      productId: ProductId,
      unit: InventoryMovementState["quantity"]["unit"] | null,
    ) {
      const filters = [
        eq(inventoryMovements.workspaceId, workspaceId),
        eq(inventoryMovements.productId, productId),
      ];
      if (unit !== null) filters.push(eq(inventoryMovements.unit, unit));
      const rows = await tx
        .select()
        .from(inventoryMovements)
        .where(and(...filters))
        .orderBy(
          asc(inventoryMovements.transactionTime),
          asc(inventoryMovements.recordedAt),
          asc(inventoryMovements.id),
        );
      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspaceId,
        productId: row.productId,
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
      })) as unknown as readonly InventoryMovementState[];
    },
  },
  inventoryBalances: {
    async get(
      workspaceId: WorkspaceId,
      productId: ProductId,
      unit: InventoryMovementState["quantity"]["unit"],
    ) {
      const rows = await tx
        .select()
        .from(inventoryBalances)
        .where(
          and(
            eq(inventoryBalances.workspaceId, workspaceId),
            eq(inventoryBalances.productId, productId),
            eq(inventoryBalances.unit, unit),
          ),
        )
        .limit(1);
      const row = rows[0];
      return row === undefined
        ? null
        : {
            workspaceId: row.workspaceId as WorkspaceId,
            productId: row.productId as ProductId,
            unit: row.unit,
            quantityScaled: row.quantityScaled,
            movementCount: row.movementCount,
            lastMovementTransactionTime: toIsoOrNull(row.lastMovementTransactionTime),
            updatedAt: toIso(row.updatedAt),
          };
    },
    async applyDelta(delta: {
      workspaceId: WorkspaceId;
      productId: ProductId;
      unit: InventoryMovementState["quantity"]["unit"];
      quantityScaled: number;
      movementCount: number;
      lastMovementTransactionTime: IsoInstant;
      updatedAt: IsoInstant;
    }) {
      await tx
        .insert(inventoryBalances)
        .values({
          workspaceId: delta.workspaceId,
          productId: delta.productId,
          unit: delta.unit,
          quantityScaled: delta.quantityScaled,
          movementCount: delta.movementCount,
          lastMovementTransactionTime: fromIso(delta.lastMovementTransactionTime),
          updatedAt: fromIso(delta.updatedAt),
        })
        .onConflictDoUpdate({
          target: [
            inventoryBalances.workspaceId,
            inventoryBalances.productId,
            inventoryBalances.unit,
          ],
          set: {
            quantityScaled: sql`${inventoryBalances.quantityScaled} + excluded.quantity_scaled`,
            movementCount: sql`${inventoryBalances.movementCount} + excluded.movement_count`,
            lastMovementTransactionTime: sql`greatest(
                ${inventoryBalances.lastMovementTransactionTime},
                excluded.last_movement_transaction_time
              )`,
            updatedAt: sql`greatest(${inventoryBalances.updatedAt}, excluded.updated_at)`,
          },
        });
    },
    async save(balance: {
      workspaceId: WorkspaceId;
      productId: ProductId;
      unit: InventoryMovementState["quantity"]["unit"];
      quantityScaled: number;
      movementCount: number;
      lastMovementTransactionTime: IsoInstant | null;
      updatedAt: IsoInstant;
    }) {
      await tx
        .insert(inventoryBalances)
        .values({
          ...balance,
          lastMovementTransactionTime: fromIsoOrNull(balance.lastMovementTransactionTime),
          updatedAt: fromIso(balance.updatedAt),
        })
        .onConflictDoUpdate({
          target: [
            inventoryBalances.workspaceId,
            inventoryBalances.productId,
            inventoryBalances.unit,
          ],
          set: {
            quantityScaled: balance.quantityScaled,
            movementCount: balance.movementCount,
            lastMovementTransactionTime: fromIsoOrNull(balance.lastMovementTransactionTime),
            updatedAt: fromIso(balance.updatedAt),
          },
        });
    },
  },
});

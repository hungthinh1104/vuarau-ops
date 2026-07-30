import { eq, inArray, sql } from "drizzle-orm";
import type { WorkspaceId, WorkspaceBackupV4 } from "@vuarau/domain-contracts";
import {
  actors,
  auditLogs,
  commandReceipts,
  customerAccountBalances,
  customers,
  customerAccountEntries,
  saleLines,
  saleVoids,
  sales,
  paymentReversals,
  payments,
  products,
  qualityGrades,
  suppliers,
  supplierPayments,
  supplierPaymentReversals,
  supplierAccountEntries,
  supplierAccountBalances,
  purchases,
  purchaseLines,
  purchaseVoids,
  purchaseReceipts,
  purchaseReceiptLines,
  purchaseReceiptReversals,
  inventoryMovements,
  inventoryBalances,
  deliveries,
  deliveryLines,
  deliveryReturns,
  deliveryReturnLines,
  documents,
  documentShares,
  workspaces,
} from "../../schema/index.ts";
import type { Tx } from "../shared/types.ts";

export const createOperationsWriteRepositories = (tx: Tx) => ({
  operations: {
    async restoreBackup(workspaceId: WorkspaceId, payload: WorkspaceBackupV4["payload"]) {
      const [
        customerRows,
        productRows,
        qualityGradeRows,
        saleRows,
        paymentRows,
        entryRows,
        supplierRows,
        purchaseRows,
        movementRows,
        deliveryRows,
        documentRows,
      ] = await Promise.all([
        tx
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.workspaceId, workspaceId))
          .limit(1),
        tx
          .select({ id: products.id })
          .from(products)
          .where(eq(products.workspaceId, workspaceId))
          .limit(1),
        tx
          .select({ id: qualityGrades.id })
          .from(qualityGrades)
          .where(eq(qualityGrades.workspaceId, workspaceId))
          .limit(1),
        tx.select({ id: sales.id }).from(sales).where(eq(sales.workspaceId, workspaceId)).limit(1),
        tx
          .select({ id: payments.id })
          .from(payments)
          .where(eq(payments.workspaceId, workspaceId))
          .limit(1),
        tx
          .select({ id: customerAccountEntries.id })
          .from(customerAccountEntries)
          .where(eq(customerAccountEntries.workspaceId, workspaceId))
          .limit(1),
        tx
          .select({ id: suppliers.id })
          .from(suppliers)
          .where(eq(suppliers.workspaceId, workspaceId))
          .limit(1),
        tx
          .select({ id: purchases.id })
          .from(purchases)
          .where(eq(purchases.workspaceId, workspaceId))
          .limit(1),
        tx
          .select({ id: inventoryMovements.id })
          .from(inventoryMovements)
          .where(eq(inventoryMovements.workspaceId, workspaceId))
          .limit(1),
        tx
          .select({ id: deliveries.id })
          .from(deliveries)
          .where(eq(deliveries.workspaceId, workspaceId))
          .limit(1),
        tx
          .select({ id: documents.id })
          .from(documents)
          .where(eq(documents.workspaceId, workspaceId))
          .limit(1),
      ]);
      if (
        [
          customerRows,
          productRows,
          qualityGradeRows,
          saleRows,
          paymentRows,
          entryRows,
          supplierRows,
          purchaseRows,
          movementRows,
          deliveryRows,
          documentRows,
        ].some((rows) => rows.length > 0)
      ) {
        return { kind: "unsafe_target" as const, reason: "target contains business data" };
      }
      const sourceWorkspaceId = payload.workspace["id"];
      if (typeof sourceWorkspaceId !== "string") {
        return { kind: "integrity_error" as const, reason: "missing source workspace identity" };
      }
      if (sourceWorkspaceId !== workspaceId) {
        const sourceStillPresent = await tx
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.id, sourceWorkspaceId))
          .limit(1);
        if (sourceStillPresent.length > 0) {
          return {
            kind: "integrity_error" as const,
            reason: "source identities already exist in this database",
          };
        }
      }

      const actorIds = [
        ...payload.accountEntries.map((row) => row["actorId"]),
        ...payload.audit.map((row) => row["actorId"]),
        ...payload.supplierAccountEntries.map((row) => row["actorId"]),
        ...payload.receipts.map((row) => row["actorId"]),
        ...payload.receiptReversals.map((row) => row["actorId"]),
        ...payload.inventoryMovements.map((row) => row["actorId"]),
        ...payload.deliveries.map((row) => row["actorId"]),
        ...payload.deliveryReturns.map((row) => row["actorId"]),
        ...payload.documents.map((row) => row["generatedBy"]),
        ...payload.documentShares.flatMap((row) => [row["createdBy"], row["revokedBy"]]),
      ].filter((value): value is string => typeof value === "string");
      if (actorIds.length > 0) {
        const existing = await tx
          .select({ id: actors.id })
          .from(actors)
          .where(inArray(actors.id, [...new Set(actorIds)]));
        if (existing.length !== new Set(actorIds).size) {
          return { kind: "integrity_error" as const, reason: "unresolved actor identity" };
        }
      }

      const date = (value: unknown): Date => new Date(String(value));
      const scoped = (
        row: Record<string, unknown>,
      ): Record<string, unknown> & { workspaceId: WorkspaceId } => ({
        ...row,
        workspaceId,
      });
      if (payload.commandReceipts.length > 0) {
        await tx.insert(commandReceipts).values(
          payload.commandReceipts.map((raw) => {
            const row = scoped(raw);
            return { ...row, recordedAt: date(row["recordedAt"]) };
          }) as unknown as (typeof commandReceipts.$inferInsert)[],
        );
      }
      if (payload.customers.length > 0) {
        await tx.insert(customers).values(
          payload.customers.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
              updatedAt: date(row["updatedAt"]),
            };
          }) as unknown as (typeof customers.$inferInsert)[],
        );
      }
      if (payload.products.length > 0) {
        await tx.insert(products).values(
          payload.products.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              createdAt: date(row["createdAt"]),
              updatedAt: date(row["updatedAt"]),
            };
          }) as unknown as (typeof products.$inferInsert)[],
        );
      }
      if (payload.qualityGrades.length > 0) {
        await tx.insert(qualityGrades).values(
          payload.qualityGrades.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              createdAt: date(row["createdAt"]),
              updatedAt: date(row["updatedAt"]),
            };
          }) as unknown as (typeof qualityGrades.$inferInsert)[],
        );
      }
      if (payload.suppliers.length > 0) {
        await tx.insert(suppliers).values(
          payload.suppliers.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              createdAt: date(row["createdAt"]),
              updatedAt: date(row["updatedAt"]),
            };
          }) as unknown as (typeof suppliers.$inferInsert)[],
        );
      }
      if (payload.sales.length > 0) {
        await tx.insert(sales).values(
          payload.sales.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
              postedAt: row["postedAt"] == null ? null : date(row["postedAt"]),
              discardedAt: row["discardedAt"] == null ? null : date(row["discardedAt"]),
              dueAt: row["dueAt"] == null ? null : date(row["dueAt"]),
            };
          }) as unknown as (typeof sales.$inferInsert)[],
        );
      }
      if (payload.saleLines.length > 0)
        await tx
          .insert(saleLines)
          .values(payload.saleLines.map(scoped) as unknown as (typeof saleLines.$inferInsert)[]);
      if (payload.deliveries.length > 0) {
        await tx.insert(deliveries).values(
          payload.deliveries.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
              dispatchedAt: row["dispatchedAt"] == null ? null : date(row["dispatchedAt"]),
              deliveredAt: row["deliveredAt"] == null ? null : date(row["deliveredAt"]),
            };
          }) as unknown as (typeof deliveries.$inferInsert)[],
        );
      }
      if (payload.deliveryLines.length > 0)
        await tx
          .insert(deliveryLines)
          .values(
            payload.deliveryLines.map(scoped) as unknown as (typeof deliveryLines.$inferInsert)[],
          );
      if (payload.deliveryReturns.length > 0) {
        await tx.insert(deliveryReturns).values(
          payload.deliveryReturns.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof deliveryReturns.$inferInsert)[],
        );
      }
      if (payload.deliveryReturnLines.length > 0)
        await tx
          .insert(deliveryReturnLines)
          .values(
            payload.deliveryReturnLines as unknown as (typeof deliveryReturnLines.$inferInsert)[],
          );
      if (payload.purchases.length > 0) {
        await tx.insert(purchases).values(
          payload.purchases.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
              confirmedAt: row["confirmedAt"] == null ? null : date(row["confirmedAt"]),
              discardedAt: row["discardedAt"] == null ? null : date(row["discardedAt"]),
              dueAt: row["dueAt"] == null ? null : date(row["dueAt"]),
            };
          }) as unknown as (typeof purchases.$inferInsert)[],
        );
      }
      if (payload.purchaseLines.length > 0)
        await tx
          .insert(purchaseLines)
          .values(
            payload.purchaseLines.map(scoped) as unknown as (typeof purchaseLines.$inferInsert)[],
          );
      if (payload.purchaseVoids.length > 0) {
        await tx.insert(purchaseVoids).values(
          payload.purchaseVoids.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof purchaseVoids.$inferInsert)[],
        );
      }
      if (payload.saleVoids.length > 0) {
        await tx.insert(saleVoids).values(
          payload.saleVoids.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof saleVoids.$inferInsert)[],
        );
      }
      if (payload.payments.length > 0) {
        await tx.insert(payments).values(
          payload.payments.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof payments.$inferInsert)[],
        );
      }
      if (payload.paymentReversals.length > 0) {
        await tx.insert(paymentReversals).values(
          payload.paymentReversals.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof paymentReversals.$inferInsert)[],
        );
      }
      if (payload.supplierPayments.length > 0) {
        await tx.insert(supplierPayments).values(
          payload.supplierPayments.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof supplierPayments.$inferInsert)[],
        );
      }
      if (payload.supplierPaymentReversals.length > 0) {
        await tx.insert(supplierPaymentReversals).values(
          payload.supplierPaymentReversals.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof supplierPaymentReversals.$inferInsert)[],
        );
      }
      if (payload.receipts.length > 0) {
        await tx.insert(purchaseReceipts).values(
          payload.receipts.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof purchaseReceipts.$inferInsert)[],
        );
      }
      if (payload.receiptLines.length > 0)
        await tx
          .insert(purchaseReceiptLines)
          .values(
            payload.receiptLines.map(
              scoped,
            ) as unknown as (typeof purchaseReceiptLines.$inferInsert)[],
          );
      if (payload.receiptReversals.length > 0) {
        await tx.insert(purchaseReceiptReversals).values(
          payload.receiptReversals.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof purchaseReceiptReversals.$inferInsert)[],
        );
      }
      if (payload.accountEntries.length > 0) {
        await tx.insert(customerAccountEntries).values(
          payload.accountEntries.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof customerAccountEntries.$inferInsert)[],
        );
      }
      if (payload.supplierAccountEntries.length > 0) {
        await tx.insert(supplierAccountEntries).values(
          payload.supplierAccountEntries.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof supplierAccountEntries.$inferInsert)[],
        );
      }
      if (payload.inventoryMovements.length > 0) {
        await tx.insert(inventoryMovements).values(
          payload.inventoryMovements.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof inventoryMovements.$inferInsert)[],
        );
      }
      if (payload.documents.length > 0) {
        await tx.insert(documents).values(
          payload.documents.map((raw) => {
            const row = scoped(raw);
            return { ...row, generatedAt: date(row["generatedAt"]) };
          }) as unknown as (typeof documents.$inferInsert)[],
        );
      }
      if (payload.documentShares.length > 0) {
        await tx.insert(documentShares).values(
          payload.documentShares.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              expiresAt: row["expiresAt"] == null ? null : date(row["expiresAt"]),
              createdAt: date(row["createdAt"]),
              revokedAt: row["revokedAt"] == null ? null : date(row["revokedAt"]),
            };
          }) as unknown as (typeof documentShares.$inferInsert)[],
        );
      }
      if (payload.audit.length > 0) {
        await tx.insert(auditLogs).values(
          payload.audit.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof auditLogs.$inferInsert)[],
        );
      }
      await tx.execute(sql`
            INSERT INTO ${customerAccountBalances}
              (workspace_id, customer_id, balance_minor, currency, entry_count,
               last_entry_transaction_time, updated_at)
            SELECT ${workspaceId}::uuid, c.id, coalesce(sum(e.amount_minor), 0),
                   coalesce(max(e.currency::text), 'VND')::currency_code,
                   count(e.id)::int, max(e.transaction_time), now()
            FROM ${customers} c
            LEFT JOIN ${customerAccountEntries} e
              ON e.workspace_id = c.workspace_id AND e.customer_id = c.id
            WHERE c.workspace_id = ${workspaceId}::uuid
            GROUP BY c.id
          `);
      await tx.execute(sql`
          INSERT INTO ${supplierAccountBalances}
            (workspace_id, supplier_id, balance_minor, currency, entry_count,
             last_entry_transaction_time, updated_at)
          SELECT ${workspaceId}::uuid, s.id, coalesce(sum(e.amount_minor), 0),
                 coalesce(max(e.currency::text), 'VND')::currency_code,
                 count(e.id)::int, max(e.transaction_time), now()
          FROM ${suppliers} s
          LEFT JOIN ${supplierAccountEntries} e
            ON e.workspace_id = s.workspace_id AND e.supplier_id = s.id
          WHERE s.workspace_id = ${workspaceId}::uuid
          GROUP BY s.id
        `);
      await tx.execute(sql`
          INSERT INTO ${inventoryBalances}
            (workspace_id, product_id, quality_grade_id, unit, quantity_scaled, movement_count,
             last_movement_transaction_time, updated_at)
          SELECT ${workspaceId}::uuid, product_id, quality_grade_id, unit, sum(quantity_scaled),
                 count(*)::int, max(transaction_time), now()
          FROM ${inventoryMovements}
          WHERE workspace_id = ${workspaceId}::uuid
          GROUP BY product_id, quality_grade_id, unit
        `);
      return {
        kind: "restored" as const,
        counts: Object.fromEntries(
          Object.entries(payload).map(([name, rows]) => [
            name,
            Array.isArray(rows) ? rows.length : 1,
          ]),
        ),
      };
    },
  },
});

import { eq, inArray, sql } from "drizzle-orm";
import type { WorkspaceId, WorkspaceBackupV17 } from "@vuarau/domain-contracts";
import {
  actors,
  auditLogs,
  cashAccounts,
  cashAdjustments,
  cashBalances,
  cashMovements,
  cashTransfers,
  cashTransferReversals,
  expenses,
  expenseReversals,
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
  priceRules,
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
  workspaceOperationalProfiles,
  workspaces,
  costObservations,
  reconciliationObservations,
  debtObservations,
} from "../../schema/index.ts";
import type { Tx } from "../shared/types.ts";
import { restoreInspectedIntake, restoreQualityIssueCodes } from "./operations-intake-restore.ts";
import { restoreWorkspacePolicies } from "./operations-policy-restore.ts";
import {
  restoreSupplyCommitmentObservations,
  restoreSupplyCommitments,
} from "./operations-supply-commitment-restore.ts";
import { restoreSupplierObservations } from "./operations-supplier-observation-restore.ts";
import { restoreDemandObservations } from "./operations-demand-observation-restore.ts";
import { restoreCustomerOrders } from "./operations-customer-order-restore.ts";
import { countBackupRows, targetContainsBusinessData } from "./operations-target.ts";
import {
  createBackupRowScope,
  restorePaymentAllocationFacts,
} from "./operations-payment-allocation.ts";
export const createOperationsWriteRepositories = (tx: Tx) => ({
  operations: {
    async restoreBackup(workspaceId: WorkspaceId, payload: WorkspaceBackupV17["payload"]) {
      if (await targetContainsBusinessData(tx, workspaceId)) {
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
        ...payload.cashAccounts.map((row) => row["custodianActorId"]),
        ...payload.expenses.map((row) => row["actorId"]),
        ...payload.expenseReversals.map((row) => row["actorId"]),
        ...payload.cashTransfers.map((row) => row["actorId"]),
        ...payload.cashTransferReversals.map((row) => row["actorId"]),
        ...payload.cashAdjustments.map((row) => row["actorId"]),
        ...payload.cashMovements.map((row) => row["actorId"]),
        ...payload.accountEntries.map((row) => row["actorId"]),
        ...payload.audit.map((row) => row["actorId"]),
        ...payload.supplierAccountEntries.map((row) => row["actorId"]),
        ...payload.receipts.map((row) => row["actorId"]),
        ...payload.receiptReversals.map((row) => row["actorId"]),
        ...payload.inventoryMovements.map((row) => row["actorId"]),
        ...payload.goodsArrivals.map((row) => row["actorId"]),
        ...payload.goodsArrivalReversals.map((row) => row["actorId"]),
        ...payload.qualityInspections.map((row) => row["actorId"]),
        ...payload.qualityInspectionReversals.map((row) => row["actorId"]),
        ...payload.qualityDispositions.map((row) => row["actorId"]),
        ...payload.qualityDispositionReversals.map((row) => row["actorId"]),
        ...payload.deliveries.map((row) => row["actorId"]),
        ...payload.deliveryReturns.map((row) => row["actorId"]),
        ...payload.documents.map((row) => row["generatedBy"]),
        ...payload.documentShares.flatMap((row) => [row["createdBy"], row["revokedBy"]]),
        ...payload.priceRules.map((row) => row["actorId"]),
        ...payload.costObservations.map((row) => row["actorId"]),
        ...payload.reconciliationObservations.map((row) => row["actorId"]),
        ...payload.debtObservations.map((row) => row["actorId"]),
        ...payload.paymentAllocations.map((row) => row["actorId"]),
        ...payload.paymentAllocationReversals.map((row) => row["actorId"]),
        ...payload.supplyCommitmentObservations.map((row) => row["actorId"]),
        ...payload.supplierObservations.map((row) => row["actorId"]),
        ...payload.demandObservations.map((row) => row["actorId"]),
        ...payload.workspacePolicies.flatMap((row) => [
          row["createdBy"],
          row["approvedBy"],
          row["retiredBy"],
        ]),
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
      const profile = payload.operationalProfile;
      await tx
        .insert(workspaceOperationalProfiles)
        .values({
          workspaceId,
          purchasingMode: String(profile["purchasingMode"]) as "disabled" | "purchase_receiving",
          inventoryMode: String(profile["inventoryMode"]) as "disabled" | "movement_ledger",
          qualityGradeMode: String(profile["qualityGradeMode"]) as "disabled" | "required",
          deliveryMode: String(profile["deliveryMode"]) as "disabled" | "sale_fulfilment",
          cashbookMode: (profile["cashbookMode"] == null
            ? "disabled"
            : String(profile["cashbookMode"])) as "disabled" | "accounts_ledger",
          intakeMode: (profile["intakeMode"] == null
            ? "direct_receipt"
            : String(profile["intakeMode"])) as "direct_receipt" | "inspected_arrival",
          weighingMode: (profile["weighingMode"] == null
            ? "quantity_only"
            : String(profile["weighingMode"])) as "quantity_only" | "gross_tare_net",
          businessDayStartMinute: Number(profile["businessDayStartMinute"]),
          version: Number(profile["version"]),
          updatedAt: profile["updatedAt"] == null ? new Date() : date(profile["updatedAt"]),
        })
        .onConflictDoUpdate({
          target: workspaceOperationalProfiles.workspaceId,
          set: {
            purchasingMode: String(profile["purchasingMode"]) as "disabled" | "purchase_receiving",
            inventoryMode: String(profile["inventoryMode"]) as "disabled" | "movement_ledger",
            qualityGradeMode: String(profile["qualityGradeMode"]) as "disabled" | "required",
            deliveryMode: String(profile["deliveryMode"]) as "disabled" | "sale_fulfilment",
            cashbookMode: (profile["cashbookMode"] == null
              ? "disabled"
              : String(profile["cashbookMode"])) as "disabled" | "accounts_ledger",
            intakeMode: (profile["intakeMode"] == null
              ? "direct_receipt"
              : String(profile["intakeMode"])) as "direct_receipt" | "inspected_arrival",
            weighingMode: (profile["weighingMode"] == null
              ? "quantity_only"
              : String(profile["weighingMode"])) as "quantity_only" | "gross_tare_net",
            businessDayStartMinute: Number(profile["businessDayStartMinute"]),
            version: Number(profile["version"]),
            updatedAt: profile["updatedAt"] == null ? new Date() : date(profile["updatedAt"]),
          },
        });
      const scoped = createBackupRowScope(workspaceId);
      if (payload.commandReceipts.length > 0) {
        await tx.insert(commandReceipts).values(
          payload.commandReceipts.map((raw) => {
            const row = scoped(raw);
            return { ...row, recordedAt: date(row["recordedAt"]) };
          }) as unknown as (typeof commandReceipts.$inferInsert)[],
        );
      }
      if (payload.cashAccounts.length > 0) {
        await tx.insert(cashAccounts).values(
          payload.cashAccounts.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              createdAt: date(row["createdAt"]),
              updatedAt: date(row["updatedAt"]),
            };
          }) as unknown as (typeof cashAccounts.$inferInsert)[],
        );
      }
      if (payload.customers.length > 0) {
        await tx.insert(customers).values(
          payload.customers.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              evidenceReferences: row["evidenceReferences"] ?? [],
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
      await restoreCustomerOrders(tx, workspaceId, payload, date);
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
      if (payload.priceRules.length > 0) {
        await tx.insert(priceRules).values(
          payload.priceRules.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              effectiveFrom: date(row["effectiveFrom"]),
              effectiveTo: row["effectiveTo"] == null ? null : date(row["effectiveTo"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof priceRules.$inferInsert)[],
        );
      }
      if (payload.costObservations.length > 0) {
        await tx.insert(costObservations).values(
          payload.costObservations.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof costObservations.$inferInsert)[],
        );
      }
      if (payload.reconciliationObservations.length > 0) {
        await tx.insert(reconciliationObservations).values(
          payload.reconciliationObservations.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof reconciliationObservations.$inferInsert)[],
        );
      }
      if (payload.debtObservations.length > 0) {
        await tx.insert(debtObservations).values(
          payload.debtObservations.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              agreedDueAt: row["agreedDueAt"] == null ? null : date(row["agreedDueAt"]),
              promiseToPayAt: row["promiseToPayAt"] == null ? null : date(row["promiseToPayAt"]),
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof debtObservations.$inferInsert)[],
        );
      }
      await restoreSupplyCommitmentObservations(tx, workspaceId, payload, date);
      await restoreSupplierObservations(tx, workspaceId, payload, date);
      await restoreDemandObservations(tx, workspaceId, payload, date);
      await restoreWorkspacePolicies(tx, workspaceId, payload, date);
      await restoreQualityIssueCodes(tx, payload, scoped, date);
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
      await restoreSupplyCommitments(tx, workspaceId, payload, date);
      if (payload.sales.length > 0) {
        await tx.insert(sales).values(
          payload.sales.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              evidenceReferences: row["evidenceReferences"] ?? [],
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
              evidenceReferences: row["evidenceReferences"] ?? [],
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
              evidenceReferences: row["evidenceReferences"] ?? [],
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
              evidenceReferences: row["evidenceReferences"] ?? [],
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
      await restoreInspectedIntake(tx, payload, scoped, date);
      if (payload.purchaseVoids.length > 0) {
        await tx.insert(purchaseVoids).values(
          payload.purchaseVoids.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              evidenceReferences: row["evidenceReferences"] ?? [],
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
              evidenceReferences: row["evidenceReferences"] ?? [],
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
              evidenceReferences: row["evidenceReferences"] ?? [],
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
              evidenceReferences: row["evidenceReferences"] ?? [],
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof paymentReversals.$inferInsert)[],
        );
      }
      await restorePaymentAllocationFacts(tx, payload, scoped, date);
      if (payload.supplierPayments.length > 0) {
        await tx.insert(supplierPayments).values(
          payload.supplierPayments.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              cashAccountId: row["cashAccountId"] ?? null,
              evidenceReferences: row["evidenceReferences"] ?? [],
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
              evidenceReferences: row["evidenceReferences"] ?? [],
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof supplierPaymentReversals.$inferInsert)[],
        );
      }
      if (payload.expenses.length > 0) {
        await tx.insert(expenses).values(
          payload.expenses.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof expenses.$inferInsert)[],
        );
      }
      if (payload.expenseReversals.length > 0) {
        await tx.insert(expenseReversals).values(
          payload.expenseReversals.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof expenseReversals.$inferInsert)[],
        );
      }
      if (payload.cashTransfers.length > 0) {
        await tx.insert(cashTransfers).values(
          payload.cashTransfers.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof cashTransfers.$inferInsert)[],
        );
      }
      if (payload.cashTransferReversals.length > 0) {
        await tx.insert(cashTransferReversals).values(
          payload.cashTransferReversals.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof cashTransferReversals.$inferInsert)[],
        );
      }
      if (payload.cashAdjustments.length > 0) {
        await tx.insert(cashAdjustments).values(
          payload.cashAdjustments.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof cashAdjustments.$inferInsert)[],
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
      if (payload.cashMovements.length > 0) {
        await tx.insert(cashMovements).values(
          payload.cashMovements.map((raw) => {
            const row = scoped(raw);
            return {
              ...row,
              transactionTime: date(row["transactionTime"]),
              recordedAt: date(row["recordedAt"]),
            };
          }) as unknown as (typeof cashMovements.$inferInsert)[],
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
            (workspace_id, product_id, quality_grade_id, unit, quantity_scaled, movement_count, last_movement_transaction_time, updated_at)
          SELECT ${workspaceId}::uuid, product_id, quality_grade_id, unit, sum(quantity_scaled), count(*)::int,
                 max(transaction_time), now()
          FROM ${inventoryMovements}
          WHERE workspace_id = ${workspaceId}::uuid
          GROUP BY product_id, quality_grade_id, unit
        `);
      await tx.execute(sql`
          INSERT INTO ${cashBalances}
            (workspace_id, cash_account_id, balance_minor, currency, movement_count,
             last_movement_transaction_time, updated_at)
          SELECT ${workspaceId}::uuid, ca.id, coalesce(sum(cm.amount_minor), 0),
                 ca.currency, count(cm.id)::int, max(cm.transaction_time), now()
          FROM ${cashAccounts} ca
          LEFT JOIN ${cashMovements} cm
            ON cm.workspace_id = ca.workspace_id AND cm.cash_account_id = ca.id
          WHERE ca.workspace_id = ${workspaceId}::uuid
          GROUP BY ca.id, ca.currency
        `);
      return {
        kind: "restored" as const,
        counts: countBackupRows(payload),
      };
    },
  },
});

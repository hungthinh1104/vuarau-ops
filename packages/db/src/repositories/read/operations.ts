import { and, eq, ne, sql } from "drizzle-orm";
import type { WorkspaceRole } from "@vuarau/domain-contracts";
import { normalizeWorkspaceRoles } from "@vuarau/domain-contracts";
import {
  auditLogs,
  cashAccounts,
  cashAdjustments,
  cashMovements,
  cashTransfers,
  cashTransferReversals,
  expenses,
  expenseReversals,
  commandReceipts,
  customerAccountBalances,
  customerAccountEntries,
  customers,
  customerOrders,
  customerOrderLines,
  supplyCommitments,
  supplyCommitmentLines,
  paymentReversals,
  payments,
  paymentAllocationReversals,
  paymentAllocations,
  products,
  priceRules,
  qualityGrades,
  qualityIssueCodes,
  goodsArrivals,
  goodsArrivalLines,
  goodsArrivalReversals,
  qualityInspections,
  qualityInspectionIssues,
  qualityInspectionReversals,
  qualityDispositions,
  qualityDispositionAllocations,
  qualityDispositionReversals,
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
  saleLines,
  saleVoids,
  sales,
  workspaces,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaceOperationalProfiles,
  costObservations,
  reconciliationObservations,
  debtObservations,
  supplyCommitmentObservations,
  supplierObservations,
  demandObservations,
  workspacePolicies,
  stocktakeSessions,
  stocktakeCounts,
} from "../../schema/index.ts";
import type { Tx } from "../shared/types.ts";
import { readOperationsCloseBackup } from "./operations-close-backup.ts";
export const createOperationsReadRepositories = (tx: Tx) => ({
  operationsReads: {
    async integrity(workspaceId: string) {
      const rows = await tx.execute(sql`
          WITH ledger AS (
            SELECT workspace_id, customer_id, sum(amount_minor)::bigint AS ledger_minor
            FROM ${customerAccountEntries}
            WHERE workspace_id = ${workspaceId}::uuid
            GROUP BY workspace_id, customer_id
          ),
          projection_anomalies AS (
            SELECT c.id AS customer_id
            FROM ${customers} c
            LEFT JOIN ${customerAccountBalances} b
              ON b.workspace_id = c.workspace_id AND b.customer_id = c.id
            LEFT JOIN ledger l
              ON l.workspace_id = c.workspace_id AND l.customer_id = c.id
            WHERE c.workspace_id = ${workspaceId}::uuid
              AND coalesce(b.balance_minor, 0) <> coalesce(l.ledger_minor, 0)
          ),
          source_checks AS (
            SELECT
              e.customer_id,
              e.source_type,
              e.source_id,
              CASE e.source_type
                WHEN 'sale_posting' THEN
                  posting_sale.id IS NOT NULL
                  AND posting_sale.workspace_id = e.workspace_id
                  AND posting_sale.customer_id = e.customer_id
                  AND posting_sale.status = 'posted'
                  AND posting_sale.total_amount_minor = e.amount_minor
                  AND posting_sale.currency = e.currency
                WHEN 'sale_void' THEN
                  void_record.id IS NOT NULL
                  AND void_record.workspace_id = e.workspace_id
                  AND void_sale.customer_id = e.customer_id
                  AND -void_record.amount_minor = e.amount_minor
                  AND void_record.currency = e.currency
                WHEN 'payment' THEN
                  source_payment.id IS NOT NULL
                  AND source_payment.workspace_id = e.workspace_id
                  AND source_payment.customer_id = e.customer_id
                  AND -source_payment.amount_minor = e.amount_minor
                  AND source_payment.currency = e.currency
                WHEN 'payment_reversal' THEN
                  reversal.id IS NOT NULL
                  AND reversal.workspace_id = e.workspace_id
                  AND reversed_payment.customer_id = e.customer_id
                  AND reversal.amount_minor = e.amount_minor
                  AND reversal.currency = e.currency
                WHEN 'manual_adjustment' THEN
                  e.amount_minor <> 0
                  AND nullif(btrim(e.reason), '') IS NOT NULL
                ELSE false
              END AS source_valid
            FROM ${customerAccountEntries} e
            LEFT JOIN ${sales} posting_sale
              ON posting_sale.id = e.source_id AND e.source_type = 'sale_posting'
            LEFT JOIN ${saleVoids} void_record
              ON void_record.id = e.source_id AND e.source_type = 'sale_void'
            LEFT JOIN ${sales} void_sale ON void_sale.id = void_record.sale_id
            LEFT JOIN ${payments} source_payment
              ON source_payment.id = e.source_id AND e.source_type = 'payment'
            LEFT JOIN ${paymentReversals} reversal
              ON reversal.id = e.source_id AND e.source_type = 'payment_reversal'
            LEFT JOIN ${payments} reversed_payment ON reversed_payment.id = reversal.payment_id
            WHERE e.workspace_id = ${workspaceId}::uuid
          ),
          duplicate_groups AS (
            SELECT
              source_type,
              source_id,
              min(customer_id::text)::uuid AS customer_id,
              count(*)::int AS source_count
            FROM source_checks
            GROUP BY source_type, source_id
            HAVING count(*) > 1
          ),
          anomalous_customers AS (
            SELECT customer_id FROM projection_anomalies
            UNION
            SELECT customer_id FROM source_checks WHERE NOT source_valid
            UNION
            SELECT customer_id FROM duplicate_groups
          )
          SELECT
            (SELECT count(*)::int FROM ${customers}
              WHERE workspace_id = ${workspaceId}::uuid) AS customer_count,
            (SELECT count(*)::int FROM projection_anomalies) AS projection_drift,
            (SELECT count(*)::int FROM source_checks WHERE NOT source_valid) AS missing_sources,
            (SELECT coalesce(sum(source_count - 1), 0)::int FROM duplicate_groups)
              AS duplicate_sources,
            (SELECT count(*)::int FROM anomalous_customers) AS anomalous_customers
        `);
      const row = rows[0] as
        | {
            customer_count: number;
            projection_drift: number;
            missing_sources: number;
            duplicate_sources: number;
            anomalous_customers: number;
          }
        | undefined;
      const customerCount = Number(row?.customer_count ?? 0);
      const projectionDrift = Number(row?.projection_drift ?? 0);
      const missingSources = Number(row?.missing_sources ?? 0);
      const duplicateSources = Number(row?.duplicate_sources ?? 0);
      const anomalousCustomers = Number(row?.anomalous_customers ?? 0);
      const goodsRows = await tx.execute(sql`
          WITH supplier_ledger AS (
            SELECT supplier_id, sum(amount_minor)::bigint balance_minor, count(*)::int entry_count
            FROM ${supplierAccountEntries}
            WHERE workspace_id = ${workspaceId}::uuid
            GROUP BY supplier_id
          ),
          supplier_projection_anomalies AS (
            SELECT s.id
            FROM ${suppliers} s
            LEFT JOIN supplier_ledger l ON l.supplier_id = s.id
            LEFT JOIN ${supplierAccountBalances} b
              ON b.workspace_id = s.workspace_id AND b.supplier_id = s.id
            WHERE s.workspace_id = ${workspaceId}::uuid
              AND (
                coalesce(l.balance_minor, 0) <> coalesce(b.balance_minor, 0)
                OR coalesce(l.entry_count, 0) <> coalesce(b.entry_count, 0)
              )
          ),
          supplier_source_anomalies AS (
            SELECT DISTINCT sae.supplier_id AS id
            FROM ${supplierAccountEntries} sae
            LEFT JOIN ${supplierPayments} sp
              ON sae.source_type = 'supplier_payment' AND sp.id = sae.source_id
            LEFT JOIN ${supplierPaymentReversals} spr
              ON sae.source_type = 'supplier_payment_reversal' AND spr.id = sae.source_id
            LEFT JOIN ${purchases} p
              ON sae.source_type = 'purchase_confirmation' AND p.id = sae.source_id
            LEFT JOIN ${purchaseVoids} pv
              ON sae.source_type = 'purchase_void' AND pv.id = sae.source_id
            WHERE sae.workspace_id = ${workspaceId}::uuid
              AND (
                sae.amount_minor = 0
                OR (sae.source_type = 'manual_adjustment'
                  AND (sae.reason_code IS NULL OR nullif(btrim(sae.reason), '') IS NULL))
                OR (sae.source_type = 'supplier_payment' AND sp.id IS NULL)
                OR (sae.source_type = 'supplier_payment_reversal' AND spr.id IS NULL)
                OR (sae.source_type = 'purchase_confirmation' AND p.id IS NULL)
                OR (sae.source_type = 'purchase_void' AND pv.id IS NULL)
              )
          ),
          supplier_anomalies AS (
            SELECT id FROM supplier_projection_anomalies
            UNION SELECT id FROM supplier_source_anomalies
          ),
          inventory_ledger AS (
            SELECT product_id, quality_grade_id, unit,
                   sum(quantity_scaled)::bigint quantity_scaled,
                   count(*)::int movement_count
            FROM ${inventoryMovements}
            WHERE workspace_id = ${workspaceId}::uuid
            GROUP BY product_id, quality_grade_id, unit
          ),
          inventory_projection_anomalies AS (
            SELECT l.product_id, l.quality_grade_id, l.unit
            FROM inventory_ledger l
            LEFT JOIN ${inventoryBalances} b
              ON b.workspace_id = ${workspaceId}::uuid
              AND b.product_id = l.product_id
              AND b.quality_grade_id IS NOT DISTINCT FROM l.quality_grade_id
              AND b.unit = l.unit
            WHERE b.product_id IS NULL
              OR b.quantity_scaled <> l.quantity_scaled
              OR b.movement_count <> l.movement_count
          ),
          inventory_source_anomalies AS (
            SELECT DISTINCT im.product_id, im.quality_grade_id, im.unit
            FROM ${inventoryMovements} im
            LEFT JOIN ${purchaseReceipts} pr
              ON im.source_type = 'purchase_receipt' AND pr.id = im.source_id
            LEFT JOIN ${purchaseReceiptReversals} prr
              ON im.source_type = 'purchase_receipt_reversal' AND prr.id = im.source_id
            LEFT JOIN ${deliveryLines} dl
              ON im.source_type = 'delivery_dispatch'
              AND dl.workspace_id = im.workspace_id
              AND dl.delivery_id = im.source_id AND dl.id = im.source_line_id
            LEFT JOIN ${deliveries} d
              ON d.workspace_id = dl.workspace_id AND d.id = dl.delivery_id
            LEFT JOIN ${deliveryReturns} dr
              ON im.source_type = 'delivery_return'
              AND dr.workspace_id = im.workspace_id AND dr.id = im.source_id
            LEFT JOIN ${deliveryReturnLines} drl
              ON drl.return_id = dr.id AND drl.delivery_line_id = im.source_line_id
            LEFT JOIN ${deliveryLines} return_dl
              ON return_dl.workspace_id = im.workspace_id
              AND return_dl.id = drl.delivery_line_id
            LEFT JOIN ${qualityDispositions} qd
              ON im.source_type = 'quality_disposition'
              AND qd.workspace_id = im.workspace_id AND qd.id = im.source_id
            LEFT JOIN ${qualityDispositionAllocations} qda
              ON qda.workspace_id = qd.workspace_id
              AND qda.disposition_id = qd.id AND qda.id = im.source_line_id
            LEFT JOIN ${qualityDispositionAllocations} source_qda
              ON qd.source_type = 'quarantine_allocation'
              AND source_qda.workspace_id = qd.workspace_id
              AND source_qda.id = qd.source_quarantine_allocation_id
            LEFT JOIN ${qualityDispositions} source_qd
              ON source_qd.workspace_id = source_qda.workspace_id
              AND source_qd.id = source_qda.disposition_id
            LEFT JOIN ${goodsArrivalLines} root_line
              ON root_line.workspace_id = im.workspace_id
              AND root_line.id = coalesce(qd.source_arrival_line_id, source_qd.source_arrival_line_id)
            LEFT JOIN ${qualityDispositionReversals} qdr
              ON im.source_type = 'quality_disposition_reversal'
              AND qdr.workspace_id = im.workspace_id AND qdr.id = im.source_id
            LEFT JOIN ${qualityDispositions} reversed_qd
              ON reversed_qd.workspace_id = qdr.workspace_id
              AND reversed_qd.id = qdr.disposition_id
            LEFT JOIN ${qualityDispositionAllocations} reversed_qda
              ON reversed_qda.workspace_id = reversed_qd.workspace_id
              AND reversed_qda.disposition_id = reversed_qd.id
              AND reversed_qda.id = im.source_line_id
            LEFT JOIN ${inventoryMovements} original
              ON original.id = im.reversal_of_movement_id
            WHERE im.workspace_id = ${workspaceId}::uuid
              AND (
                im.quantity_scaled = 0
                OR (im.source_type = 'inventory_adjustment'
                  AND (im.reason_code IS NULL OR nullif(btrim(im.reason), '') IS NULL))
                OR (im.source_type = 'purchase_receipt' AND pr.id IS NULL)
                OR (im.source_type = 'purchase_receipt_reversal'
                  AND (prr.id IS NULL OR original.id IS NULL
                    OR im.reversal_of_movement_id <> original.id
                    OR im.product_id <> original.product_id
                    OR im.quality_grade_id IS DISTINCT FROM original.quality_grade_id
                    OR im.unit <> original.unit
                    OR im.quantity_scaled <> -original.quantity_scaled))
                OR (im.source_type = 'quality_disposition'
                  AND (qd.id IS NULL OR qda.id IS NULL OR qda.outcome <> 'accepted'
                    OR root_line.id IS NULL OR root_line.product_id <> im.product_id
                    OR qda.unit <> im.unit
                    OR qda.quality_grade_id IS DISTINCT FROM im.quality_grade_id
                    OR qda.value_scaled <> im.quantity_scaled))
                OR (im.source_type = 'quality_disposition_reversal'
                  AND (qdr.id IS NULL OR reversed_qd.id IS NULL OR reversed_qda.id IS NULL
                    OR original.id IS NULL OR original.source_type <> 'quality_disposition'
                    OR original.source_id <> reversed_qd.id
                    OR original.source_line_id <> reversed_qda.id
                    OR im.reversal_of_movement_id <> original.id
                    OR im.product_id <> original.product_id
                    OR im.quality_grade_id IS DISTINCT FROM original.quality_grade_id
                    OR im.unit <> original.unit
                    OR im.quantity_scaled <> -original.quantity_scaled))
                OR (im.source_type = 'delivery_dispatch'
                  AND (d.id IS NULL OR dl.id IS NULL
                    OR dl.product_id <> im.product_id OR dl.unit <> im.unit
                    OR -dl.quantity_scaled <> im.quantity_scaled))
                OR (im.source_type = 'delivery_return'
                  AND (dr.id IS NULL OR drl.delivery_line_id IS NULL
                    OR return_dl.id IS NULL
                    OR return_dl.product_id <> im.product_id
                    OR return_dl.unit <> im.unit
                    OR drl.quantity_scaled <> im.quantity_scaled
                    OR original.id IS NULL
                    OR original.source_type <> 'delivery_dispatch'
                    OR original.source_id <> dr.delivery_id
                    OR original.source_line_id <> drl.delivery_line_id))
              )
          ),
          inventory_anomalies AS (
            SELECT product_id, quality_grade_id, unit FROM inventory_projection_anomalies
            UNION SELECT product_id, quality_grade_id, unit FROM inventory_source_anomalies
          )
          SELECT
            (SELECT count(*)::int FROM ${suppliers}
              WHERE workspace_id = ${workspaceId}::uuid) supplier_count,
            (SELECT count(*)::int FROM supplier_anomalies) anomalous_suppliers,
            (SELECT count(*)::int FROM inventory_anomalies) anomalous_inventory_keys
        `);
      const goods = goodsRows[0] as
        | {
            supplier_count?: number;
            anomalous_suppliers?: number;
            anomalous_inventory_keys?: number;
          }
        | undefined;
      const supplierCount = Number(goods?.supplier_count ?? 0);
      const anomalousSuppliers = Number(goods?.anomalous_suppliers ?? 0);
      const anomalousInventoryKeys = Number(goods?.anomalous_inventory_keys ?? 0);
      return {
        workspaceId,
        healthyCustomers: customerCount - anomalousCustomers,
        anomalousCustomers,
        missingSources,
        duplicateSources,
        projectionDrift,
        healthySuppliers: supplierCount - anomalousSuppliers,
        anomalousSuppliers,
        anomalousInventoryKeys,
        status:
          anomalousCustomers === 0 && anomalousSuppliers === 0 && anomalousInventoryKeys === 0
            ? ("healthy" as const)
            : ("attention" as const),
      };
    },
    async backupPayload(workspaceId: string) {
      const workspace = await tx
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      if (workspace[0] === undefined) return null;
      const [
        operationalProfileRows,
        cashAccountRows,
        expenseRows,
        expenseReversalRows,
        cashTransferRows,
        cashTransferReversalRows,
        cashAdjustmentRows,
        cashMovementRows,
        membershipRows,
        membershipRoleRows,
        customerRows,
        productRows,
        customerOrderRows,
        customerOrderLineRows,
        supplyCommitmentRows,
        supplyCommitmentLineRows,
        priceRuleRows,
        qualityGradeRows,
        qualityIssueCodeRows,
        goodsArrivalRows,
        goodsArrivalLineRows,
        goodsArrivalReversalRows,
        qualityInspectionRows,
        qualityInspectionIssueRows,
        qualityInspectionReversalRows,
        qualityDispositionRows,
        qualityDispositionAllocationRows,
        qualityDispositionReversalRows,
        saleRows,
        saleLineRows,
        saleVoidRows,
        paymentRows,
        reversalRows,
        paymentAllocationRows,
        paymentAllocationReversalRows,
        entryRows,
        auditRows,
        receiptRows,
        supplierRows,
        supplierPaymentRows,
        supplierPaymentReversalRows,
        supplierEntryRows,
        purchaseRows,
        purchaseLineRows,
        purchaseVoidRows,
        purchaseReceiptRows,
        purchaseReceiptLineRows,
        purchaseReceiptReversalRows,
        inventoryMovementRows,
        deliveryRows,
        deliveryLineRows,
        deliveryReturnRows,
        deliveryReturnLineRows,
        documentRows,
        documentShareRows,
        costObservationRows,
        reconciliationObservationRows,
        debtObservationRows,
        supplyCommitmentObservationRows,
        supplierObservationRows,
        demandObservationRows,
        workspacePolicyRows,
        stocktakeSessionRows,
        stocktakeCountRows,
      ] = await Promise.all([
        tx
          .select()
          .from(workspaceOperationalProfiles)
          .where(eq(workspaceOperationalProfiles.workspaceId, workspaceId))
          .limit(1),
        tx.select().from(cashAccounts).where(eq(cashAccounts.workspaceId, workspaceId)),
        tx.select().from(expenses).where(eq(expenses.workspaceId, workspaceId)),
        tx.select().from(expenseReversals).where(eq(expenseReversals.workspaceId, workspaceId)),
        tx.select().from(cashTransfers).where(eq(cashTransfers.workspaceId, workspaceId)),
        tx
          .select()
          .from(cashTransferReversals)
          .where(eq(cashTransferReversals.workspaceId, workspaceId)),
        tx.select().from(cashAdjustments).where(eq(cashAdjustments.workspaceId, workspaceId)),
        tx.select().from(cashMovements).where(eq(cashMovements.workspaceId, workspaceId)),
        tx
          .select()
          .from(workspaceMemberships)
          .where(eq(workspaceMemberships.workspaceId, workspaceId)),
        tx
          .select()
          .from(workspaceMembershipRoles)
          .where(eq(workspaceMembershipRoles.workspaceId, workspaceId)),
        tx.select().from(customers).where(eq(customers.workspaceId, workspaceId)),
        tx.select().from(products).where(eq(products.workspaceId, workspaceId)),
        tx.select().from(customerOrders).where(eq(customerOrders.workspaceId, workspaceId)),
        tx.select().from(customerOrderLines).where(eq(customerOrderLines.workspaceId, workspaceId)),
        tx.select().from(supplyCommitments).where(eq(supplyCommitments.workspaceId, workspaceId)),
        tx
          .select()
          .from(supplyCommitmentLines)
          .where(eq(supplyCommitmentLines.workspaceId, workspaceId)),
        tx.select().from(priceRules).where(eq(priceRules.workspaceId, workspaceId)),
        tx.select().from(qualityGrades).where(eq(qualityGrades.workspaceId, workspaceId)),
        tx.select().from(qualityIssueCodes).where(eq(qualityIssueCodes.workspaceId, workspaceId)),
        tx.select().from(goodsArrivals).where(eq(goodsArrivals.workspaceId, workspaceId)),
        tx.select().from(goodsArrivalLines).where(eq(goodsArrivalLines.workspaceId, workspaceId)),
        tx
          .select()
          .from(goodsArrivalReversals)
          .where(eq(goodsArrivalReversals.workspaceId, workspaceId)),
        tx.select().from(qualityInspections).where(eq(qualityInspections.workspaceId, workspaceId)),
        tx
          .select()
          .from(qualityInspectionIssues)
          .where(eq(qualityInspectionIssues.workspaceId, workspaceId)),
        tx
          .select()
          .from(qualityInspectionReversals)
          .where(eq(qualityInspectionReversals.workspaceId, workspaceId)),
        tx
          .select()
          .from(qualityDispositions)
          .where(eq(qualityDispositions.workspaceId, workspaceId)),
        tx
          .select()
          .from(qualityDispositionAllocations)
          .where(eq(qualityDispositionAllocations.workspaceId, workspaceId)),
        tx
          .select()
          .from(qualityDispositionReversals)
          .where(eq(qualityDispositionReversals.workspaceId, workspaceId)),
        tx.select().from(sales).where(eq(sales.workspaceId, workspaceId)),
        tx.select().from(saleLines).where(eq(saleLines.workspaceId, workspaceId)),
        tx.select().from(saleVoids).where(eq(saleVoids.workspaceId, workspaceId)),
        tx.select().from(payments).where(eq(payments.workspaceId, workspaceId)),
        tx.select().from(paymentReversals).where(eq(paymentReversals.workspaceId, workspaceId)),
        tx.select().from(paymentAllocations).where(eq(paymentAllocations.workspaceId, workspaceId)),
        tx
          .select()
          .from(paymentAllocationReversals)
          .where(eq(paymentAllocationReversals.workspaceId, workspaceId)),
        tx
          .select()
          .from(customerAccountEntries)
          .where(eq(customerAccountEntries.workspaceId, workspaceId)),
        tx.select().from(auditLogs).where(eq(auditLogs.workspaceId, workspaceId)),
        tx
          .select()
          .from(commandReceipts)
          .where(
            and(
              eq(commandReceipts.workspaceId, workspaceId),
              /*
               * An export receipt contains the exported document as its
               * idempotent result. Including it in the next export recursively
               * embeds the previous backup and makes every generation larger.
               * The audit row remains part of the logical backup; only this
               * transport receipt is excluded.
               */
              ne(commandReceipts.commandType, "ExportWorkspaceBackup"),
            ),
          ),
        tx.select().from(suppliers).where(eq(suppliers.workspaceId, workspaceId)),
        tx.select().from(supplierPayments).where(eq(supplierPayments.workspaceId, workspaceId)),
        tx
          .select()
          .from(supplierPaymentReversals)
          .where(eq(supplierPaymentReversals.workspaceId, workspaceId)),
        tx
          .select()
          .from(supplierAccountEntries)
          .where(eq(supplierAccountEntries.workspaceId, workspaceId)),
        tx.select().from(purchases).where(eq(purchases.workspaceId, workspaceId)),
        tx.select().from(purchaseLines).where(eq(purchaseLines.workspaceId, workspaceId)),
        tx.select().from(purchaseVoids).where(eq(purchaseVoids.workspaceId, workspaceId)),
        tx.select().from(purchaseReceipts).where(eq(purchaseReceipts.workspaceId, workspaceId)),
        tx
          .select()
          .from(purchaseReceiptLines)
          .where(eq(purchaseReceiptLines.workspaceId, workspaceId)),
        tx
          .select()
          .from(purchaseReceiptReversals)
          .where(eq(purchaseReceiptReversals.workspaceId, workspaceId)),
        tx.select().from(inventoryMovements).where(eq(inventoryMovements.workspaceId, workspaceId)),
        tx.select().from(deliveries).where(eq(deliveries.workspaceId, workspaceId)),
        tx.select().from(deliveryLines).where(eq(deliveryLines.workspaceId, workspaceId)),
        tx.select().from(deliveryReturns).where(eq(deliveryReturns.workspaceId, workspaceId)),
        tx
          .select({ line: deliveryReturnLines })
          .from(deliveryReturnLines)
          .innerJoin(deliveryReturns, eq(deliveryReturns.id, deliveryReturnLines.returnId))
          .where(eq(deliveryReturns.workspaceId, workspaceId)),
        tx.select().from(documents).where(eq(documents.workspaceId, workspaceId)),
        tx.select().from(documentShares).where(eq(documentShares.workspaceId, workspaceId)),
        tx.select().from(costObservations).where(eq(costObservations.workspaceId, workspaceId)),
        tx
          .select()
          .from(reconciliationObservations)
          .where(eq(reconciliationObservations.workspaceId, workspaceId)),
        tx.select().from(debtObservations).where(eq(debtObservations.workspaceId, workspaceId)),
        tx
          .select()
          .from(supplyCommitmentObservations)
          .where(eq(supplyCommitmentObservations.workspaceId, workspaceId)),
        tx
          .select()
          .from(supplierObservations)
          .where(eq(supplierObservations.workspaceId, workspaceId)),
        tx.select().from(demandObservations).where(eq(demandObservations.workspaceId, workspaceId)),
        tx.select().from(workspacePolicies).where(eq(workspacePolicies.workspaceId, workspaceId)),
        tx.select().from(stocktakeSessions).where(eq(stocktakeSessions.workspaceId, workspaceId)),
        tx.select().from(stocktakeCounts).where(eq(stocktakeCounts.workspaceId, workspaceId)),
      ]);
      const closeBackup = await readOperationsCloseBackup(tx, workspaceId);
      const plain = (value: unknown): Record<string, unknown> =>
        JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
      const list = (values: readonly unknown[]) => values.map(plain);
      const roleSets = new Map<string, WorkspaceRole[]>();
      for (const row of membershipRoleRows) {
        const roles = roleSets.get(row.actorId) ?? [];
        roles.push(row.role);
        roleSets.set(row.actorId, roles);
      }
      const membershipSnapshots = membershipRows.map((row) => ({
        ...row,
        // Control-plane evidence only. Restore deliberately keeps the recovery
        // workspace's own memberships rather than importing source access.
        roles: normalizeWorkspaceRoles(roleSets.get(row.actorId) ?? [row.role]),
      }));
      return {
        workspace: plain(workspace[0]),
        operationalProfile: plain(
          operationalProfileRows[0] ?? {
            workspaceId,
            purchasingMode: "purchase_receiving",
            inventoryMode: "movement_ledger",
            qualityGradeMode: "required",
            deliveryMode: "sale_fulfilment",
            cashbookMode: "disabled",
            intakeMode: "direct_receipt",
            weighingMode: "quantity_only",
            businessDayStartMinute: 0,
            version: 1,
          },
        ),
        cashAccounts: list(cashAccountRows),
        expenses: list(expenseRows),
        expenseReversals: list(expenseReversalRows),
        cashTransfers: list(cashTransferRows),
        cashTransferReversals: list(cashTransferReversalRows),
        cashAdjustments: list(cashAdjustmentRows),
        cashMovements: list(cashMovementRows),
        memberships: list(membershipSnapshots),
        customers: list(customerRows),
        products: list(productRows),
        customerOrders: list(customerOrderRows),
        customerOrderLines: list(customerOrderLineRows),
        supplyCommitments: list(supplyCommitmentRows),
        supplyCommitmentLines: list(supplyCommitmentLineRows),
        priceRules: list(priceRuleRows),
        qualityGrades: list(qualityGradeRows),
        qualityIssueCodes: list(qualityIssueCodeRows),
        goodsArrivals: list(goodsArrivalRows),
        goodsArrivalLines: list(goodsArrivalLineRows),
        goodsArrivalReversals: list(goodsArrivalReversalRows),
        qualityInspections: list(qualityInspectionRows),
        qualityInspectionIssues: list(qualityInspectionIssueRows),
        qualityInspectionReversals: list(qualityInspectionReversalRows),
        qualityDispositions: list(qualityDispositionRows),
        qualityDispositionAllocations: list(qualityDispositionAllocationRows),
        qualityDispositionReversals: list(qualityDispositionReversalRows),
        sales: list(saleRows),
        saleLines: list(saleLineRows),
        saleVoids: list(saleVoidRows),
        payments: list(paymentRows),
        paymentReversals: list(reversalRows),
        paymentAllocations: list(paymentAllocationRows),
        paymentAllocationReversals: list(paymentAllocationReversalRows),
        accountEntries: list(entryRows),
        audit: list(auditRows),
        commandReceipts: list(receiptRows),
        suppliers: list(supplierRows),
        supplierPayments: list(supplierPaymentRows),
        supplierPaymentReversals: list(supplierPaymentReversalRows),
        supplierAccountEntries: list(supplierEntryRows),
        purchases: list(purchaseRows),
        purchaseLines: list(purchaseLineRows),
        purchaseVoids: list(purchaseVoidRows),
        receipts: list(purchaseReceiptRows),
        receiptLines: list(purchaseReceiptLineRows),
        receiptReversals: list(purchaseReceiptReversalRows),
        inventoryMovements: list(inventoryMovementRows),
        deliveries: list(deliveryRows),
        deliveryLines: list(deliveryLineRows),
        deliveryReturns: list(deliveryReturnRows),
        deliveryReturnLines: list(deliveryReturnLineRows.map((row) => row.line)),
        documents: list(documentRows),
        documentShares: list(documentShareRows),
        costObservations: list(costObservationRows),
        reconciliationObservations: list(reconciliationObservationRows),
        debtObservations: list(debtObservationRows),
        supplyCommitmentObservations: list(supplyCommitmentObservationRows),
        supplierObservations: list(supplierObservationRows),
        demandObservations: list(demandObservationRows),
        workspacePolicies: list(workspacePolicyRows),
        stocktakeSessions: list(stocktakeSessionRows),
        stocktakeCounts: list(stocktakeCountRows),
        operationalCloses: closeBackup.operationalCloses,
        operationalCloseReopens: closeBackup.operationalCloseReopens,
        cashStatementMatches: closeBackup.cashStatementMatches,
        cashStatementMatchReversals: closeBackup.cashStatementMatchReversals,
      };
    },
  },
});

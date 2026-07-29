import type { Repositories } from "../../ports.ts";
import type { CustomerAccountEntryDto } from "@vuarau/domain-contracts";
import { key } from "../store.ts";
import type { Store } from "../store.ts";

export const createOperationsReads = (store: Store): Pick<Repositories, "operationsReads"> => ({
  operationsReads: {
    integrity: async (workspaceId) => {
      const customers = [...store.customers.values()].filter(
        (customer) => customer.workspaceId === workspaceId,
      );
      const entries = store.accountEntries.filter((entry) => entry.workspaceId === workspaceId);
      const anomalousCustomerIds = new Set<string>();
      let projectionDrift = 0;
      for (const customer of customers) {
        const ledger = entries
          .filter((entry) => entry.customerId === customer.id)
          .reduce((sum, entry) => sum + entry.amount.amountMinor, 0);
        if (
          (store.balances.get(key(workspaceId, customer.id))?.balance.amountMinor ?? 0) !== ledger
        ) {
          projectionDrift += 1;
          anomalousCustomerIds.add(customer.id);
        }
      }
      const validSource = (entry: CustomerAccountEntryDto): boolean => {
        if (entry.sourceType === "manual_adjustment") {
          return entry.amount.amountMinor !== 0 && (entry.reason?.trim().length ?? 0) > 0;
        }
        if (entry.sourceType === "sale_posting") {
          const sale = [...store.sales.values()].find((item) => item.id === entry.sourceId);
          return (
            sale !== undefined &&
            sale.workspaceId === entry.workspaceId &&
            sale.customerId === entry.customerId &&
            sale.status === "posted" &&
            sale.totalAmount.amountMinor === entry.amount.amountMinor &&
            sale.totalAmount.currency === entry.amount.currency
          );
        }
        if (entry.sourceType === "sale_void") {
          const record = store.saleVoids.find((item) => item.id === entry.sourceId);
          const sale =
            record === undefined
              ? undefined
              : [...store.sales.values()].find((item) => item.id === record.saleId);
          return (
            record !== undefined &&
            sale !== undefined &&
            record.workspaceId === entry.workspaceId &&
            sale.customerId === entry.customerId &&
            -record.amount.amountMinor === entry.amount.amountMinor &&
            record.amount.currency === entry.amount.currency
          );
        }
        if (entry.sourceType === "payment") {
          const payment = [...store.payments.values()].find((item) => item.id === entry.sourceId);
          return (
            payment !== undefined &&
            payment.workspaceId === entry.workspaceId &&
            payment.customerId === entry.customerId &&
            -payment.amount.amountMinor === entry.amount.amountMinor &&
            payment.amount.currency === entry.amount.currency
          );
        }
        const reversal = store.reversals.find((item) => item.id === entry.sourceId);
        const payment =
          reversal === undefined
            ? undefined
            : [...store.payments.values()].find((item) => item.id === reversal.paymentId);
        return (
          reversal !== undefined &&
          payment !== undefined &&
          reversal.workspaceId === entry.workspaceId &&
          payment.customerId === entry.customerId &&
          reversal.amount.amountMinor === entry.amount.amountMinor &&
          reversal.amount.currency === entry.amount.currency
        );
      };
      const missingSources = entries.filter((entry) => {
        const invalid = !validSource(entry);
        if (invalid) anomalousCustomerIds.add(entry.customerId);
        return invalid;
      }).length;
      const sourceCounts = new Map<string, { count: number; customerId: string }>();
      for (const entry of entries) {
        const sourceKey = `${entry.sourceType}:${entry.sourceId}`;
        const current = sourceCounts.get(sourceKey);
        sourceCounts.set(sourceKey, {
          count: (current?.count ?? 0) + 1,
          customerId: current?.customerId ?? entry.customerId,
        });
      }
      let duplicateSources = 0;
      for (const source of sourceCounts.values()) {
        if (source.count <= 1) continue;
        duplicateSources += source.count - 1;
        anomalousCustomerIds.add(source.customerId);
      }
      const anomalousCustomers = anomalousCustomerIds.size;
      const suppliers = [...store.suppliers.values()].filter(
        (supplier) => supplier.workspaceId === workspaceId,
      );
      const anomalousSupplierIds = new Set(
        suppliers.flatMap((supplier) => {
          const ledger = store.supplierAccountEntries
            .filter(
              (entry) => entry.workspaceId === workspaceId && entry.supplierId === supplier.id,
            )
            .reduce((sum, entry) => sum + entry.amount.amountMinor, 0);
          const projected =
            store.supplierAccountBalances.get(key(workspaceId, supplier.id))?.balance.amountMinor ??
            0;
          return ledger === projected ? [] : [supplier.id];
        }),
      );
      const inventoryGroups = new Map<string, number>();
      const anomalousInventory = new Set<string>();
      for (const movement of store.inventoryMovements.filter(
        (item) => item.workspaceId === workspaceId,
      )) {
        const movementKey = `${movement.productId}:${movement.quantity.unit}`;
        inventoryGroups.set(
          movementKey,
          (inventoryGroups.get(movementKey) ?? 0) + movement.quantity.valueScaled,
        );
        if (movement.quantity.valueScaled === 0) anomalousInventory.add(movementKey);
        if (
          movement.sourceType === "inventory_adjustment" &&
          (movement.reasonCode === null || (movement.reason?.trim().length ?? 0) === 0)
        )
          anomalousInventory.add(movementKey);
        if (movement.sourceType === "delivery_dispatch") {
          const delivery = store.deliveries.get(key(workspaceId, movement.sourceId));
          const line = delivery?.lines.find(
            (item) => item.deliveryLineId === movement.sourceLineId,
          );
          if (
            line === undefined ||
            line.productId !== movement.productId ||
            line.quantity.unit !== movement.quantity.unit ||
            -line.quantity.valueScaled !== movement.quantity.valueScaled
          )
            anomalousInventory.add(movementKey);
        }
        if (movement.sourceType === "delivery_return") {
          const returned = store.deliveryReturns.find(
            (item) => item.workspaceId === workspaceId && item.id === movement.sourceId,
          );
          const line = returned?.lines.find(
            (item) => item.deliveryLineId === movement.sourceLineId,
          );
          const original = store.inventoryMovements.find(
            (item) => item.id === movement.reversalOfMovementId,
          );
          if (
            line === undefined ||
            line.quantity.valueScaled !== movement.quantity.valueScaled ||
            line.quantity.unit !== movement.quantity.unit ||
            original?.sourceType !== "delivery_dispatch" ||
            original.sourceId !== returned?.deliveryId ||
            original.sourceLineId !== line.deliveryLineId
          )
            anomalousInventory.add(movementKey);
        }
      }
      for (const [inventoryKey, quantity] of inventoryGroups)
        if (
          store.inventoryBalances.get(`${workspaceId}:${inventoryKey}`)?.quantityScaled !== quantity
        )
          anomalousInventory.add(inventoryKey);
      const anomalousInventoryKeys = anomalousInventory.size;
      return {
        workspaceId,
        healthyCustomers: customers.length - anomalousCustomers,
        anomalousCustomers,
        missingSources,
        duplicateSources,
        projectionDrift,
        healthySuppliers: suppliers.length - anomalousSupplierIds.size,
        anomalousSuppliers: anomalousSupplierIds.size,
        anomalousInventoryKeys,
        status:
          anomalousCustomers === 0 &&
          anomalousSupplierIds.size === 0 &&
          anomalousInventoryKeys === 0
            ? ("healthy" as const)
            : ("attention" as const),
      };
    },
    backupPayload: async (workspaceId) => {
      const workspaceName = store.workspaceNames.get(workspaceId);
      if (workspaceName === undefined) return null;
      const rows = <T extends { readonly workspaceId: string }>(values: Iterable<T>) =>
        [...values].filter((row) => row.workspaceId === workspaceId);
      const sales = rows(store.sales.values());
      return {
        workspace: { id: workspaceId, name: workspaceName },
        memberships: rows(store.memberships.values()),
        customers: rows(store.customers.values()),
        products: rows(store.products.values()),
        sales,
        saleLines: sales.flatMap((sale) =>
          sale.lines.map((line) => ({ ...line, saleId: sale.id, workspaceId })),
        ),
        saleVoids: rows(store.saleVoids),
        payments: rows(store.payments.values()),
        paymentReversals: rows(store.reversals),
        accountEntries: rows(store.accountEntries),
        audit: rows(store.audit),
        commandReceipts: rows(store.receipts.values()).filter(
          (receipt) => receipt.commandType !== "ExportWorkspaceBackup",
        ),
        suppliers: rows(store.suppliers.values()),
        supplierPayments: rows(store.supplierPayments.values()),
        supplierPaymentReversals: rows(store.supplierPaymentReversals),
        supplierAccountEntries: rows(store.supplierAccountEntries),
        purchases: rows(store.purchases.values()),
        purchaseLines: rows(store.purchases.values()).flatMap((purchase) =>
          purchase.lines.map((line) => ({ ...line, purchaseId: purchase.id, workspaceId })),
        ),
        purchaseVoids: rows(store.purchaseVoids),
        receipts: rows(store.purchaseReceipts.values()),
        receiptLines: rows(store.purchaseReceipts.values()).flatMap((receipt) =>
          receipt.lines.map((line) => ({ ...line, receiptId: receipt.id, workspaceId })),
        ),
        receiptReversals: rows(store.purchaseReceipts.values()).flatMap((receipt) =>
          receipt.reversal === null ? [] : [receipt.reversal],
        ),
        inventoryMovements: rows(store.inventoryMovements),
        deliveries: rows(store.deliveries.values()),
        deliveryLines: rows(store.deliveries.values()).flatMap((delivery) =>
          delivery.lines.map((line) => ({ ...line, deliveryId: delivery.id, workspaceId })),
        ),
        deliveryReturns: rows(store.deliveryReturns),
        deliveryReturnLines: rows(store.deliveryReturns).flatMap((record) =>
          record.lines.map((line) => ({ ...line, returnId: record.id })),
        ),
        documents: rows(store.documents.values()),
        documentShares: rows(store.documentShares.values()),
      };
    },
  },
});

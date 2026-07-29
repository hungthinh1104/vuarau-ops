import type { Repositories } from "../../ports.ts";
import type {
  ActorId,
  AuditRecordDto,
  CustomerAccountEntryDto,
  IsoInstant,
  WorkspaceId,
  SupplierAccountEntryDto,
  DocumentDto,
  DocumentShareId,
} from "@vuarau/domain-contracts";
import type { PaymentReversalState, SaleVoidState } from "@vuarau/domain-kernel";
import { money } from "@vuarau/domain-kernel";
import type { CommandReceipt } from "../../ports.ts";
import type {
  CustomerState,
  SaleState,
  PaymentState,
  ProductState,
  SupplierState,
  SupplierPaymentState,
  PurchaseState,
  PurchaseVoidState,
  PurchaseReceiptState,
  InventoryMovementState,
  DeliveryState,
  DeliveryReturnState,
} from "@vuarau/domain-kernel";
import { key } from "../store.ts";
import type { Store } from "../store.ts";

export const createOperationsRepositories = (store: Store): Pick<Repositories, "operations"> => ({
  operations: {
    restoreBackup: async (workspaceId, payload) => {
      const occupied =
        [
          ...store.customers.values(),
          ...store.products.values(),
          ...store.sales.values(),
          ...store.suppliers.values(),
          ...store.purchases.values(),
          ...store.deliveries.values(),
          ...store.documents.values(),
        ].some((row) => row.workspaceId === workspaceId) ||
        store.accountEntries.some((row) => row.workspaceId === workspaceId) ||
        store.inventoryMovements.some((row) => row.workspaceId === workspaceId);
      if (occupied) {
        return { kind: "unsafe_target" as const, reason: "target contains business data" };
      }
      try {
        const remap = <T extends Record<string, unknown>>(row: T) => ({
          ...row,
          workspaceId,
        });
        for (const raw of payload.customers) {
          const row = remap(raw) as unknown as CustomerState;
          store.customers.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.products) {
          const row = remap(raw) as unknown as ProductState;
          store.products.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.sales) {
          const row = remap(raw) as unknown as SaleState;
          store.sales.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.saleVoids) {
          store.saleVoids.push(remap(raw) as unknown as SaleVoidState);
        }
        for (const raw of payload.payments) {
          const row = remap(raw) as unknown as PaymentState;
          store.payments.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.paymentReversals) {
          store.reversals.push(remap(raw) as unknown as PaymentReversalState);
        }
        for (const raw of payload.accountEntries) {
          store.accountEntries.push(remap(raw) as unknown as CustomerAccountEntryDto);
        }
        for (const raw of payload.audit) {
          store.audit.push(remap(raw) as unknown as AuditRecordDto);
        }
        for (const raw of payload.commandReceipts) {
          const row = remap(raw) as unknown as CommandReceipt;
          store.receipts.set(key(workspaceId, row.idempotencyKey), row);
        }
        for (const raw of payload.suppliers) {
          const row = remap(raw) as unknown as SupplierState;
          store.suppliers.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.supplierPayments) {
          const row = remap(raw) as unknown as SupplierPaymentState;
          store.supplierPayments.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.supplierPaymentReversals) {
          store.supplierPaymentReversals.push(
            remap(raw) as unknown as Store["supplierPaymentReversals"][number],
          );
        }
        for (const raw of payload.supplierAccountEntries) {
          store.supplierAccountEntries.push(remap(raw) as unknown as SupplierAccountEntryDto);
        }
        for (const raw of payload.purchases) {
          const row = remap(raw) as unknown as PurchaseState;
          store.purchases.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.purchaseVoids) {
          store.purchaseVoids.push(remap(raw) as unknown as PurchaseVoidState);
        }
        for (const raw of payload.receipts) {
          const row = remap(raw) as unknown as PurchaseReceiptState;
          store.purchaseReceipts.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.inventoryMovements) {
          store.inventoryMovements.push(remap(raw) as unknown as InventoryMovementState);
        }
        for (const raw of payload.deliveries) {
          const row = remap(raw) as unknown as DeliveryState;
          store.deliveries.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.deliveryReturns)
          store.deliveryReturns.push(remap(raw) as unknown as DeliveryReturnState);
        for (const raw of payload.documents) {
          const row = remap(raw) as unknown as DocumentDto;
          store.documents.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.documentShares) {
          const row = remap(raw) as unknown as {
            id: DocumentShareId;
            workspaceId: WorkspaceId;
            documentId: DocumentDto["id"];
            tokenHash: string;
            expiresAt: IsoInstant | null;
            createdAt: IsoInstant;
            createdBy: ActorId;
            revokedAt: IsoInstant | null;
            revokedBy: ActorId | null;
            revokeReason: string | null;
          };
          store.documentShares.set(key(workspaceId, row.id), row);
        }
        for (const customer of [...store.customers.values()].filter(
          (row) => row.workspaceId === workspaceId,
        )) {
          const entries = store.accountEntries.filter(
            (entry) => entry.workspaceId === workspaceId && entry.customerId === customer.id,
          );
          const balance = money(
            entries.reduce((sum, entry) => sum + entry.amount.amountMinor, 0),
            "VND",
          );
          store.balances.set(key(workspaceId, customer.id), {
            workspaceId,
            customerId: customer.id,
            balance,
            entryCount: entries.length,
            lastEntryTransactionTime:
              entries
                .map((entry) => entry.transactionTime)
                .sort()
                .at(-1) ?? null,
            updatedAt: new Date().toISOString() as IsoInstant,
          });
        }
        for (const supplier of [...store.suppliers.values()].filter(
          (row) => row.workspaceId === workspaceId,
        )) {
          const entries = store.supplierAccountEntries.filter(
            (entry) => entry.workspaceId === workspaceId && entry.supplierId === supplier.id,
          );
          store.supplierAccountBalances.set(key(workspaceId, supplier.id), {
            workspaceId,
            supplierId: supplier.id,
            balance: money(
              entries.reduce((sum, entry) => sum + entry.amount.amountMinor, 0),
              "VND",
            ),
            entryCount: entries.length,
            lastEntryTransactionTime:
              entries
                .map((entry) => entry.transactionTime)
                .sort()
                .at(-1) ?? null,
            updatedAt: new Date().toISOString() as IsoInstant,
          });
        }
        const inventoryKeys = new Set(
          store.inventoryMovements
            .filter((movement) => movement.workspaceId === workspaceId)
            .map((movement) => `${movement.productId}:${movement.quantity.unit}`),
        );
        for (const inventoryKey of inventoryKeys) {
          const [productId, unit] = inventoryKey.split(":");
          const movements = store.inventoryMovements.filter(
            (movement) =>
              movement.workspaceId === workspaceId &&
              movement.productId === productId &&
              movement.quantity.unit === unit,
          );
          store.inventoryBalances.set(`${workspaceId}:${inventoryKey}`, {
            workspaceId,
            productId: productId as InventoryMovementState["productId"],
            unit: unit as InventoryMovementState["quantity"]["unit"],
            quantityScaled: movements.reduce(
              (sum, movement) => sum + movement.quantity.valueScaled,
              0,
            ),
            movementCount: movements.length,
            lastMovementTransactionTime:
              movements
                .map((movement) => movement.transactionTime)
                .sort()
                .at(-1) ?? null,
            updatedAt: new Date().toISOString() as IsoInstant,
          });
        }
        return {
          kind: "restored" as const,
          counts: Object.fromEntries(
            Object.entries(payload).map(([name, rows]) => [
              name,
              Array.isArray(rows) ? rows.length : 1,
            ]),
          ),
        };
      } catch {
        return { kind: "integrity_error" as const, reason: "malformed canonical data" };
      }
    },
  },
});

import type { Repositories } from "../../ports.ts";
import type { SupplierAccountEntryDto } from "@vuarau/domain-contracts";
import { key } from "../store.ts";
import type { IdGenerator } from "../../../clock.ts";
import type { Store } from "../store.ts";

export const createSupplierRepositories = (
  store: Store,
  ids: IdGenerator,
): Pick<
  Repositories,
  "suppliers" | "supplierPayments" | "supplierAccountEntries" | "supplierAccountBalances"
> => ({
  suppliers: {
    findById: async (workspaceId, supplierId) =>
      store.suppliers.get(key(workspaceId, supplierId)) ?? null,
    findByIdForUpdate: async (workspaceId, supplierId) =>
      store.suppliers.get(key(workspaceId, supplierId)) ?? null,
    insert: async (supplier) => {
      store.suppliers.set(key(supplier.workspaceId, supplier.id), supplier);
    },
    update: async (supplier, expectedVersion) => {
      const current = store.suppliers.get(key(supplier.workspaceId, supplier.id));
      if (current === undefined || current.version !== expectedVersion) return false;
      store.suppliers.set(key(supplier.workspaceId, supplier.id), supplier);
      return true;
    },
  },
  supplierPayments: {
    findByIdForUpdate: async (workspaceId, paymentId) =>
      store.supplierPayments.get(key(workspaceId, paymentId)) ?? null,
    insert: async (payment) => {
      store.supplierPayments.set(key(payment.workspaceId, payment.id), payment);
    },
    update: async (payment, expectedVersion) => {
      const current = store.supplierPayments.get(key(payment.workspaceId, payment.id));
      if (current === undefined || current.version !== expectedVersion) return false;
      store.supplierPayments.set(key(payment.workspaceId, payment.id), payment);
      return true;
    },
    insertReversal: async (reversal) => {
      store.supplierPaymentReversals.push(reversal);
    },
  },
  supplierAccountEntries: {
    append: async (drafts) => {
      const entries = drafts.map((draft) => ({
        ...draft,
        id: ids.newId() as SupplierAccountEntryDto["id"],
      }));
      store.supplierAccountEntries.push(...entries);
      return entries;
    },
    listBySupplier: async (workspaceId, supplierId) =>
      store.supplierAccountEntries
        .filter((entry) => entry.workspaceId === workspaceId && entry.supplierId === supplierId)
        .sort((a, b) =>
          a.transactionTime !== b.transactionTime
            ? a.transactionTime.localeCompare(b.transactionTime)
            : a.recordedAt !== b.recordedAt
              ? a.recordedAt.localeCompare(b.recordedAt)
              : a.id.localeCompare(b.id),
        ),
    findBySource: async (workspaceId, sourceType, sourceId) =>
      store.supplierAccountEntries.find(
        (entry) =>
          entry.workspaceId === workspaceId &&
          entry.sourceType === sourceType &&
          entry.sourceId === sourceId,
      ) ?? null,
  },
  supplierAccountBalances: {
    get: async (workspaceId, supplierId) =>
      store.supplierAccountBalances.get(key(workspaceId, supplierId)) ?? null,
    applyDelta: async (delta) => {
      const balanceKey = key(delta.workspaceId, delta.supplierId);
      const current = store.supplierAccountBalances.get(balanceKey);
      store.supplierAccountBalances.set(balanceKey, {
        workspaceId: delta.workspaceId,
        supplierId: delta.supplierId,
        balance: {
          amountMinor: (current?.balance.amountMinor ?? 0) + delta.amount.amountMinor,
          currency: delta.amount.currency,
        },
        entryCount: (current?.entryCount ?? 0) + delta.entryCount,
        lastEntryTransactionTime:
          current?.lastEntryTransactionTime !== null &&
          current?.lastEntryTransactionTime !== undefined &&
          current.lastEntryTransactionTime > delta.lastEntryTransactionTime
            ? current.lastEntryTransactionTime
            : delta.lastEntryTransactionTime,
        updatedAt:
          current !== undefined && current.updatedAt > delta.updatedAt
            ? current.updatedAt
            : delta.updatedAt,
      });
    },
    save: async (balance) => {
      store.supplierAccountBalances.set(key(balance.workspaceId, balance.supplierId), balance);
    },
  },
});

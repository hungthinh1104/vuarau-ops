import type {
  ActorId,
  AuditRecordDto,
  SaleId,
  CustomerAccountEntryDto,
  IsoInstant,
  WorkspaceId,
  WorkspaceRole,
  Money,
  SupplierAccountEntryDto,
  DeliveryDto,
  DocumentDto,
  DocumentShareId,
  OperationalReportDto,
} from "@vuarau/domain-contracts";
import type { PaymentReversalState, SaleVoidState } from "@vuarau/domain-kernel";
import { classifyBalance, money, zeroMoney } from "@vuarau/domain-kernel";
import { DEFAULT_CURRENCY, encodeCursor } from "@vuarau/domain-contracts";
import type { IdGenerator } from "../../clock.ts";
import type { CommandReceipt, Repositories, UnitOfWork, WorkspaceMembership } from "../ports.ts";
import type {
  CustomerAccountBalance,
  CustomerState,
  SaleState,
  PaymentState,
  ProductState,
  SupplierState,
  SupplierPaymentState,
  PurchaseState,
  PurchaseVoidState,
  PurchaseReceiptState,
  PurchaseReceiptReversalState,
  InventoryMovementState,
  DeliveryState,
  DeliveryReturnState,
} from "@vuarau/domain-kernel";

/**
 * An in-memory implementation of every port, used by the application and contract
 * test projects.
 *
 * It is a real implementation, not a mock: it enforces the same version checks and
 * the same unique constraints the database does, and it rolls back on failure.
 * Tests that assert "the repository was called with X" pass when the repository
 * does the wrong thing with X — these tests assert on stored state instead.
 */
type Store = {
  memberships: Map<string, WorkspaceMembership & { readonly createdAt: IsoInstant }>;
  /** Workspace id → display name, which is all a picker needs (BR-AUTH-008). */
  workspaceNames: Map<string, string>;
  /** Supabase subject → local actor id (BR-AUTH-005). */
  actorsBySubject: Map<string, ActorId>;
  /** Actor display names, for the audit timeline's `actorDisplayName`. */
  actorNames: Map<string, string>;
  customers: Map<string, CustomerState>;
  products: Map<string, ProductState>;
  suppliers: Map<string, SupplierState>;
  supplierPayments: Map<string, SupplierPaymentState>;
  supplierPaymentReversals: Array<{
    id: string;
    workspaceId: WorkspaceId;
    supplierPaymentId: SupplierPaymentState["id"];
    amount: Money;
    reason: string;
    transactionTime: IsoInstant;
    recordedAt: IsoInstant;
  }>;
  supplierAccountEntries: SupplierAccountEntryDto[];
  supplierAccountBalances: Map<
    string,
    {
      workspaceId: WorkspaceId;
      supplierId: SupplierState["id"];
      balance: Money;
      entryCount: number;
      lastEntryTransactionTime: IsoInstant | null;
      updatedAt: IsoInstant;
    }
  >;
  purchases: Map<string, PurchaseState>;
  purchaseVoids: PurchaseVoidState[];
  purchaseReceipts: Map<string, PurchaseReceiptState>;
  inventoryMovements: InventoryMovementState[];
  inventoryBalances: Map<
    string,
    {
      workspaceId: WorkspaceId;
      productId: InventoryMovementState["productId"];
      unit: InventoryMovementState["quantity"]["unit"];
      quantityScaled: number;
      movementCount: number;
      lastMovementTransactionTime: IsoInstant | null;
      updatedAt: IsoInstant;
    }
  >;
  deliveries: Map<string, DeliveryState>;
  deliveryReturns: DeliveryReturnState[];
  documents: Map<string, DocumentDto>;
  documentShares: Map<
    string,
    {
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
    }
  >;
  sales: Map<string, SaleState>;
  payments: Map<string, PaymentState>;
  reversals: PaymentReversalState[];
  saleVoids: SaleVoidState[];
  accountEntries: CustomerAccountEntryDto[];
  balances: Map<string, CustomerAccountBalance>;
  audit: AuditRecordDto[];
  receipts: Map<string, CommandReceipt>;
};

function emptyStore(): Store {
  return {
    memberships: new Map(),
    workspaceNames: new Map(),
    actorsBySubject: new Map(),
    actorNames: new Map(),
    customers: new Map(),
    products: new Map(),
    suppliers: new Map(),
    supplierPayments: new Map(),
    supplierPaymentReversals: [],
    supplierAccountEntries: [],
    supplierAccountBalances: new Map(),
    purchases: new Map(),
    purchaseVoids: [],
    purchaseReceipts: new Map(),
    inventoryMovements: [],
    inventoryBalances: new Map(),
    deliveries: new Map(),
    deliveryReturns: [],
    documents: new Map(),
    documentShares: new Map(),
    sales: new Map(),
    payments: new Map(),
    reversals: [],
    saleVoids: [],
    accountEntries: [],
    balances: new Map(),
    audit: [],
    receipts: new Map(),
  };
}

const key = (workspaceId: string, id: string) => `${workspaceId}:${id}`;

/**
 * The read-side helpers. They mirror what the SQL does rather than what is
 * convenient in JavaScript: the same keyset comparison, the same deterministic
 * `(sortValue, id)` order, the same "read one extra row to learn whether there is
 * another page". A page-boundary bug that only one of the two exhibits is a bug
 * no test would catch.
 */
const ascendingBy =
  <T>(sortValue: (row: T) => string, id: (row: T) => string) =>
  (a: T, b: T): number =>
    sortValue(a) === sortValue(b)
      ? id(a).localeCompare(id(b))
      : sortValue(a).localeCompare(sortValue(b));

const descendingBy =
  <T>(sortValue: (row: T) => string, id: (row: T) => string) =>
  (a: T, b: T): number =>
    -ascendingBy(sortValue, id)(a, b);

/** `(sort, id) > (cursorSort, cursorId)` — the ascending keyset predicate. */
const after = (row: [string, string], cursor: [string, string]): boolean =>
  row[0] === cursor[0] ? row[1] > cursor[1] : row[0] > cursor[0];

/** `(sort, id) < (cursorSort, cursorId)` — the descending one. */
const before = (row: [string, string], cursor: [string, string]): boolean =>
  row[0] === cursor[0] ? row[1] < cursor[1] : row[0] < cursor[0];

function takePage<TRow>(
  rows: readonly TRow[],
  page: { limit: number },
  cursorOf: (row: TRow) => { sortValue: string; id: string },
): { rows: readonly TRow[]; next: { sortValue: string; id: string } | null } {
  if (rows.length <= page.limit) {
    return { rows, next: null };
  }
  const visible = rows.slice(0, page.limit);
  return { rows: visible, next: cursorOf(visible[visible.length - 1]!) };
}

/** Matches `vuarau_fold` in migration 0005, so search behaves the same in both. */
const FOLD_FROM =
  "ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴÝỶỸ" +
  "àáâãèéêìíòóôõùúăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵýỷỹ";
const FOLD_TO =
  "AAAAEEEIIOOOOUUADIUOUAAAAAAAAAAAAEEEEEEEEIIOOOOOOOOOOOOUUUUUUUYYYYY" +
  "aaaaeeeiioooouuadiuouaaaaaaaaaaaaeeeeeeeeiioooooooooooouuuuuuuyyyyy";

export function fold(text: string): string {
  let folded = "";
  for (const character of text) {
    const index = FOLD_FROM.indexOf(character);
    folded += index === -1 ? character : FOLD_TO[index];
  }
  return folded.toLowerCase();
}

function toPaymentSummaryRow(store: Store, payment: PaymentState) {
  return {
    id: payment.id,
    workspaceId: payment.workspaceId,
    customerId: payment.customerId,
    customerDisplayName:
      store.customers.get(key(payment.workspaceId, payment.customerId))?.displayName ?? "",
    amount: payment.amount,
    method: payment.method,
    status: payment.status,
    reversedAmount: payment.reversedAmount,
    payerName: payment.payerName,
    note: payment.note,
    version: payment.version,
    transactionTime: payment.transactionTime,
    recordedAt: payment.recordedAt,
  };
}

function toPurchaseDto(purchase: PurchaseState) {
  return {
    ...purchase,
    lines: purchase.lines.map((line) => ({ ...line })),
    voidRecord:
      purchase.voidRecord === null
        ? null
        : {
            id: purchase.voidRecord.id,
            purchaseId: purchase.voidRecord.purchaseId,
            reasonCode: purchase.voidRecord.reasonCode,
            reason: purchase.voidRecord.reason,
            amount: purchase.voidRecord.amount,
            transactionTime: purchase.voidRecord.transactionTime,
            recordedAt: purchase.voidRecord.recordedAt,
          },
  };
}

function toDeliveryDto(delivery: DeliveryState): DeliveryDto {
  return {
    id: delivery.id,
    workspaceId: delivery.workspaceId,
    saleId: delivery.saleId,
    status: delivery.status,
    lines: delivery.lines.map((line) => ({
      deliveryLineId: line.deliveryLineId,
      saleLineId: line.saleLineId,
      productId: line.productId,
      productName: line.productName,
      quantity: line.quantity,
      returnedQuantity: {
        valueScaled: delivery.returns
          .flatMap((record) => record.lines)
          .filter((candidate) => candidate.deliveryLineId === line.deliveryLineId)
          .reduce((sum, candidate) => sum + candidate.quantity.valueScaled, 0),
        unit: line.quantity.unit,
      },
    })),
    note: delivery.note,
    cancellationReason: delivery.cancellationReason,
    version: delivery.version,
    transactionTime: delivery.transactionTime,
    recordedAt: delivery.recordedAt,
    dispatchedAt: delivery.dispatchedAt,
    deliveredAt: delivery.deliveredAt,
    returns: delivery.returns.map((record) => ({
      id: record.id,
      reason: record.reason,
      lines: record.lines.map((line) => ({
        deliveryLineId: line.deliveryLineId,
        quantity: line.quantity,
      })),
      transactionTime: record.transactionTime,
      recordedAt: record.recordedAt,
      actorId: record.actorId,
    })),
  };
}

export class InMemoryDatabase {
  private store: Store = emptyStore();
  /** An explicit field: Node strips types, and a parameter property emits code. */
  private readonly ids: IdGenerator;

  constructor(ids: IdGenerator) {
    this.ids = ids;
  }

  /**
   * `role` defaults to `owner` to match the migration's backfill, so a test that
   * does not care about roles behaves exactly as it did before Milestone 1.
   */
  grantMembership(
    workspaceId: WorkspaceId,
    actorId: ActorId,
    role: WorkspaceRole = "owner",
    isActive = true,
  ): void {
    this.store.memberships.set(key(workspaceId, actorId), {
      workspaceId,
      actorId,
      role,
      isActive,
      createdAt: "2026-01-01T00:00:00.000Z" as IsoInstant,
    });
  }

  /**
   * Names a workspace, so it can appear in a picker.
   *
   * Mirrors the inner join in the SQL: a membership whose workspace was never
   * named is invisible to `listActiveWorkspaces`, exactly as a membership with no
   * `workspaces` row would be.
   */
  registerWorkspace(workspaceId: WorkspaceId, name: string): void {
    this.store.workspaceNames.set(workspaceId, name);
  }

  /** Links a verified JWT subject to a local actor. */
  registerActor(supabaseUserId: string, actorId: ActorId, displayName = "Test actor"): void {
    this.store.actorsBySubject.set(supabaseUserId, actorId);
    this.store.actorNames.set(actorId, displayName);
  }

  seedCustomer(customer: CustomerState): void {
    this.store.customers.set(key(customer.workspaceId, customer.id), customer);
  }

  seedProduct(product: ProductState): void {
    this.store.products.set(key(product.workspaceId, product.id), product);
  }

  seedSale(sale: SaleState): void {
    this.store.sales.set(key(sale.workspaceId, sale.id), sale);
  }

  seedPayment(payment: PaymentState): void {
    this.store.payments.set(key(payment.workspaceId, payment.id), payment);
  }

  /** Test-only corruption hook: reconciliation must make damaged rows visible. */
  seedAccountEntry(entry: CustomerAccountEntryDto): void {
    this.store.accountEntries.push(entry);
  }

  /** Test-only corruption hook for a ledger reference whose source vanished. */
  removeSale(workspaceId: WorkspaceId, saleId: SaleId): void {
    this.store.sales.delete(key(workspaceId, saleId));
  }

  accountEntries(): readonly CustomerAccountEntryDto[] {
    return this.store.accountEntries;
  }

  entriesFor(workspaceId: WorkspaceId, customerId: string): readonly CustomerAccountEntryDto[] {
    return this.store.accountEntries.filter(
      (entry) => entry.workspaceId === workspaceId && entry.customerId === customerId,
    );
  }

  saleVoids(): readonly SaleVoidState[] {
    return this.store.saleVoids;
  }

  auditRecords(): readonly AuditRecordDto[] {
    return this.store.audit;
  }

  reversals(): readonly PaymentReversalState[] {
    return this.store.reversals;
  }

  payments(): readonly PaymentState[] {
    return [...this.store.payments.values()];
  }

  inventoryMovementRecords(): readonly InventoryMovementState[] {
    return this.store.inventoryMovements;
  }

  deliveryRecords(): readonly DeliveryState[] {
    return [...this.store.deliveries.values()];
  }

  corruptDocumentSnapshot(
    workspaceId: WorkspaceId,
    documentId: DocumentDto["id"],
    snapshot: Record<string, unknown>,
  ): void {
    const documentKey = key(workspaceId, documentId);
    const current = this.store.documents.get(documentKey);
    if (current !== undefined) this.store.documents.set(documentKey, { ...current, snapshot });
  }

  balanceFor(workspaceId: WorkspaceId, customerId: string): CustomerAccountBalance | null {
    return this.store.balances.get(key(workspaceId, customerId)) ?? null;
  }

  /** Lets a test corrupt a projection, to prove the rebuild repairs it (CASE-ACCOUNT-007). */
  overwriteBalance(balance: CustomerAccountBalance): void {
    this.store.balances.set(key(balance.workspaceId, balance.customerId), balance);
  }

  unitOfWork(): UnitOfWork {
    return {
      transaction: async <T>(work: (repos: Repositories) => Promise<T>): Promise<T> => {
        // Snapshot-and-restore stands in for a database transaction. A command
        // that throws must leave nothing behind (BR-COMMAND-005), and a test that
        // cannot observe a rollback cannot prove that.
        //
        // It models atomicity, **not isolation**: two overlapping transactions
        // here can wipe each other's writes, which no database does. Concurrency
        // claims — the void race in BR-SALE-013, the idempotency claim in
        // ADR-0008 — belong in the db test project, against real Postgres.
        const snapshot = structuredClone(this.store);
        try {
          return await work(this.repositories());
        } catch (error) {
          this.store = snapshot;
          throw error;
        }
      },
    };
  }

  private repositories(): Repositories {
    const store = this.store;
    const ids = this.ids;

    return {
      workspaces: {
        findName: async (workspaceId) => store.workspaceNames.get(workspaceId) ?? null,
        // Returns inactive memberships too — the same semantics as the Drizzle
        // implementation, which this deliberately mirrors. Before Milestone 1 the
        // two disagreed about `is_active` and no application test could have
        // caught it.
        findMembership: async (workspaceId, actorId) =>
          store.memberships.get(key(workspaceId, actorId)) ?? null,

        countActiveOwnersForUpdate: async (workspaceId) =>
          [...store.memberships.values()].filter(
            (membership) =>
              membership.workspaceId === workspaceId &&
              membership.role === "owner" &&
              membership.isActive,
          ).length,

        revokeMembership: async (workspaceId, actorId) => {
          const membership = store.memberships.get(key(workspaceId, actorId));
          if (membership === undefined || !membership.isActive) {
            return false;
          }
          store.memberships.set(key(workspaceId, actorId), { ...membership, isActive: false });
          return true;
        },

        listMembers: async (workspaceId) =>
          [...store.memberships.values()]
            .filter((membership) => membership.workspaceId === workspaceId)
            .flatMap((membership) => {
              const displayName = store.actorNames.get(membership.actorId);
              return displayName === undefined ? [] : [{ ...membership, displayName }];
            })
            .sort((a, b) =>
              a.displayName === b.displayName
                ? a.actorId.localeCompare(b.actorId)
                : a.displayName.localeCompare(b.displayName),
            ),

        addMembership: async (workspaceId, actorId, role) => {
          const membershipKey = key(workspaceId, actorId);
          if (store.memberships.has(membershipKey)) return false;
          store.memberships.set(membershipKey, {
            workspaceId,
            actorId,
            role,
            isActive: true,
            createdAt: "2026-01-01T00:00:00.000Z" as IsoInstant,
          });
          return true;
        },

        changeMembershipRole: async (workspaceId, actorId, expectedRole, role) => {
          const membershipKey = key(workspaceId, actorId);
          const membership = store.memberships.get(membershipKey);
          if (membership === undefined || !membership.isActive || membership.role !== expectedRole)
            return false;
          store.memberships.set(membershipKey, { ...membership, role });
          return true;
        },

        reactivateMembership: async (workspaceId, actorId) => {
          const membershipKey = key(workspaceId, actorId);
          const membership = store.memberships.get(membershipKey);
          if (membership === undefined || membership.isActive) return false;
          store.memberships.set(membershipKey, { ...membership, isActive: true });
          return true;
        },
      },

      actors: {
        findBySupabaseUserId: async (supabaseUserId) => {
          const actorId = store.actorsBySubject.get(supabaseUserId);
          return actorId === undefined ? null : { actorId };
        },

        findById: async (actorId) => {
          const displayName = store.actorNames.get(actorId);
          return displayName === undefined ? null : { actorId, displayName };
        },

        listActiveWorkspaces: async (actorId) =>
          [...store.memberships.values()]
            .filter((membership) => membership.actorId === actorId && membership.isActive)
            .flatMap((membership) => {
              const workspaceName = store.workspaceNames.get(membership.workspaceId);
              // Inner join, as in the SQL: an unnamed workspace is not a door.
              return workspaceName === undefined
                ? []
                : [
                    {
                      workspaceId: membership.workspaceId,
                      workspaceName,
                      role: membership.role,
                    },
                  ];
            })
            .sort((a, b) =>
              a.workspaceName === b.workspaceName
                ? a.workspaceId.localeCompare(b.workspaceId)
                : a.workspaceName.localeCompare(b.workspaceName),
            ),
      },

      customers: {
        findById: async (workspaceId, customerId) =>
          store.customers.get(key(workspaceId, customerId)) ?? null,
        findByIdForUpdate: async (workspaceId, customerId) =>
          store.customers.get(key(workspaceId, customerId)) ?? null,
        insert: async (customer) => {
          store.customers.set(key(customer.workspaceId, customer.id), customer);
        },
        update: async (customer, expectedVersion) => {
          const current = store.customers.get(key(customer.workspaceId, customer.id));
          if (current === undefined || current.version !== expectedVersion) {
            return false;
          }
          store.customers.set(key(customer.workspaceId, customer.id), customer);
          return true;
        },
      },

      products: {
        findById: async (workspaceId, productId) =>
          store.products.get(key(workspaceId, productId)) ?? null,
        findByIdForUpdate: async (workspaceId, productId) =>
          store.products.get(key(workspaceId, productId)) ?? null,
        insert: async (product) => {
          store.products.set(key(product.workspaceId, product.id), product);
        },
        update: async (product, expectedVersion) => {
          const current = store.products.get(key(product.workspaceId, product.id));
          if (current === undefined || current.version !== expectedVersion) return false;
          store.products.set(key(product.workspaceId, product.id), product);
          return true;
        },
      },

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

      purchases: {
        findById: async (workspaceId, purchaseId) =>
          store.purchases.get(key(workspaceId, purchaseId)) ?? null,
        findReplacementOf: async (workspaceId, purchaseId) =>
          [...store.purchases.values()].find(
            (purchase) =>
              purchase.workspaceId === workspaceId && purchase.replacesPurchaseId === purchaseId,
          ) ?? null,
        findByIdForUpdate: async (workspaceId, purchaseId) =>
          store.purchases.get(key(workspaceId, purchaseId)) ?? null,
        insert: async (purchase) => {
          if (
            store.purchases.has(key(purchase.workspaceId, purchase.id)) ||
            (purchase.replacesPurchaseId !== null &&
              [...store.purchases.values()].some(
                (existing) =>
                  existing.workspaceId === purchase.workspaceId &&
                  existing.replacesPurchaseId === purchase.replacesPurchaseId,
              ))
          )
            return false;
          store.purchases.set(key(purchase.workspaceId, purchase.id), purchase);
          return true;
        },
        updateDraft: async (purchase, expectedVersion) => {
          const current = store.purchases.get(key(purchase.workspaceId, purchase.id));
          if (
            current === undefined ||
            current.version !== expectedVersion ||
            current.status !== "draft"
          )
            return false;
          store.purchases.set(key(purchase.workspaceId, purchase.id), purchase);
          return true;
        },
        confirm: async (purchase, expectedVersion) => {
          const current = store.purchases.get(key(purchase.workspaceId, purchase.id));
          if (
            current === undefined ||
            current.version !== expectedVersion ||
            current.status !== "draft"
          )
            return false;
          store.purchases.set(key(purchase.workspaceId, purchase.id), purchase);
          return true;
        },
        insertVoid: async (record) => {
          if (
            store.purchaseVoids.some(
              (row) =>
                row.workspaceId === record.workspaceId && row.purchaseId === record.purchaseId,
            )
          )
            return false;
          store.purchaseVoids.push(record);
          const current = store.purchases.get(key(record.workspaceId, record.purchaseId));
          if (current !== undefined) {
            store.purchases.set(key(record.workspaceId, record.purchaseId), {
              ...current,
              voidRecord: record,
            });
          }
          return true;
        },
      },

      purchaseReceipts: {
        findById: async (workspaceId, receiptId) =>
          store.purchaseReceipts.get(key(workspaceId, receiptId)) ?? null,
        insert: async (receipt) => {
          store.purchaseReceipts.set(key(receipt.workspaceId, receipt.id), receipt);
        },
        insertReversal: async (reversal: PurchaseReceiptReversalState) => {
          const receipt = store.purchaseReceipts.get(key(reversal.workspaceId, reversal.receiptId));
          if (receipt === undefined || receipt.reversal !== null) return false;
          store.purchaseReceipts.set(key(reversal.workspaceId, reversal.receiptId), {
            ...receipt,
            reversal,
          });
          return true;
        },
        netReceivedByPurchaseLine: async (workspaceId, purchaseId) => {
          const result = new Map<string, number>();
          for (const receipt of store.purchaseReceipts.values()) {
            if (
              receipt.workspaceId !== workspaceId ||
              receipt.purchaseId !== purchaseId ||
              receipt.reversal !== null
            )
              continue;
            for (const line of receipt.lines) {
              result.set(
                line.purchaseLineId,
                (result.get(line.purchaseLineId) ?? 0) + line.quantity.valueScaled,
              );
            }
          }
          return result;
        },
      },
      inventoryMovements: {
        append: async (movements) => {
          const appended: InventoryMovementState[] = [];
          for (const movement of movements) {
            const duplicate = store.inventoryMovements.some(
              (existing) =>
                existing.workspaceId === movement.workspaceId &&
                existing.sourceType === movement.sourceType &&
                existing.sourceId === movement.sourceId &&
                (movement.sourceType === "inventory_adjustment" ||
                  (movement.sourceLineId !== null &&
                    existing.sourceLineId === movement.sourceLineId)),
            );
            if (!duplicate) {
              appended.push({
                ...movement,
                id: ids.newId() as InventoryMovementState["id"],
              });
            }
          }
          store.inventoryMovements.push(...appended);
          return appended;
        },
        listByProduct: async (workspaceId, productId, unit) =>
          store.inventoryMovements
            .filter(
              (movement) =>
                movement.workspaceId === workspaceId &&
                movement.productId === productId &&
                (unit === null || movement.quantity.unit === unit),
            )
            .sort((a, b) =>
              a.transactionTime !== b.transactionTime
                ? a.transactionTime.localeCompare(b.transactionTime)
                : a.recordedAt !== b.recordedAt
                  ? a.recordedAt.localeCompare(b.recordedAt)
                  : a.id.localeCompare(b.id),
            ),
      },
      inventoryBalances: {
        get: async (workspaceId, productId, unit) =>
          store.inventoryBalances.get(`${workspaceId}:${productId}:${unit}`) ?? null,
        applyDelta: async (delta) => {
          const balanceKey = `${delta.workspaceId}:${delta.productId}:${delta.unit}`;
          const current = store.inventoryBalances.get(balanceKey);
          store.inventoryBalances.set(balanceKey, {
            workspaceId: delta.workspaceId,
            productId: delta.productId,
            unit: delta.unit,
            quantityScaled: (current?.quantityScaled ?? 0) + delta.quantityScaled,
            movementCount: (current?.movementCount ?? 0) + delta.movementCount,
            lastMovementTransactionTime:
              current?.lastMovementTransactionTime !== null &&
              current?.lastMovementTransactionTime !== undefined &&
              current.lastMovementTransactionTime > delta.lastMovementTransactionTime
                ? current.lastMovementTransactionTime
                : delta.lastMovementTransactionTime,
            updatedAt:
              current !== undefined && current.updatedAt > delta.updatedAt
                ? current.updatedAt
                : delta.updatedAt,
          });
        },
        save: async (balance) => {
          store.inventoryBalances.set(
            `${balance.workspaceId}:${balance.productId}:${balance.unit}`,
            balance,
          );
        },
      },
      deliveries: {
        findById: async (workspaceId, deliveryId) =>
          store.deliveries.get(key(workspaceId, deliveryId)) ?? null,
        findByIdForUpdate: async (workspaceId, deliveryId) =>
          store.deliveries.get(key(workspaceId, deliveryId)) ?? null,
        insert: async (delivery) => {
          const deliveryKey = key(delivery.workspaceId, delivery.id);
          if (store.deliveries.has(deliveryKey)) return false;
          store.deliveries.set(deliveryKey, delivery);
          return true;
        },
        update: async (delivery, expectedVersion) => {
          const deliveryKey = key(delivery.workspaceId, delivery.id);
          const current = store.deliveries.get(deliveryKey);
          if (current === undefined || current.version !== expectedVersion) return false;
          store.deliveries.set(deliveryKey, delivery);
          return true;
        },
        insertReturn: async (record) => {
          if (
            store.deliveryReturns.some(
              (candidate) =>
                candidate.workspaceId === record.workspaceId && candidate.id === record.id,
            )
          )
            return false;
          store.deliveryReturns.push(record);
          const deliveryKey = key(record.workspaceId, record.deliveryId);
          const delivery = store.deliveries.get(deliveryKey);
          if (delivery !== undefined)
            store.deliveries.set(deliveryKey, {
              ...delivery,
              returns: [...delivery.returns, record],
            });
          return true;
        },
        netFulfilledBySaleLine: async (workspaceId, saleId, excludeDeliveryId) => {
          const totals = new Map<string, number>();
          for (const delivery of store.deliveries.values()) {
            if (
              delivery.workspaceId !== workspaceId ||
              delivery.saleId !== saleId ||
              delivery.id === excludeDeliveryId ||
              !["dispatched", "delivered"].includes(delivery.status)
            )
              continue;
            for (const line of delivery.lines)
              totals.set(
                line.saleLineId,
                (totals.get(line.saleLineId) ?? 0) + line.quantity.valueScaled,
              );
          }
          for (const returned of store.deliveryReturns) {
            const delivery = store.deliveries.get(key(workspaceId, returned.deliveryId));
            if (
              returned.workspaceId !== workspaceId ||
              delivery?.saleId !== saleId ||
              delivery.id === excludeDeliveryId
            )
              continue;
            for (const line of returned.lines) {
              const deliveryLine = delivery.lines.find(
                (candidate) => candidate.deliveryLineId === line.deliveryLineId,
              );
              if (deliveryLine !== undefined)
                totals.set(
                  deliveryLine.saleLineId,
                  (totals.get(deliveryLine.saleLineId) ?? 0) - line.quantity.valueScaled,
                );
            }
          }
          return totals;
        },
        fulfilmentBySaleLine: async (workspaceId, saleId) => {
          const totals = new Map<string, { dispatched: number; returned: number }>();
          for (const delivery of store.deliveries.values()) {
            if (
              delivery.workspaceId !== workspaceId ||
              delivery.saleId !== saleId ||
              !["dispatched", "delivered"].includes(delivery.status)
            )
              continue;
            for (const line of delivery.lines) {
              const current = totals.get(line.saleLineId) ?? { dispatched: 0, returned: 0 };
              totals.set(line.saleLineId, {
                dispatched: current.dispatched + line.quantity.valueScaled,
                returned: current.returned,
              });
            }
          }
          for (const returned of store.deliveryReturns) {
            const delivery = store.deliveries.get(key(workspaceId, returned.deliveryId));
            if (returned.workspaceId !== workspaceId || delivery?.saleId !== saleId) continue;
            for (const line of returned.lines) {
              const deliveryLine = delivery.lines.find(
                (candidate) => candidate.deliveryLineId === line.deliveryLineId,
              );
              if (deliveryLine === undefined) continue;
              const current = totals.get(deliveryLine.saleLineId) ?? {
                dispatched: 0,
                returned: 0,
              };
              totals.set(deliveryLine.saleLineId, {
                dispatched: current.dispatched,
                returned: current.returned + line.quantity.valueScaled,
              });
            }
          }
          return totals;
        },
      },
      documents: {
        nextVersion: async ({ workspaceId, documentType, sourceType, sourceId }) =>
          Math.max(
            0,
            ...[...store.documents.values()]
              .filter(
                (document) =>
                  document.workspaceId === workspaceId &&
                  document.documentType === documentType &&
                  document.sourceType === sourceType &&
                  document.sourceId === sourceId,
              )
              .map((document) => document.version),
          ) + 1,
        insert: async (document) => {
          const documentKey = key(document.workspaceId, document.id);
          if (
            store.documents.has(documentKey) ||
            [...store.documents.values()].some(
              (candidate) =>
                candidate.workspaceId === document.workspaceId &&
                candidate.documentType === document.documentType &&
                candidate.sourceType === document.sourceType &&
                candidate.sourceId === document.sourceId &&
                candidate.version === document.version,
            )
          )
            return false;
          store.documents.set(documentKey, document);
          return true;
        },
        get: async (workspaceId, documentId) =>
          store.documents.get(key(workspaceId, documentId)) ?? null,
        insertShare: async (share) => {
          if (
            store.documentShares.has(key(share.workspaceId, share.id)) ||
            [...store.documentShares.values()].some(
              (candidate) => candidate.tokenHash === share.tokenHash,
            )
          )
            return false;
          store.documentShares.set(key(share.workspaceId, share.id), {
            ...share,
            revokedAt: null,
            revokedBy: null,
            revokeReason: null,
          });
          return true;
        },
        revokeShare: async (args) => {
          const shareKey = key(args.workspaceId, args.shareId);
          const current = store.documentShares.get(shareKey);
          if (current === undefined || current.revokedAt !== null) return false;
          store.documentShares.set(shareKey, {
            ...current,
            revokedAt: args.revokedAt,
            revokedBy: args.revokedBy,
            revokeReason: args.reason,
          });
          return true;
        },
      },

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

      sales: {
        findByIdForUpdate: async (workspaceId, saleId) =>
          store.sales.get(key(workspaceId, saleId)) ?? null,
        insert: async (sale) => {
          store.sales.set(key(sale.workspaceId, sale.id), sale);
        },
        // Conditional on the version *and* on the row still being a draft — the
        // same two conditions the Drizzle UPDATE carries, so an application test
        // cannot pass against semantics the database would refuse.
        post: async (sale, expectedVersion) => {
          const current = store.sales.get(key(sale.workspaceId, sale.id));
          if (
            current === undefined ||
            current.version !== expectedVersion ||
            current.status !== "draft"
          ) {
            return false;
          }
          store.sales.set(key(sale.workspaceId, sale.id), sale);
          return true;
        },
        // The same two conditions the Drizzle UPDATE carries — version *and*
        // still-a-draft — so an application test cannot pass against semantics
        // the database would refuse.
        updateDraft: async (sale, expectedVersion) => {
          const current = store.sales.get(key(sale.workspaceId, sale.id));
          if (
            current === undefined ||
            current.version !== expectedVersion ||
            current.status !== "draft"
          ) {
            return false;
          }
          store.sales.set(key(sale.workspaceId, sale.id), sale);
          return true;
        },
        insertVoid: async (record) => {
          // Mirrors UNIQUE (sale_id) in Postgres (BR-SALE-013). Without this the
          // in-memory adapter would accept a double void that the real database
          // refuses, and the concurrency test would prove nothing.
          if (store.saleVoids.some((existing) => existing.saleId === record.saleId)) {
            return false;
          }
          store.saleVoids.push(record);
          const sale = store.sales.get(key(record.workspaceId, record.saleId));
          if (sale !== undefined) {
            // The sale row itself is untouched; only the void it now has is
            // recorded, mirroring the join the Drizzle repository performs.
            store.sales.set(key(record.workspaceId, record.saleId), {
              ...sale,
              voidRecord: record,
            });
          }
          return true;
        },
      },

      payments: {
        findByIdForUpdate: async (workspaceId, paymentId) =>
          store.payments.get(key(workspaceId, paymentId)) ?? null,
        insert: async (payment) => {
          store.payments.set(key(payment.workspaceId, payment.id), payment);
        },
        update: async (payment, expectedVersion) => {
          const current = store.payments.get(key(payment.workspaceId, payment.id));
          if (current === undefined || current.version !== expectedVersion) {
            return false;
          }
          store.payments.set(key(payment.workspaceId, payment.id), payment);
          return true;
        },
        insertReversal: async (reversal) => {
          store.reversals.push(reversal);
        },
      },

      accountEntries: {
        append: async (drafts) => {
          const appended: CustomerAccountEntryDto[] = [];
          for (const draft of drafts) {
            // Mirrors UNIQUE (source_type, source_id) in Postgres: a second entry
            // for the same posting, void, or payment is unrepresentable, not merely
            // unlikely (docs/07-data/ledger-model.md).
            const duplicate = store.accountEntries.some(
              (entry) =>
                entry.workspaceId === draft.workspaceId &&
                entry.sourceType === draft.sourceType &&
                entry.sourceId === draft.sourceId,
            );
            if (duplicate) {
              throw new Error(
                `Duplicate account entry for ${draft.sourceType}:${draft.sourceId} — ` +
                  "unique (source_type, source_id) violated.",
              );
            }
            const entry: CustomerAccountEntryDto = {
              ...draft,
              id: ids.newId() as CustomerAccountEntryDto["id"],
            };
            store.accountEntries.push(entry);
            appended.push(entry);
          }
          return appended;
        },
        listByCustomer: async (workspaceId, customerId) =>
          store.accountEntries.filter(
            (entry) => entry.workspaceId === workspaceId && entry.customerId === customerId,
          ),
        findBySource: async (workspaceId, sourceType, sourceId) =>
          store.accountEntries.find(
            (entry) =>
              entry.workspaceId === workspaceId &&
              entry.sourceType === sourceType &&
              entry.sourceId === sourceId,
          ) ?? null,
      },

      accountBalances: {
        get: async (workspaceId, customerId) =>
          store.balances.get(key(workspaceId, customerId)) ?? null,
        save: async (summary) => {
          store.balances.set(key(summary.workspaceId, summary.customerId), summary);
        },
      },

      audit: {
        append: async (record) => {
          store.audit.push({
            id: ids.newId() as AuditRecordDto["id"],
            workspaceId: record.workspaceId,
            commandId: record.commandId,
            actorId: record.actorId,
            aggregateType: record.aggregateType,
            aggregateId: record.aggregateId,
            action: record.action,
            transactionTime: record.transactionTime,
            recordedAt: record.recordedAt,
            before: record.before,
            after: record.after,
            reason: record.reason,
            rejectionCode: null,
          });
        },
      },

      // --- reads ----------------------------------------------------------
      // Deliberately the same shape the SQL produces, including the keyset
      // paging: a page boundary bug that only the database exhibits would never
      // be caught by an application test, so the two agree by construction.
      customerReads: {
        search: async ({ workspaceId, query, isActive, page }) => {
          const needle = fold(query);
          const matched = [...store.customers.values()]
            .filter((customer) => customer.workspaceId === workspaceId)
            .filter((customer) => isActive === null || customer.isActive === isActive)
            .filter(
              (customer) =>
                needle.length === 0 ||
                fold(customer.displayName).includes(needle) ||
                (customer.phone ?? "").includes(query),
            )
            .sort(
              ascendingBy(
                (customer) => customer.displayName,
                (customer) => customer.id,
              ),
            )
            .filter((customer) =>
              page.after === null
                ? true
                : after([customer.displayName, customer.id], [page.after.sortValue, page.after.id]),
            )
            .map((customer) => {
              const stored = store.balances.get(key(workspaceId, customer.id));
              const balance = stored?.balance ?? zeroMoney(DEFAULT_CURRENCY);
              return {
                id: customer.id,
                workspaceId: customer.workspaceId,
                displayName: customer.displayName,
                phone: customer.phone,
                isActive: customer.isActive,
                version: customer.version,
                balance,
                classification: classifyBalance(balance),
                lastEntryTransactionTime: stored?.lastEntryTransactionTime ?? null,
              };
            });

          return takePage(matched, page, (row) => ({
            sortValue: row.displayName,
            id: row.id,
          }));
        },

        get: async (workspaceId, customerId) => {
          const customer = store.customers.get(key(workspaceId, customerId));
          if (customer === undefined) {
            return null;
          }
          const stored = store.balances.get(key(workspaceId, customerId));
          const balance = stored?.balance ?? zeroMoney(DEFAULT_CURRENCY);
          return { customer, balance, classification: classifyBalance(balance) };
        },

        recent: async (workspaceId, limit) => {
          const activeSales = [...store.sales.values()].filter(
            (sale) =>
              sale.workspaceId === workspaceId &&
              sale.status === "posted" &&
              sale.voidRecord === null,
          );
          return [...store.customers.values()]
            .filter((customer) => customer.workspaceId === workspaceId && customer.isActive)
            .map((customer) => {
              const lastSale = activeSales
                .filter((sale) => sale.customerId === customer.id)
                .sort(
                  descendingBy(
                    (sale) => sale.transactionTime,
                    (sale) => sale.id,
                  ),
                )[0];
              const stored = store.balances.get(key(workspaceId, customer.id));
              const balance = stored?.balance ?? zeroMoney(DEFAULT_CURRENCY);
              return {
                customerId: customer.id,
                displayName: customer.displayName,
                phone: customer.phone,
                balance,
                classification: classifyBalance(balance),
                lastSaleTransactionTime: lastSale?.transactionTime ?? null,
              };
            })
            .filter((customer) => customer.lastSaleTransactionTime !== null)
            .sort(
              descendingBy(
                (customer) => customer.lastSaleTransactionTime!,
                (customer) => customer.customerId,
              ),
            )
            .slice(0, limit);
        },

        possibleDuplicates: async ({
          workspaceId,
          displayName,
          phone,
          excludeCustomerId,
          limit,
        }) => {
          const normalizedName = fold(displayName.trim());
          const normalizedPhone = phone?.replace(/\D/g, "") ?? "";
          return [...store.customers.values()]
            .filter((customer) => customer.workspaceId === workspaceId)
            .filter((customer) => customer.id !== excludeCustomerId)
            .flatMap((customer) => {
              const reasons: Array<"same_name" | "same_phone"> = [];
              if (normalizedName.length > 0 && fold(customer.displayName.trim()) === normalizedName)
                reasons.push("same_name");
              if (
                normalizedPhone.length > 0 &&
                (customer.phone ?? "").replace(/\D/g, "") === normalizedPhone
              )
                reasons.push("same_phone");
              if (reasons.length === 0) return [];
              const stored = store.balances.get(key(workspaceId, customer.id));
              const balance = stored?.balance ?? zeroMoney(DEFAULT_CURRENCY);
              return [
                {
                  customer: {
                    id: customer.id,
                    workspaceId: customer.workspaceId,
                    displayName: customer.displayName,
                    phone: customer.phone,
                    isActive: customer.isActive,
                    version: customer.version,
                    balance,
                    classification: classifyBalance(balance),
                    lastEntryTransactionTime: stored?.lastEntryTransactionTime ?? null,
                  },
                  reasons,
                },
              ];
            })
            .sort((a, b) =>
              a.customer.displayName === b.customer.displayName
                ? a.customer.id.localeCompare(b.customer.id)
                : a.customer.displayName.localeCompare(b.customer.displayName),
            )
            .slice(0, limit);
        },
      },

      productReads: {
        search: async ({ workspaceId, query, isActive, page }) => {
          const needle = fold(query.trim());
          const rows = [...store.products.values()]
            .filter((product) => product.workspaceId === workspaceId)
            .filter((product) => isActive === null || product.isActive === isActive)
            .filter(
              (product) =>
                needle.length === 0 ||
                fold(product.displayName).includes(needle) ||
                product.aliases.some((alias) => fold(alias).includes(needle)),
            )
            .sort(
              ascendingBy(
                (product) => product.displayName,
                (product) => product.id,
              ),
            )
            .filter((product) =>
              page.after === null
                ? true
                : after([product.displayName, product.id], [page.after.sortValue, page.after.id]),
            );
          return takePage(
            rows.map((row) => ({ ...row, aliases: [...row.aliases] })),
            page,
            (row) => ({ sortValue: row.displayName, id: row.id }),
          );
        },
        get: async (workspaceId, productId) => {
          const row = store.products.get(key(workspaceId, productId));
          return row === undefined ? null : { ...row, aliases: [...row.aliases] };
        },
      },

      supplierReads: {
        search: async ({ workspaceId, query, isActive, page }) => {
          const needle = fold(query.trim());
          const rows = [...store.suppliers.values()]
            .filter((supplier) => supplier.workspaceId === workspaceId)
            .filter((supplier) => isActive === null || supplier.isActive === isActive)
            .filter(
              (supplier) =>
                needle.length === 0 ||
                fold(supplier.displayName).includes(needle) ||
                (supplier.phone ?? "").includes(query),
            )
            .sort(
              ascendingBy(
                (supplier) => supplier.displayName,
                (supplier) => supplier.id,
              ),
            )
            .filter((supplier) =>
              page.after === null
                ? true
                : after([supplier.displayName, supplier.id], [page.after.sortValue, page.after.id]),
            );
          return takePage(rows, page, (row) => ({
            sortValue: row.displayName,
            id: row.id,
          }));
        },
        get: async (workspaceId, supplierId) =>
          store.suppliers.get(key(workspaceId, supplierId)) ?? null,
      },

      supplierAccountReads: {
        balance: async (workspaceId, supplierId) => {
          const row = store.supplierAccountBalances.get(key(workspaceId, supplierId));
          return row === undefined
            ? null
            : {
                ...row,
                classification:
                  row.balance.amountMinor > 0
                    ? "payable"
                    : row.balance.amountMinor < 0
                      ? "supplier_credit"
                      : "settled",
              };
        },
        timeline: async ({ workspaceId, supplierId, page }) => {
          const rows = store.supplierAccountEntries
            .filter((entry) => entry.workspaceId === workspaceId && entry.supplierId === supplierId)
            .sort((a, b) =>
              a.transactionTime !== b.transactionTime
                ? b.transactionTime.localeCompare(a.transactionTime)
                : a.recordedAt !== b.recordedAt
                  ? b.recordedAt.localeCompare(a.recordedAt)
                  : b.id.localeCompare(a.id),
            )
            .filter((entry) => {
              if (page.after === null) return true;
              const sortValue = `${entry.transactionTime}|${entry.recordedAt}`;
              return (
                sortValue < page.after.sortValue ||
                (sortValue === page.after.sortValue && entry.id < page.after.id)
              );
            });
          return takePage(
            rows.map((row) => {
              const sourceDocument =
                row.sourceType === "supplier_payment"
                  ? { type: "supplier_payment" as const, id: row.sourceId }
                  : row.sourceType === "supplier_payment_reversal"
                    ? {
                        type: "supplier_payment" as const,
                        id:
                          store.supplierPaymentReversals.find(
                            (reversal) => reversal.id === row.sourceId,
                          )?.supplierPaymentId ?? row.sourceId,
                      }
                    : row.sourceType === "purchase_confirmation"
                      ? { type: "purchase" as const, id: row.sourceId }
                      : row.sourceType === "purchase_void"
                        ? {
                            type: "purchase" as const,
                            id:
                              [...store.purchases.values()].find(
                                (purchase) => purchase.voidRecord?.id === row.sourceId,
                              )?.id ?? row.sourceId,
                          }
                        : { type: "supplier_adjustment" as const, id: row.sourceId };
              return { ...row, sourceDocument };
            }),
            page,
            (row) => ({
              sortValue: `${row.transactionTime}|${row.recordedAt}`,
              id: row.id,
            }),
          );
        },
        payment: async (workspaceId, paymentId) => {
          const row = store.supplierPayments.get(key(workspaceId, paymentId));
          if (row === undefined) return null;
          return {
            ...row,
            status:
              row.reversedAmount.amountMinor === 0
                ? "recorded"
                : row.reversedAmount.amountMinor === row.amount.amountMinor
                  ? "reversed"
                  : "partially_reversed",
          };
        },
        integrity: async (workspaceId, supplierId) => {
          const diagnostics: string[] = [];
          for (const entry of store.supplierAccountEntries.filter(
            (row) => row.workspaceId === workspaceId && row.supplierId === supplierId,
          )) {
            if (entry.amount.amountMinor === 0) diagnostics.push("zero_amount");
            if (
              entry.sourceType === "manual_adjustment" &&
              (entry.reasonCode === null || (entry.reason ?? "").trim().length === 0)
            )
              diagnostics.push("malformed_adjustment");
            if (entry.sourceType === "supplier_payment") {
              const payment = store.supplierPayments.get(key(workspaceId, entry.sourceId));
              if (
                payment === undefined ||
                payment.supplierId !== supplierId ||
                -payment.amount.amountMinor !== entry.amount.amountMinor
              )
                diagnostics.push("missing_or_mismatched_supplier_payment");
            }
            if (entry.sourceType === "purchase_confirmation") {
              const purchase = store.purchases.get(key(workspaceId, entry.sourceId));
              if (
                purchase === undefined ||
                purchase.supplierId !== supplierId ||
                purchase.status !== "confirmed" ||
                purchase.totalAmount.amountMinor !== entry.amount.amountMinor
              )
                diagnostics.push("missing_or_mismatched_purchase");
            }
          }
          return diagnostics;
        },
      },

      purchaseReads: {
        get: async (workspaceId, purchaseId) =>
          (() => {
            const row = store.purchases.get(key(workspaceId, purchaseId));
            return row === undefined ? null : toPurchaseDto(row);
          })(),
        list: async ({ workspaceId, supplierId, status, page }) => {
          const rows = [...store.purchases.values()]
            .filter((row) => row.workspaceId === workspaceId)
            .filter((row) => supplierId === null || row.supplierId === supplierId)
            .filter((row) => status === null || row.status === status)
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
                sort < page.after.sortValue ||
                (sort === page.after.sortValue && row.id < page.after.id)
              );
            });
          return takePage(rows.map(toPurchaseDto), page, (row) => ({
            sortValue: `${row.transactionTime}|${row.recordedAt}`,
            id: row.id,
          }));
        },
      },

      inventoryReads: {
        receipt: async (workspaceId, receiptId) => {
          const row = store.purchaseReceipts.get(key(workspaceId, receiptId));
          return row === undefined
            ? null
            : {
                ...row,
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
                      },
              };
        },
        receipts: async (workspaceId, purchaseId) =>
          [...store.purchaseReceipts.values()]
            .filter((row) => row.workspaceId === workspaceId && row.purchaseId === purchaseId)
            .map((row) => ({
              ...row,
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
              classification:
                row.quantityScaled > 0
                  ? ("positive" as const)
                  : row.quantityScaled < 0
                    ? ("negative" as const)
                    : ("zero" as const),
            })),
        timeline: async ({ workspaceId, productId, unit, page }) => {
          const rows = store.inventoryMovements
            .filter(
              (row) =>
                row.workspaceId === workspaceId &&
                row.productId === productId &&
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
                sort < page.after.sortValue ||
                (sort === page.after.sortValue && row.id < page.after.id)
              );
            });
          return takePage(
            rows.map((row) => ({
              ...row,
              sourceDocument:
                row.sourceType === "inventory_adjustment"
                  ? { type: "inventory_adjustment" as const, id: row.sourceId }
                  : row.sourceType === "delivery_dispatch"
                    ? { type: "delivery" as const, id: row.sourceId }
                    : row.sourceType === "delivery_return"
                      ? {
                          type: "delivery" as const,
                          id:
                            store.deliveryReturns.find((returned) => returned.id === row.sourceId)
                              ?.deliveryId ?? row.sourceId,
                        }
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
        integrity: async (workspaceId, productId, unit) => {
          const diagnostics: string[] = [];
          for (const movement of store.inventoryMovements.filter(
            (row) =>
              row.workspaceId === workspaceId &&
              row.productId === productId &&
              row.quantity.unit === unit,
          )) {
            if (movement.quantity.valueScaled === 0) diagnostics.push("zero_quantity");
            if (
              movement.sourceType === "inventory_adjustment" &&
              (movement.reasonCode === null || (movement.reason ?? "").trim().length === 0)
            )
              diagnostics.push("malformed_adjustment");
            if (movement.sourceType === "purchase_receipt") {
              const receipt = store.purchaseReceipts.get(key(workspaceId, movement.sourceId));
              const line = receipt?.lines.find(
                (item) => item.receiptLineId === movement.sourceLineId,
              );
              if (
                line === undefined ||
                line.productId !== productId ||
                line.quantity.unit !== unit ||
                line.quantity.valueScaled !== movement.quantity.valueScaled
              )
                diagnostics.push("missing_or_mismatched_receipt");
            }
            if (movement.sourceType === "delivery_dispatch") {
              const delivery = store.deliveries.get(key(workspaceId, movement.sourceId));
              const line = delivery?.lines.find(
                (item) => item.deliveryLineId === movement.sourceLineId,
              );
              if (
                line === undefined ||
                line.productId !== productId ||
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

      deliveryReads: {
        get: async (workspaceId, deliveryId) => {
          const delivery = store.deliveries.get(key(workspaceId, deliveryId));
          return delivery === undefined ? null : toDeliveryDto(delivery);
        },
        list: async ({ workspaceId, saleId, status, page }) => {
          const rows = [...store.deliveries.values()]
            .filter((row) => row.workspaceId === workspaceId)
            .filter((row) => saleId === null || row.saleId === saleId)
            .filter((row) => status === null || row.status === status)
            .sort((a, b) => {
              const aSort = `${a.transactionTime}|${a.recordedAt}`;
              const bSort = `${b.transactionTime}|${b.recordedAt}`;
              return aSort === bSort ? b.id.localeCompare(a.id) : bSort.localeCompare(aSort);
            })
            .filter((row) => {
              if (page.after === null) return true;
              const sort = `${row.transactionTime}|${row.recordedAt}`;
              return (
                sort < page.after.sortValue ||
                (sort === page.after.sortValue && row.id < page.after.id)
              );
            });
          return takePage(rows.map(toDeliveryDto), page, (row) => ({
            sortValue: `${row.transactionTime}|${row.recordedAt}`,
            id: row.id,
          }));
        },
      },
      documentReads: {
        get: async (workspaceId, documentId) =>
          store.documents.get(key(workspaceId, documentId)) ?? null,
        listBySource: async (workspaceId, sourceType, sourceId) =>
          [...store.documents.values()]
            .filter(
              (document) =>
                document.workspaceId === workspaceId &&
                document.sourceType === sourceType &&
                document.sourceId === sourceId,
            )
            .sort((a, b) => b.version - a.version || b.id.localeCompare(a.id)),
        publicByTokenHash: async (tokenHash, now) => {
          const share = [...store.documentShares.values()].find(
            (candidate) => candidate.tokenHash === tokenHash,
          );
          if (share === undefined) return { kind: "not_found" as const };
          if (share.revokedAt !== null) return { kind: "revoked" as const };
          if (share.expiresAt !== null && share.expiresAt < now)
            return { kind: "expired" as const };
          const document = store.documents.get(key(share.workspaceId, share.documentId));
          return document === undefined
            ? { kind: "not_found" as const }
            : { kind: "found" as const, document };
        },
      },
      reportReads: {
        operational: async ({ workspaceId, reportType, businessDate, productId, unit, page }) => {
          type Row = OperationalReportDto["page"]["items"][number];
          let rows: Row[] = [];
          if (reportType === "customer_account_activity") {
            rows = store.accountEntries
              .filter((entry) => entry.workspaceId === workspaceId)
              .filter(
                (entry) =>
                  businessDate === null ||
                  new Intl.DateTimeFormat("en-CA", {
                    timeZone: "Asia/Ho_Chi_Minh",
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  }).format(new Date(entry.transactionTime)) === businessDate,
              )
              .map((entry) => ({
                id: entry.id,
                label: entry.sourceType.replaceAll("_", " "),
                sourceType: entry.sourceType,
                sourceId: entry.sourceId,
                documentHref:
                  entry.sourceType === "sale_posting"
                    ? `/sales/${entry.sourceId}`
                    : entry.sourceType === "sale_void"
                      ? `/sales/${store.saleVoids.find((row) => row.id === entry.sourceId)?.saleId ?? entry.sourceId}`
                      : entry.sourceType === "payment"
                        ? `/payments/${entry.sourceId}`
                        : entry.sourceType === "payment_reversal"
                          ? `/payments/${store.reversals.find((row) => row.id === entry.sourceId)?.paymentId ?? entry.sourceId}`
                          : `/account-adjustments/${entry.sourceId}`,
                transactionTime: entry.transactionTime,
                amount: entry.amount,
                quantity: null,
                status: "canonical",
              }));
          } else if (reportType === "customer_receivables") {
            rows = [...store.customers.values()]
              .filter((customer) => customer.workspaceId === workspaceId)
              .flatMap((customer) => {
                const balance = store.balances.get(key(workspaceId, customer.id));
                return balance === undefined || balance.balance.amountMinor <= 0
                  ? []
                  : [
                      {
                        id: customer.id,
                        label: customer.displayName,
                        sourceType: "customer",
                        sourceId: customer.id,
                        documentHref: `/customers/${customer.id}`,
                        transactionTime: balance.lastEntryTransactionTime,
                        amount: balance.balance,
                        quantity: null,
                        status: "receivable",
                      },
                    ];
              });
          } else if (reportType === "supplier_payables") {
            rows = [...store.suppliers.values()]
              .filter((supplier) => supplier.workspaceId === workspaceId)
              .flatMap((supplier) => {
                const balance = store.supplierAccountBalances.get(key(workspaceId, supplier.id));
                return balance === undefined || balance.balance.amountMinor <= 0
                  ? []
                  : [
                      {
                        id: supplier.id,
                        label: supplier.displayName,
                        sourceType: "supplier",
                        sourceId: supplier.id,
                        documentHref: `/suppliers/${supplier.id}`,
                        transactionTime: balance.lastEntryTransactionTime,
                        amount: balance.balance,
                        quantity: null,
                        status: "payable",
                      },
                    ];
              });
          } else if (reportType === "inventory_by_product_unit") {
            rows = [...store.inventoryBalances.values()]
              .filter((balance) => balance.workspaceId === workspaceId)
              .filter((balance) => productId === null || balance.productId === productId)
              .filter((balance) => unit === null || balance.unit === unit)
              .flatMap((balance) => {
                const product = store.products.get(key(workspaceId, balance.productId));
                return product === undefined
                  ? []
                  : [
                      {
                        id: `${product.id}:${balance.unit}`,
                        label: `${product.displayName} · ${balance.unit}`,
                        sourceType: "product",
                        sourceId: product.id,
                        documentHref: `/products/${product.id}/inventory`,
                        transactionTime: balance.lastMovementTransactionTime,
                        amount: null,
                        quantity: { valueScaled: balance.quantityScaled, unit: balance.unit },
                        status:
                          balance.quantityScaled < 0
                            ? "negative"
                            : balance.quantityScaled === 0
                              ? "zero"
                              : "positive",
                      },
                    ];
              });
          } else if (reportType === "inventory_movement_report") {
            rows = store.inventoryMovements
              .filter((movement) => movement.workspaceId === workspaceId)
              .filter((movement) => productId === null || movement.productId === productId)
              .filter((movement) => unit === null || movement.quantity.unit === unit)
              .map((movement) => ({
                id: movement.id,
                label: movement.sourceType.replaceAll("_", " "),
                sourceType: movement.sourceType,
                sourceId: movement.sourceId,
                documentHref:
                  movement.sourceType === "delivery_dispatch"
                    ? `/deliveries/${movement.sourceId}`
                    : movement.sourceType === "delivery_return"
                      ? `/deliveries/${store.deliveryReturns.find((row) => row.id === movement.sourceId)?.deliveryId ?? movement.sourceId}`
                      : movement.sourceType === "purchase_receipt"
                        ? `/receipts/${movement.sourceId}`
                        : movement.sourceType === "purchase_receipt_reversal"
                          ? `/receipts/${
                              [...store.purchaseReceipts.values()].find(
                                (receipt) => receipt.reversal?.id === movement.sourceId,
                              )?.id ?? movement.sourceId
                            }`
                          : movement.sourceType === "inventory_adjustment"
                            ? `/inventory-adjustments/${movement.sourceId}`
                            : null,
                transactionTime: movement.transactionTime,
                amount: null,
                quantity: movement.quantity,
                status: "canonical",
              }));
          } else {
            for (const sale of store.sales.values()) {
              if (sale.workspaceId !== workspaceId || sale.status !== "posted") continue;
              const fulfilled = new Map<string, number>();
              for (const delivery of store.deliveries.values()) {
                if (
                  delivery.workspaceId !== workspaceId ||
                  delivery.saleId !== sale.id ||
                  !["dispatched", "delivered"].includes(delivery.status)
                )
                  continue;
                for (const line of delivery.lines)
                  fulfilled.set(
                    line.saleLineId,
                    (fulfilled.get(line.saleLineId) ?? 0) + line.quantity.valueScaled,
                  );
                for (const returned of delivery.returns)
                  for (const returnLine of returned.lines) {
                    const deliveryLine = delivery.lines.find(
                      (line) => line.deliveryLineId === returnLine.deliveryLineId,
                    );
                    if (deliveryLine !== undefined)
                      fulfilled.set(
                        deliveryLine.saleLineId,
                        (fulfilled.get(deliveryLine.saleLineId) ?? 0) -
                          returnLine.quantity.valueScaled,
                      );
                  }
              }
              for (const line of sale.lines) {
                const remaining = line.quantity.valueScaled - (fulfilled.get(line.lineId) ?? 0);
                if (remaining > 0)
                  rows.push({
                    id: line.lineId,
                    label: line.productName,
                    sourceType: "sale",
                    sourceId: sale.id,
                    documentHref: `/sales/${sale.id}`,
                    transactionTime: sale.transactionTime,
                    amount: null,
                    quantity: { valueScaled: remaining, unit: line.quantity.unit },
                    status: "outstanding",
                  });
              }
            }
          }
          rows.sort((a, b) => {
            const left = `${a.transactionTime ?? ""}|${a.id}`;
            const right = `${b.transactionTime ?? ""}|${b.id}`;
            return right.localeCompare(left);
          });
          const all = rows;
          if (page.after !== null) {
            const boundary = `${page.after.sortValue}|${page.after.id}`;
            rows = rows.filter((row) => `${row.transactionTime ?? ""}|${row.id}` < boundary);
          }
          const pageResult = takePage(rows, page, (row) => ({
            sortValue: row.transactionTime ?? "",
            id: row.id,
          }));
          const quantities = new Map<string, number>();
          for (const row of all)
            if (row.quantity !== null)
              quantities.set(
                row.quantity.unit,
                (quantities.get(row.quantity.unit) ?? 0) + row.quantity.valueScaled,
              );
          const amounts = all.flatMap((row) => (row.amount === null ? [] : [row.amount]));
          return {
            reportType,
            businessDate,
            timezone: "Asia/Ho_Chi_Minh",
            integrity: "healthy",
            diagnostics: [],
            totals: {
              amount:
                amounts.length === 0
                  ? null
                  : money(
                      amounts.reduce((sum, amount) => sum + amount.amountMinor, 0),
                      "VND",
                    ),
              quantities: [...quantities].map(([quantityUnit, valueScaled]) => ({
                unit: quantityUnit as InventoryMovementState["quantity"]["unit"],
                valueScaled,
              })),
            },
            page: {
              items: [...pageResult.rows],
              nextCursor: pageResult.next === null ? null : encodeCursor(pageResult.next),
            },
          } satisfies OperationalReportDto;
        },
      },

      saleReads: {
        get: async (workspaceId, saleId) => store.sales.get(key(workspaceId, saleId)) ?? null,

        replacedBy: async (workspaceId, saleId) =>
          [...store.sales.values()].find(
            (sale) => sale.workspaceId === workspaceId && sale.replacesSaleId === saleId,
          )?.id ?? null,

        list: async ({ workspaceId, customerId, status, voided, from, to, page }) => {
          const matched = [...store.sales.values()]
            .filter((sale) => sale.workspaceId === workspaceId)
            .filter((sale) => customerId === null || sale.customerId === customerId)
            .filter((sale) => status === null || sale.status === status)
            .filter((sale) => voided === null || (sale.voidRecord !== null) === voided)
            .filter((sale) => from === null || sale.transactionTime >= from)
            .filter((sale) => to === null || sale.transactionTime <= to)
            .sort(
              descendingBy(
                (sale) => sale.transactionTime,
                (sale) => sale.id,
              ),
            )
            .filter((sale) =>
              page.after === null
                ? true
                : before([sale.transactionTime, sale.id], [page.after.sortValue, page.after.id]),
            )
            .map((sale) => ({
              id: sale.id,
              workspaceId: sale.workspaceId,
              customerId: sale.customerId,
              customerDisplayName:
                store.customers.get(key(workspaceId, sale.customerId))?.displayName ?? "",
              status: sale.status,
              isVoided: sale.voidRecord !== null,
              totalAmount: sale.totalAmount,
              lineCount: sale.lines.length,
              version: sale.version,
              transactionTime: sale.transactionTime,
              recordedAt: sale.recordedAt,
              postedAt: sale.postedAt,
              discardedAt: sale.discardedAt,
              dueAt: sale.dueAt,
              replacesSaleId: sale.replacesSaleId,
              replacedBySaleId:
                [...store.sales.values()].find(
                  (other) => other.workspaceId === workspaceId && other.replacesSaleId === sale.id,
                )?.id ?? null,
            }));

          return takePage(matched, page, (row) => ({
            sortValue: row.transactionTime,
            id: row.id,
          }));
        },

        captureContext: async ({ workspaceId, customerId, query, limit }) => {
          const needle = fold(query);
          const eligible = [...store.sales.values()]
            .filter(
              (sale) =>
                sale.workspaceId === workspaceId &&
                sale.status === "posted" &&
                sale.voidRecord === null,
            )
            .sort(
              descendingBy(
                (sale) => sale.transactionTime,
                (sale) => sale.id,
              ),
            );
          const customerHistory = [] as Array<{
            productName: string;
            unit: string;
            lastUnitPrice: Money;
            lastTransactionTime: string;
            sourceSaleId: SaleId;
          }>;
          const workspaceHistory = [] as Array<{ productName: string; unit: string }>;
          const customerSeen = new Set<string>();
          const workspaceSeen = new Set<string>();
          for (const sale of eligible)
            for (const line of sale.lines) {
              if (needle.length > 0 && !fold(line.productName).includes(needle)) continue;
              const identity = `${line.productName}\u0000${line.quantity.unit}`;
              if (!workspaceSeen.has(identity) && workspaceHistory.length < limit) {
                workspaceSeen.add(identity);
                workspaceHistory.push({ productName: line.productName, unit: line.quantity.unit });
              }
              if (
                sale.customerId === customerId &&
                !customerSeen.has(identity) &&
                customerHistory.length < limit
              ) {
                customerSeen.add(identity);
                customerHistory.push({
                  productName: line.productName,
                  unit: line.quantity.unit,
                  lastUnitPrice: line.unitPrice,
                  lastTransactionTime: sale.transactionTime,
                  sourceSaleId: sale.id,
                });
              }
            }
          return { customerHistory, workspaceHistory };
        },
      },

      paymentReads: {
        get: async (workspaceId, paymentId) => {
          const payment = store.payments.get(key(workspaceId, paymentId));
          return payment === undefined ? null : toPaymentSummaryRow(store, payment);
        },

        list: async ({ workspaceId, customerId, status, from, to, page }) => {
          const matched = [...store.payments.values()]
            .filter((payment) => payment.workspaceId === workspaceId)
            .filter((payment) => customerId === null || payment.customerId === customerId)
            .filter((payment) => status === null || payment.status === status)
            .filter((payment) => from === null || payment.transactionTime >= from)
            .filter((payment) => to === null || payment.transactionTime <= to)
            .sort(
              descendingBy(
                (payment) => payment.transactionTime,
                (payment) => payment.id,
              ),
            )
            .filter((payment) =>
              page.after === null
                ? true
                : before(
                    [payment.transactionTime, payment.id],
                    [page.after.sortValue, page.after.id],
                  ),
            )
            .map((payment) => toPaymentSummaryRow(store, payment));

          return takePage(matched, page, (row) => ({
            sortValue: row.transactionTime,
            id: row.id,
          }));
        },
      },

      accountReads: {
        adjustmentDetail: async ({ workspaceId, adjustmentId }) => {
          const entry = store.accountEntries.find(
            (item) =>
              item.workspaceId === workspaceId &&
              item.sourceType === "manual_adjustment" &&
              item.sourceId === adjustmentId,
          );
          if (entry === undefined) return { kind: "not_found" as const };
          if (
            entry.amount.amountMinor === 0 ||
            entry.reasonCode === null ||
            entry.reason === null ||
            entry.reason.trim().length === 0
          )
            return { kind: "integrity_error" as const, reason: "missing adjustment fields" };
          const history = store.accountEntries
            .filter(
              (item) => item.workspaceId === workspaceId && item.customerId === entry.customerId,
            )
            .sort(
              ascendingBy(
                (item) => `${item.transactionTime}:${item.recordedAt}`,
                (item) => item.id,
              ),
            );
          let running = 0;
          for (const item of history) {
            running += item.amount.amountMinor;
            if (item.id === entry.id) break;
          }
          const customer = store.customers.get(key(workspaceId, entry.customerId));
          const workspace = store.workspaceNames.get(workspaceId);
          const actor = store.actorNames.get(entry.actorId);
          if (customer === undefined || workspace === undefined || actor === undefined)
            return { kind: "integrity_error" as const, reason: "missing joined record" };
          return {
            kind: "found" as const,
            row: {
              adjustmentId,
              entryId: entry.id,
              commandId: entry.commandId,
              workspace: { id: workspaceId, name: workspace },
              customer: { id: entry.customerId, displayName: customer.displayName },
              actor: { id: entry.actorId, displayName: actor },
              amount: entry.amount,
              reasonCode: entry.reasonCode,
              reason: entry.reason,
              transactionTime: entry.transactionTime,
              recordedAt: entry.recordedAt,
              runningBalance: money(running, entry.amount.currency),
            },
          };
        },
        timeline: async ({ workspaceId, customerId, from, to, page }) => {
          // The running balance is computed over the customer's whole history in
          // business-time order, then the page is cut out of it — the same thing
          // the SQL window function does, and for the same reason: a page is a
          // slice, and a slice cannot know what came before it.
          const ascending = store.accountEntries
            .filter((entry) => entry.workspaceId === workspaceId && entry.customerId === customerId)
            .sort(
              ascendingBy(
                (entry) => `${entry.transactionTime}|${entry.recordedAt}`,
                (entry) => entry.id,
              ),
            );

          let running = 0;
          const withBalance = ascending.map((entry) => {
            running += entry.amount.amountMinor;
            return { entry, runningBalance: money(running, entry.amount.currency) };
          });

          const matched = withBalance
            .filter(({ entry }) => from === null || entry.transactionTime >= from)
            .filter(({ entry }) => to === null || entry.transactionTime <= to)
            .reverse()
            .filter(({ entry }) =>
              page.after === null
                ? true
                : before(
                    [`${entry.transactionTime}|${entry.recordedAt}`, entry.id],
                    [page.after.sortValue, page.after.id],
                  ),
            )
            .map(({ entry, runningBalance }) => ({
              id: entry.id,
              workspaceId: entry.workspaceId,
              customerId: entry.customerId,
              amount: entry.amount,
              runningBalance,
              source: {
                type: entry.sourceType,
                id: entry.sourceId,
                document: sourceDocument(store, entry.sourceType, entry.sourceId),
                label: entry.sourceType,
              },
              reversalOfEntryId: entry.reversalOfEntryId,
              reasonCode: entry.reasonCode,
              reason: entry.reason,
              transactionTime: entry.transactionTime,
              recordedAt: entry.recordedAt,
              actorId: entry.actorId,
              commandId: entry.commandId,
            }));

          return takePage(matched, page, (row) => ({
            sortValue: `${row.transactionTime}|${row.recordedAt}`,
            id: row.id,
          }));
        },
        sourceObservations: async ({ workspaceId, customerId }) =>
          store.accountEntries
            .filter((entry) => entry.workspaceId === workspaceId && entry.customerId === customerId)
            .sort(
              ascendingBy(
                (entry) => `${entry.transactionTime}|${entry.recordedAt}`,
                (entry) => entry.id,
              ),
            )
            .map((entry) => {
              const reversalTargetExists =
                entry.reversalOfEntryId === null ||
                store.accountEntries.some((candidate) => candidate.id === entry.reversalOfEntryId);
              if (entry.sourceType === "manual_adjustment") {
                return {
                  entryId: entry.id,
                  sourceType: entry.sourceType,
                  sourceId: entry.sourceId,
                  sourceExists: true,
                  sourceWorkspaceId: entry.workspaceId,
                  sourceCustomerId: entry.customerId,
                  expectedAmount: entry.amount,
                  reversalTargetExists,
                };
              }
              if (entry.sourceType === "sale_posting") {
                const sale = [...store.sales.values()].find((item) => item.id === entry.sourceId);
                return {
                  entryId: entry.id,
                  sourceType: entry.sourceType,
                  sourceId: entry.sourceId,
                  sourceExists: sale !== undefined,
                  sourceWorkspaceId: sale?.workspaceId ?? null,
                  sourceCustomerId: sale?.customerId ?? null,
                  expectedAmount: sale?.totalAmount ?? null,
                  reversalTargetExists,
                };
              }
              if (entry.sourceType === "sale_void") {
                const voidRecord = store.saleVoids.find((item) => item.id === entry.sourceId);
                const sale =
                  voidRecord === undefined
                    ? undefined
                    : [...store.sales.values()].find((item) => item.id === voidRecord.saleId);
                return {
                  entryId: entry.id,
                  sourceType: entry.sourceType,
                  sourceId: entry.sourceId,
                  sourceExists: voidRecord !== undefined,
                  sourceWorkspaceId: voidRecord?.workspaceId ?? null,
                  sourceCustomerId: sale?.customerId ?? null,
                  expectedAmount:
                    voidRecord === undefined
                      ? null
                      : money(-voidRecord.amount.amountMinor, voidRecord.amount.currency),
                  reversalTargetExists,
                };
              }
              if (entry.sourceType === "payment") {
                const payment = [...store.payments.values()].find(
                  (item) => item.id === entry.sourceId,
                );
                return {
                  entryId: entry.id,
                  sourceType: entry.sourceType,
                  sourceId: entry.sourceId,
                  sourceExists: payment !== undefined,
                  sourceWorkspaceId: payment?.workspaceId ?? null,
                  sourceCustomerId: payment?.customerId ?? null,
                  expectedAmount:
                    payment === undefined
                      ? null
                      : money(-payment.amount.amountMinor, payment.amount.currency),
                  reversalTargetExists,
                };
              }
              const reversal = store.reversals.find((item) => item.id === entry.sourceId);
              const payment =
                reversal === undefined
                  ? undefined
                  : [...store.payments.values()].find((item) => item.id === reversal.paymentId);
              return {
                entryId: entry.id,
                sourceType: entry.sourceType,
                sourceId: entry.sourceId,
                sourceExists: reversal !== undefined,
                sourceWorkspaceId: reversal?.workspaceId ?? null,
                sourceCustomerId: payment?.customerId ?? null,
                expectedAmount: reversal?.amount ?? null,
                reversalTargetExists,
              };
            }),
      },

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
              (store.balances.get(key(workspaceId, customer.id))?.balance.amountMinor ?? 0) !==
              ledger
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
              const payment = [...store.payments.values()].find(
                (item) => item.id === entry.sourceId,
              );
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
                store.supplierAccountBalances.get(key(workspaceId, supplier.id))?.balance
                  .amountMinor ?? 0;
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
              store.inventoryBalances.get(`${workspaceId}:${inventoryKey}`)?.quantityScaled !==
              quantity
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

      auditReads: {
        timeline: async ({ workspaceId, aggregateType, aggregateId, actorId, from, to, page }) => {
          const matched = store.audit
            .filter((record) => record.workspaceId === workspaceId)
            .filter((record) => aggregateType === null || record.aggregateType === aggregateType)
            .filter((record) => aggregateId === null || record.aggregateId === aggregateId)
            .filter((record) => actorId === null || record.actorId === actorId)
            .filter((record) => from === null || record.recordedAt >= from)
            .filter((record) => to === null || record.recordedAt <= to)
            .sort(
              descendingBy(
                (record) => record.recordedAt,
                (record) => record.id,
              ),
            )
            .filter((record) =>
              page.after === null
                ? true
                : before([record.recordedAt, record.id], [page.after.sortValue, page.after.id]),
            )
            .map((record) => {
              const sale =
                record.aggregateType === "sale"
                  ? store.sales.get(key(workspaceId, record.aggregateId))
                  : undefined;
              return {
                id: record.id,
                workspaceId: record.workspaceId,
                actorId: record.actorId,
                actorDisplayName: store.actorNames.get(record.actorId) ?? "",
                commandId: record.commandId,
                action: record.action,
                aggregateType: record.aggregateType,
                aggregateId: record.aggregateId,
                transactionTime: record.transactionTime,
                recordedAt: record.recordedAt,
                before: record.before,
                after: record.after,
                reason: record.reason,
                rejectionCode: record.rejectionCode,
                correction:
                  record.action === "sale.voided"
                    ? {
                        relation: "voids_sale" as const,
                        targetSaleId: record.aggregateId as SaleId,
                      }
                    : sale?.replacesSaleId != null
                      ? {
                          relation: "replaces_sale" as const,
                          targetSaleId: sale.replacesSaleId,
                        }
                      : null,
              };
            });

          return takePage(matched, page, (row) => ({
            sortValue: row.recordedAt,
            id: row.id,
          }));
        },
      },

      receipts: {
        find: async (workspaceId, idempotencyKey) =>
          store.receipts.get(key(workspaceId, idempotencyKey)) ?? null,
        findByCommandId: async (workspaceId, commandId) =>
          [...store.receipts.values()].find(
            (receipt) => receipt.workspaceId === workspaceId && receipt.commandId === commandId,
          ) ?? null,
        claim: async (receipt) => {
          const receiptKey = key(receipt.workspaceId, receipt.idempotencyKey);
          if (store.receipts.has(receiptKey)) {
            return false;
          }
          store.receipts.set(receiptKey, receipt);
          return true;
        },
        complete: async (workspaceId, idempotencyKey, result) => {
          const receiptKey = key(workspaceId, idempotencyKey);
          const existing = store.receipts.get(receiptKey);
          if (existing !== undefined) {
            store.receipts.set(receiptKey, { ...existing, status: "completed", result });
          }
        },
      },
    };
  }
}

function sourceDocument(
  store: Store,
  sourceType: CustomerAccountEntryDto["sourceType"],
  sourceId: string,
): { type: "sale" | "payment" | "adjustment"; id: string } {
  if (sourceType === "sale_posting") return { type: "sale", id: sourceId };
  if (sourceType === "sale_void") {
    return {
      type: "sale",
      id: store.saleVoids.find((record) => record.id === sourceId)?.saleId ?? sourceId,
    };
  }
  if (sourceType === "payment") return { type: "payment", id: sourceId };
  if (sourceType === "payment_reversal") {
    return {
      type: "payment",
      id: store.reversals.find((record) => record.id === sourceId)?.paymentId ?? sourceId,
    };
  }
  return { type: "adjustment", id: sourceId };
}

/** Deterministic ids so a failing test fails the same way every run. */
export function sequentialIdGenerator(prefix = "9"): IdGenerator {
  let counter = 0;
  return {
    newId: () => {
      counter += 1;
      const suffix = `${prefix}${String(counter).padStart(2, "0")}`.padStart(12, "0");
      return `00000000-0000-4000-8000-${suffix}`;
    },
  };
}

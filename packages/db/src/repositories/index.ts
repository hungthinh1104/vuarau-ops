import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type {
  ActorId,
  AuditAction,
  AuditAggregateType,
  CommandId,
  CurrencyCode,
  CustomerId,
  CustomerAccountEntryDto,
  IdempotencyKey,
  IsoInstant,
  AccountEntrySourceType,
  SaleId,
  PaymentId,
  ProductId,
  SupplierId,
  SupplierPaymentId,
  SupplierAccountEntryDto,
  WorkspaceId,
  WorkspaceRole,
  WorkspaceBackupV3,
  DeliveryId,
  DocumentDto,
  DocumentSourceType,
  DocumentType,
} from "@vuarau/domain-contracts";
import type {
  CustomerAccountBalance,
  CustomerState,
  AccountEntryDraft,
  SaleState,
  PaymentReversalState,
  PaymentState,
  ProductState,
  SupplierState,
  SupplierPaymentState,
  SaleVoidState,
  PurchaseState,
  PurchaseVoidState,
  PurchaseReceiptState,
  PurchaseReceiptReversalState,
  InventoryMovementState,
  DeliveryState,
  DeliveryReturnState,
} from "@vuarau/domain-kernel";
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
  workspaceMemberships,
  workspaces,
} from "../schema/index.ts";
import {
  fromIso,
  fromIsoOrNull,
  toCustomerAccountBalance,
  toCustomerState,
  toIso,
  toIsoOrNull,
  toAccountEntryDto,
  toSaleState,
  toPaymentState,
} from "./row-mappers.ts";

/**
 * Drizzle repository implementations.
 *
 * These objects satisfy the port types declared in `apps/api` **structurally** —
 * this package never imports them, so the dependency arrow keeps pointing
 * inwards (docs/01-domain/context-map.md). If a port and an implementation drift,
 * the wiring in `apps/api` stops compiling.
 *
 * Every method takes `workspaceId` as a required argument, with one exception:
 * `actors`, which resolves identity *before* a workspace is known and therefore
 * cannot take one. Nothing else may read across workspaces (BR-CUSTOMER-002), and
 * that exception is argued where the port is declared.
 */

// The concrete transaction type Drizzle hands a callback. Kept loose here so the
// repositories work with both a transaction and a bare connection.
type Tx = PgTransaction<never, never, never>;

export type IdMinter = { newId(): string };

function toProductState(row: typeof products.$inferSelect): ProductState {
  return {
    id: row.id as ProductId,
    workspaceId: row.workspaceId as WorkspaceId,
    displayName: row.name,
    aliases: row.aliases,
    preferredUnit: row.preferredUnit as ProductState["preferredUnit"],
    isActive: row.isActive,
    version: row.version,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toSupplierState(row: typeof suppliers.$inferSelect): SupplierState {
  return {
    id: row.id as SupplierId,
    workspaceId: row.workspaceId as WorkspaceId,
    displayName: row.displayName,
    phone: row.phone,
    note: row.note,
    isActive: row.isActive,
    version: row.version,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toSupplierPaymentState(row: typeof supplierPayments.$inferSelect): SupplierPaymentState {
  return {
    id: row.id as SupplierPaymentId,
    workspaceId: row.workspaceId as WorkspaceId,
    supplierId: row.supplierId as SupplierId,
    amount: { amountMinor: row.amountMinor, currency: row.currency },
    method: row.method,
    note: row.note,
    reversedAmount: { amountMinor: row.reversedAmountMinor, currency: row.currency },
    version: row.version,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
  };
}

async function loadPurchase(tx: Tx, workspaceId: WorkspaceId, purchaseId: string) {
  const rows = await tx
    .select()
    .from(purchases)
    .where(and(eq(purchases.workspaceId, workspaceId), eq(purchases.id, purchaseId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  const [lines, voidRows] = await Promise.all([
    tx
      .select()
      .from(purchaseLines)
      .where(
        and(eq(purchaseLines.workspaceId, workspaceId), eq(purchaseLines.purchaseId, purchaseId)),
      ),
    tx
      .select()
      .from(purchaseVoids)
      .where(
        and(eq(purchaseVoids.workspaceId, workspaceId), eq(purchaseVoids.purchaseId, purchaseId)),
      )
      .limit(1),
  ]);
  const voidRow = voidRows[0];
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    supplierId: row.supplierId,
    status: row.status,
    currency: row.currency,
    lines: lines.map((line) => ({
      lineId: line.id,
      productId: line.productId,
      productName: line.productName,
      quantity: { valueScaled: line.quantityScaled, unit: line.unit },
      unitPrice: { amountMinor: line.unitPriceMinor, currency: line.currency },
      lineTotal: { amountMinor: line.lineTotalMinor, currency: line.currency },
    })),
    totalAmount: { amountMinor: row.totalAmountMinor, currency: row.currency },
    note: row.note,
    dueAt: toIsoOrNull(row.dueAt),
    version: row.version,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    confirmedAt: toIsoOrNull(row.confirmedAt),
    discardedAt: toIsoOrNull(row.discardedAt),
    replacesPurchaseId: row.replacesPurchaseId,
    voidRecord:
      voidRow === undefined
        ? null
        : {
            id: voidRow.id,
            workspaceId: voidRow.workspaceId,
            purchaseId: voidRow.purchaseId,
            reasonCode: voidRow.reasonCode,
            reason: voidRow.reason,
            amount: { amountMinor: voidRow.amountMinor, currency: voidRow.currency },
            transactionTime: toIso(voidRow.transactionTime),
            recordedAt: toIso(voidRow.recordedAt),
            actorId: voidRow.actorId,
          },
  } as unknown as PurchaseState;
}

async function loadDelivery(tx: Tx, workspaceId: WorkspaceId, deliveryId: string) {
  const rows = await tx
    .select()
    .from(deliveries)
    .where(and(eq(deliveries.workspaceId, workspaceId), eq(deliveries.id, deliveryId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  const [lines, returnRows] = await Promise.all([
    tx
      .select()
      .from(deliveryLines)
      .where(
        and(eq(deliveryLines.workspaceId, workspaceId), eq(deliveryLines.deliveryId, deliveryId)),
      )
      .orderBy(asc(deliveryLines.id)),
    tx
      .select()
      .from(deliveryReturns)
      .where(
        and(
          eq(deliveryReturns.workspaceId, workspaceId),
          eq(deliveryReturns.deliveryId, deliveryId),
        ),
      )
      .orderBy(
        asc(deliveryReturns.transactionTime),
        asc(deliveryReturns.recordedAt),
        asc(deliveryReturns.id),
      ),
  ]);
  const returnIds = returnRows.map((record) => record.id);
  const returnLines =
    returnIds.length === 0
      ? []
      : await tx
          .select()
          .from(deliveryReturnLines)
          .where(inArray(deliveryReturnLines.returnId, returnIds));
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    saleId: row.saleId,
    status: row.status,
    lines: lines.map((line) => ({
      deliveryLineId: line.id,
      saleLineId: line.saleLineId,
      productId: line.productId,
      productName: line.productName,
      quantity: { valueScaled: line.quantityScaled, unit: line.unit },
    })),
    note: row.note,
    cancellationReason: row.cancellationReason,
    version: row.version,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    dispatchedAt: toIsoOrNull(row.dispatchedAt),
    deliveredAt: toIsoOrNull(row.deliveredAt),
    actorId: row.actorId,
    returns: returnRows.map((record) => ({
      id: record.id,
      workspaceId: record.workspaceId,
      deliveryId: record.deliveryId,
      lines: returnLines
        .filter((line) => line.returnId === record.id)
        .map((line) => ({
          deliveryLineId: line.deliveryLineId,
          quantity: { valueScaled: line.quantityScaled, unit: line.unit },
        })),
      reason: record.reason,
      transactionTime: toIso(record.transactionTime),
      recordedAt: toIso(record.recordedAt),
      actorId: record.actorId,
    })),
  } as unknown as DeliveryState;
}

export function createRepositories(tx: Tx, ids: IdMinter) {
  return {
    workspaces: {
      async findName(workspaceId: WorkspaceId): Promise<string | null> {
        const rows = await tx
          .select({ name: workspaces.name })
          .from(workspaces)
          .where(eq(workspaces.id, workspaceId))
          .limit(1);
        return rows[0]?.name ?? null;
      },
      // Note the absence of an `is_active` filter: the caller needs to see a
      // revoked membership to answer WORKSPACE_MEMBERSHIP_INACTIVE rather than
      // the misleading WORKSPACE_ACCESS_DENIED.
      async findMembership(workspaceId: WorkspaceId, actorId: ActorId) {
        const rows = await tx
          .select({
            role: workspaceMemberships.role,
            isActive: workspaceMemberships.isActive,
          })
          .from(workspaceMemberships)
          .where(
            and(
              eq(workspaceMemberships.workspaceId, workspaceId),
              eq(workspaceMemberships.actorId, actorId),
            ),
          )
          .limit(1);
        const row = rows[0];
        return row === undefined
          ? null
          : { workspaceId, actorId, role: row.role, isActive: row.isActive };
      },

      async countActiveOwnersForUpdate(workspaceId: WorkspaceId): Promise<number> {
        // Locked, not counted: two owners revoking each other simultaneously must
        // not both read two (BR-AUTH-007). `FOR UPDATE` on the rows is what
        // serialises them; a count without it is a snapshot either can win from.
        const rows = await tx
          .select({ actorId: workspaceMemberships.actorId })
          .from(workspaceMemberships)
          .where(
            and(
              eq(workspaceMemberships.workspaceId, workspaceId),
              eq(workspaceMemberships.role, "owner"),
              eq(workspaceMemberships.isActive, true),
            ),
          )
          .for("update");
        return rows.length;
      },

      async revokeMembership(workspaceId: WorkspaceId, actorId: ActorId): Promise<boolean> {
        const updated = await tx
          .update(workspaceMemberships)
          .set({ isActive: false })
          .where(
            and(
              eq(workspaceMemberships.workspaceId, workspaceId),
              eq(workspaceMemberships.actorId, actorId),
              eq(workspaceMemberships.isActive, true),
            ),
          )
          .returning({ actorId: workspaceMemberships.actorId });
        return updated.length === 1;
      },

      async listMembers(workspaceId: WorkspaceId) {
        const rows = await tx
          .select({
            actorId: workspaceMemberships.actorId,
            displayName: actors.displayName,
            role: workspaceMemberships.role,
            isActive: workspaceMemberships.isActive,
            createdAt: workspaceMemberships.createdAt,
          })
          .from(workspaceMemberships)
          .innerJoin(actors, eq(actors.id, workspaceMemberships.actorId))
          .where(eq(workspaceMemberships.workspaceId, workspaceId))
          .orderBy(asc(actors.displayName), asc(actors.id));
        return rows.map((row) => ({
          workspaceId,
          actorId: row.actorId,
          displayName: row.displayName,
          role: row.role,
          isActive: row.isActive,
          createdAt: toIso(row.createdAt),
        }));
      },

      async addMembership(
        workspaceId: WorkspaceId,
        actorId: ActorId,
        role: WorkspaceRole,
      ): Promise<boolean> {
        const rows = await tx
          .insert(workspaceMemberships)
          .values({ workspaceId, actorId, role, isActive: true })
          .onConflictDoNothing()
          .returning({ actorId: workspaceMemberships.actorId });
        return rows.length === 1;
      },

      async changeMembershipRole(
        workspaceId: WorkspaceId,
        actorId: ActorId,
        expectedRole: WorkspaceRole,
        role: WorkspaceRole,
      ): Promise<boolean> {
        const rows = await tx
          .update(workspaceMemberships)
          .set({ role })
          .where(
            and(
              eq(workspaceMemberships.workspaceId, workspaceId),
              eq(workspaceMemberships.actorId, actorId),
              eq(workspaceMemberships.role, expectedRole),
              eq(workspaceMemberships.isActive, true),
            ),
          )
          .returning({ actorId: workspaceMemberships.actorId });
        return rows.length === 1;
      },

      async reactivateMembership(workspaceId: WorkspaceId, actorId: ActorId): Promise<boolean> {
        const rows = await tx
          .update(workspaceMemberships)
          .set({ isActive: true })
          .where(
            and(
              eq(workspaceMemberships.workspaceId, workspaceId),
              eq(workspaceMemberships.actorId, actorId),
              eq(workspaceMemberships.isActive, false),
            ),
          )
          .returning({ actorId: workspaceMemberships.actorId });
        return rows.length === 1;
      },
    },

    actors: {
      async findBySupabaseUserId(supabaseUserId: string) {
        const rows = await tx
          .select({ id: actors.id })
          .from(actors)
          .where(eq(actors.supabaseUserId, supabaseUserId))
          .limit(1);
        const row = rows[0];
        return row === undefined ? null : { actorId: row.id as ActorId };
      },

      async findById(actorId: ActorId) {
        const rows = await tx
          .select({ id: actors.id, displayName: actors.displayName })
          .from(actors)
          .where(eq(actors.id, actorId))
          .limit(1);
        const row = rows[0];
        return row === undefined
          ? null
          : { actorId: row.id as ActorId, displayName: row.displayName };
      },

      /**
       * The one query that spans workspaces, and the only one that may
       * (BR-AUTH-008). It is filtered by `actor_id` — never by anything from a
       * request — and by `is_active`, so a revoked membership disappears from the
       * picker on the next load rather than offering a door onto a refusal.
       *
       * Ordered by `(name, id)` so two calls agree and a picker does not reshuffle
       * under somebody's thumb. The join is inner: a membership whose workspace row
       * is gone is not a depot anybody can be shown.
       */
      async listActiveWorkspaces(
        actorId: ActorId,
      ): Promise<
        readonly { workspaceId: WorkspaceId; workspaceName: string; role: WorkspaceRole }[]
      > {
        const rows = await tx
          .select({
            workspaceId: workspaces.id,
            workspaceName: workspaces.name,
            role: workspaceMemberships.role,
          })
          .from(workspaceMemberships)
          .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
          .where(
            and(eq(workspaceMemberships.actorId, actorId), eq(workspaceMemberships.isActive, true)),
          )
          .orderBy(asc(workspaces.name), asc(workspaces.id));

        return rows.map((row) => ({
          workspaceId: row.workspaceId as WorkspaceId,
          workspaceName: row.workspaceName,
          role: row.role,
        }));
      },
    },

    customers: {
      async findById(
        workspaceId: WorkspaceId,
        customerId: CustomerId,
      ): Promise<CustomerState | null> {
        const rows = await tx
          .select()
          .from(customers)
          .where(and(eq(customers.workspaceId, workspaceId), eq(customers.id, customerId)))
          .limit(1);
        const row = rows[0];
        return row === undefined ? null : toCustomerState(row);
      },

      async findByIdForUpdate(
        workspaceId: WorkspaceId,
        customerId: CustomerId,
      ): Promise<CustomerState | null> {
        const rows = await tx
          .select()
          .from(customers)
          .where(and(eq(customers.workspaceId, workspaceId), eq(customers.id, customerId)))
          .limit(1)
          .for("update");
        const row = rows[0];
        return row === undefined ? null : toCustomerState(row);
      },

      async update(customer: CustomerState, expectedVersion: number): Promise<boolean> {
        const updated = await tx
          .update(customers)
          .set({
            displayName: customer.displayName,
            phone: customer.phone,
            note: customer.note,
            isActive: customer.isActive,
            version: customer.version,
            updatedAt: fromIso(customer.updatedAt),
          })
          .where(
            and(
              eq(customers.workspaceId, customer.workspaceId),
              eq(customers.id, customer.id),
              eq(customers.version, expectedVersion),
            ),
          )
          .returning({ id: customers.id });
        return updated.length === 1;
      },

      async insert(customer: CustomerState): Promise<void> {
        await tx.insert(customers).values({
          id: customer.id,
          workspaceId: customer.workspaceId,
          displayName: customer.displayName,
          phone: customer.phone,
          note: customer.note,
          isActive: customer.isActive,
          version: customer.version,
          transactionTime: fromIso(customer.transactionTime),
          recordedAt: fromIso(customer.recordedAt),
          updatedAt: fromIso(customer.updatedAt),
        });
      },
    },

    products: {
      async findById(workspaceId: WorkspaceId, productId: ProductId): Promise<ProductState | null> {
        const rows = await tx
          .select()
          .from(products)
          .where(and(eq(products.workspaceId, workspaceId), eq(products.id, productId)))
          .limit(1);
        const row = rows[0];
        return row === undefined ? null : toProductState(row);
      },
      async findByIdForUpdate(
        workspaceId: WorkspaceId,
        productId: ProductId,
      ): Promise<ProductState | null> {
        const rows = await tx
          .select()
          .from(products)
          .where(and(eq(products.workspaceId, workspaceId), eq(products.id, productId)))
          .limit(1)
          .for("update");
        const row = rows[0];
        return row === undefined ? null : toProductState(row);
      },
      async insert(product: ProductState): Promise<void> {
        await tx.insert(products).values({
          id: product.id,
          workspaceId: product.workspaceId,
          name: product.displayName,
          aliases: [...product.aliases],
          preferredUnit: product.preferredUnit,
          isActive: product.isActive,
          version: product.version,
          createdAt: fromIso(product.createdAt),
          updatedAt: fromIso(product.updatedAt),
        });
      },
      async update(product: ProductState, expectedVersion: number): Promise<boolean> {
        const rows = await tx
          .update(products)
          .set({
            name: product.displayName,
            aliases: [...product.aliases],
            preferredUnit: product.preferredUnit,
            isActive: product.isActive,
            version: product.version,
            updatedAt: fromIso(product.updatedAt),
          })
          .where(
            and(
              eq(products.workspaceId, product.workspaceId),
              eq(products.id, product.id),
              eq(products.version, expectedVersion),
            ),
          )
          .returning({ id: products.id });
        return rows.length === 1;
      },
    },

    suppliers: {
      async findById(workspaceId: WorkspaceId, supplierId: SupplierId) {
        const rows = await tx
          .select()
          .from(suppliers)
          .where(and(eq(suppliers.workspaceId, workspaceId), eq(suppliers.id, supplierId)))
          .limit(1);
        return rows[0] === undefined ? null : toSupplierState(rows[0]);
      },
      async findByIdForUpdate(workspaceId: WorkspaceId, supplierId: SupplierId) {
        const rows = await tx
          .select()
          .from(suppliers)
          .where(and(eq(suppliers.workspaceId, workspaceId), eq(suppliers.id, supplierId)))
          .limit(1)
          .for("update");
        return rows[0] === undefined ? null : toSupplierState(rows[0]);
      },
      async insert(supplier: SupplierState) {
        await tx.insert(suppliers).values({
          id: supplier.id,
          workspaceId: supplier.workspaceId,
          displayName: supplier.displayName,
          phone: supplier.phone,
          note: supplier.note,
          isActive: supplier.isActive,
          version: supplier.version,
          createdAt: fromIso(supplier.createdAt),
          updatedAt: fromIso(supplier.updatedAt),
        });
      },
      async update(supplier: SupplierState, expectedVersion: number) {
        const rows = await tx
          .update(suppliers)
          .set({
            displayName: supplier.displayName,
            phone: supplier.phone,
            note: supplier.note,
            isActive: supplier.isActive,
            version: supplier.version,
            updatedAt: fromIso(supplier.updatedAt),
          })
          .where(
            and(
              eq(suppliers.workspaceId, supplier.workspaceId),
              eq(suppliers.id, supplier.id),
              eq(suppliers.version, expectedVersion),
            ),
          )
          .returning({ id: suppliers.id });
        return rows.length === 1;
      },
    },

    supplierPayments: {
      async findByIdForUpdate(workspaceId: WorkspaceId, supplierPaymentId: SupplierPaymentId) {
        const rows = await tx
          .select()
          .from(supplierPayments)
          .where(
            and(
              eq(supplierPayments.workspaceId, workspaceId),
              eq(supplierPayments.id, supplierPaymentId),
            ),
          )
          .limit(1)
          .for("update");
        return rows[0] === undefined ? null : toSupplierPaymentState(rows[0]);
      },
      async insert(payment: SupplierPaymentState) {
        await tx.insert(supplierPayments).values({
          id: payment.id,
          workspaceId: payment.workspaceId,
          supplierId: payment.supplierId,
          amountMinor: payment.amount.amountMinor,
          currency: payment.amount.currency,
          method: payment.method,
          note: payment.note,
          reversedAmountMinor: payment.reversedAmount.amountMinor,
          version: payment.version,
          transactionTime: fromIso(payment.transactionTime),
          recordedAt: fromIso(payment.recordedAt),
        });
      },
      async update(payment: SupplierPaymentState, expectedVersion: number) {
        const rows = await tx
          .update(supplierPayments)
          .set({
            reversedAmountMinor: payment.reversedAmount.amountMinor,
            version: payment.version,
          })
          .where(
            and(
              eq(supplierPayments.workspaceId, payment.workspaceId),
              eq(supplierPayments.id, payment.id),
              eq(supplierPayments.version, expectedVersion),
            ),
          )
          .returning({ id: supplierPayments.id });
        return rows.length === 1;
      },
      async insertReversal(reversal: {
        id: string;
        workspaceId: WorkspaceId;
        supplierPaymentId: SupplierPaymentId;
        amount: SupplierPaymentState["amount"];
        reason: string;
        transactionTime: IsoInstant;
        recordedAt: IsoInstant;
      }) {
        await tx.insert(supplierPaymentReversals).values({
          id: reversal.id,
          workspaceId: reversal.workspaceId,
          supplierPaymentId: reversal.supplierPaymentId,
          amountMinor: reversal.amount.amountMinor,
          currency: reversal.amount.currency,
          reason: reversal.reason,
          transactionTime: fromIso(reversal.transactionTime),
          recordedAt: fromIso(reversal.recordedAt),
        });
      },
    },

    supplierAccountEntries: {
      async append(
        drafts: readonly Omit<SupplierAccountEntryDto, "id">[],
      ): Promise<readonly SupplierAccountEntryDto[]> {
        const values = drafts.map((entry) => ({
          id: ids.newId(),
          workspaceId: entry.workspaceId,
          supplierId: entry.supplierId,
          amountMinor: entry.amount.amountMinor,
          currency: entry.amount.currency,
          sourceType: entry.sourceType,
          sourceId: entry.sourceId,
          reversalOfEntryId: entry.reversalOfEntryId,
          reasonCode: entry.reasonCode,
          reason: entry.reason,
          transactionTime: fromIso(entry.transactionTime),
          recordedAt: fromIso(entry.recordedAt),
          actorId: entry.actorId,
          commandId: entry.commandId,
        }));
        const rows = await tx.insert(supplierAccountEntries).values(values).returning();
        return rows.map((row) => ({
          id: row.id as SupplierAccountEntryDto["id"],
          workspaceId: row.workspaceId as WorkspaceId,
          supplierId: row.supplierId as SupplierId,
          amount: { amountMinor: row.amountMinor, currency: row.currency },
          sourceType: row.sourceType as SupplierAccountEntryDto["sourceType"],
          sourceId: row.sourceId,
          reversalOfEntryId: row.reversalOfEntryId as SupplierAccountEntryDto["reversalOfEntryId"],
          reasonCode: row.reasonCode,
          reason: row.reason,
          transactionTime: toIso(row.transactionTime),
          recordedAt: toIso(row.recordedAt),
          actorId: row.actorId as ActorId,
          commandId: row.commandId as CommandId,
        }));
      },
      async listBySupplier(workspaceId: WorkspaceId, supplierId: SupplierId) {
        const rows = await tx
          .select()
          .from(supplierAccountEntries)
          .where(
            and(
              eq(supplierAccountEntries.workspaceId, workspaceId),
              eq(supplierAccountEntries.supplierId, supplierId),
            ),
          )
          .orderBy(
            asc(supplierAccountEntries.transactionTime),
            asc(supplierAccountEntries.recordedAt),
            asc(supplierAccountEntries.id),
          );
        return rows.map((row) => ({
          id: row.id as SupplierAccountEntryDto["id"],
          workspaceId: row.workspaceId as WorkspaceId,
          supplierId: row.supplierId as SupplierId,
          amount: { amountMinor: row.amountMinor, currency: row.currency },
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          reversalOfEntryId: row.reversalOfEntryId as SupplierAccountEntryDto["reversalOfEntryId"],
          reasonCode: row.reasonCode,
          reason: row.reason,
          transactionTime: toIso(row.transactionTime),
          recordedAt: toIso(row.recordedAt),
          actorId: row.actorId as ActorId,
          commandId: row.commandId as CommandId,
        }));
      },
      async findBySource(
        workspaceId: WorkspaceId,
        sourceType: SupplierAccountEntryDto["sourceType"],
        sourceId: string,
      ) {
        const rows = await tx
          .select()
          .from(supplierAccountEntries)
          .where(
            and(
              eq(supplierAccountEntries.workspaceId, workspaceId),
              eq(supplierAccountEntries.sourceType, sourceType),
              eq(supplierAccountEntries.sourceId, sourceId),
            ),
          )
          .limit(1);
        const row = rows[0];
        return row === undefined
          ? null
          : {
              id: row.id as SupplierAccountEntryDto["id"],
              workspaceId: row.workspaceId as WorkspaceId,
              supplierId: row.supplierId as SupplierId,
              amount: { amountMinor: row.amountMinor, currency: row.currency },
              sourceType: row.sourceType,
              sourceId: row.sourceId,
              reversalOfEntryId:
                row.reversalOfEntryId as SupplierAccountEntryDto["reversalOfEntryId"],
              reasonCode: row.reasonCode,
              reason: row.reason,
              transactionTime: toIso(row.transactionTime),
              recordedAt: toIso(row.recordedAt),
              actorId: row.actorId as ActorId,
              commandId: row.commandId as CommandId,
            };
      },
    },

    supplierAccountBalances: {
      async get(workspaceId: WorkspaceId, supplierId: SupplierId) {
        const rows = await tx
          .select()
          .from(supplierAccountBalances)
          .where(
            and(
              eq(supplierAccountBalances.workspaceId, workspaceId),
              eq(supplierAccountBalances.supplierId, supplierId),
            ),
          )
          .limit(1);
        const row = rows[0];
        return row === undefined
          ? null
          : {
              workspaceId: row.workspaceId as WorkspaceId,
              supplierId: row.supplierId as SupplierId,
              balance: { amountMinor: row.balanceMinor, currency: row.currency },
              entryCount: row.entryCount,
              lastEntryTransactionTime: toIsoOrNull(row.lastEntryTransactionTime),
              updatedAt: toIso(row.updatedAt),
            };
      },
      async applyDelta(delta: {
        workspaceId: WorkspaceId;
        supplierId: SupplierId;
        amount: SupplierPaymentState["amount"];
        entryCount: number;
        lastEntryTransactionTime: IsoInstant;
        updatedAt: IsoInstant;
      }) {
        await tx
          .insert(supplierAccountBalances)
          .values({
            workspaceId: delta.workspaceId,
            supplierId: delta.supplierId,
            balanceMinor: delta.amount.amountMinor,
            currency: delta.amount.currency,
            entryCount: delta.entryCount,
            lastEntryTransactionTime: fromIso(delta.lastEntryTransactionTime),
            updatedAt: fromIso(delta.updatedAt),
          })
          .onConflictDoUpdate({
            target: [supplierAccountBalances.workspaceId, supplierAccountBalances.supplierId],
            set: {
              balanceMinor: sql`${supplierAccountBalances.balanceMinor} + excluded.balance_minor`,
              currency: sql`excluded.currency`,
              entryCount: sql`${supplierAccountBalances.entryCount} + excluded.entry_count`,
              lastEntryTransactionTime: sql`greatest(
                ${supplierAccountBalances.lastEntryTransactionTime},
                excluded.last_entry_transaction_time
              )`,
              updatedAt: sql`greatest(${supplierAccountBalances.updatedAt}, excluded.updated_at)`,
            },
          });
      },
      async save(balance: {
        workspaceId: WorkspaceId;
        supplierId: SupplierId;
        balance: SupplierPaymentState["amount"];
        entryCount: number;
        lastEntryTransactionTime: IsoInstant | null;
        updatedAt: IsoInstant;
      }) {
        await tx
          .insert(supplierAccountBalances)
          .values({
            workspaceId: balance.workspaceId,
            supplierId: balance.supplierId,
            balanceMinor: balance.balance.amountMinor,
            currency: balance.balance.currency,
            entryCount: balance.entryCount,
            lastEntryTransactionTime: fromIsoOrNull(balance.lastEntryTransactionTime),
            updatedAt: fromIso(balance.updatedAt),
          })
          .onConflictDoUpdate({
            target: [supplierAccountBalances.workspaceId, supplierAccountBalances.supplierId],
            set: {
              balanceMinor: balance.balance.amountMinor,
              currency: balance.balance.currency,
              entryCount: balance.entryCount,
              lastEntryTransactionTime: fromIsoOrNull(balance.lastEntryTransactionTime),
              updatedAt: fromIso(balance.updatedAt),
            },
          });
      },
    },

    purchases: {
      findById: (workspaceId: WorkspaceId, purchaseId: string) =>
        loadPurchase(tx, workspaceId, purchaseId),
      async findReplacementOf(workspaceId: WorkspaceId, purchaseId: string) {
        const rows = await tx
          .select({ id: purchases.id })
          .from(purchases)
          .where(
            and(
              eq(purchases.workspaceId, workspaceId),
              eq(purchases.replacesPurchaseId, purchaseId),
            ),
          )
          .limit(1);
        return rows[0] === undefined ? null : loadPurchase(tx, workspaceId, rows[0].id);
      },
      async findByIdForUpdate(workspaceId: WorkspaceId, purchaseId: string) {
        await tx
          .select({ id: purchases.id })
          .from(purchases)
          .where(and(eq(purchases.workspaceId, workspaceId), eq(purchases.id, purchaseId)))
          .limit(1)
          .for("update");
        return loadPurchase(tx, workspaceId, purchaseId);
      },
      async insert(purchase: PurchaseState) {
        const inserted = await tx
          .insert(purchases)
          .values({
            id: purchase.id,
            workspaceId: purchase.workspaceId,
            supplierId: purchase.supplierId,
            status: purchase.status,
            currency: purchase.currency,
            totalAmountMinor: purchase.totalAmount.amountMinor,
            note: purchase.note,
            dueAt: fromIsoOrNull(purchase.dueAt),
            version: purchase.version,
            transactionTime: fromIso(purchase.transactionTime),
            recordedAt: fromIso(purchase.recordedAt),
            confirmedAt: fromIsoOrNull(purchase.confirmedAt),
            discardedAt: fromIsoOrNull(purchase.discardedAt),
            replacesPurchaseId: purchase.replacesPurchaseId,
          })
          .onConflictDoNothing()
          .returning({ id: purchases.id });
        if (inserted.length === 0) return false;
        if (purchase.lines.length > 0) {
          await tx.insert(purchaseLines).values(
            purchase.lines.map((line) => ({
              id: line.lineId,
              workspaceId: purchase.workspaceId,
              purchaseId: purchase.id,
              productId: line.productId,
              productName: line.productName,
              quantityScaled: line.quantity.valueScaled,
              unit: line.quantity.unit,
              unitPriceMinor: line.unitPrice.amountMinor,
              lineTotalMinor: line.lineTotal.amountMinor,
              currency: line.unitPrice.currency,
            })),
          );
        }
        return true;
      },
      async updateDraft(purchase: PurchaseState, expectedVersion: number, replaceLines: boolean) {
        const rows = await tx
          .update(purchases)
          .set({
            supplierId: purchase.supplierId,
            currency: purchase.currency,
            totalAmountMinor: purchase.totalAmount.amountMinor,
            note: purchase.note,
            dueAt: fromIsoOrNull(purchase.dueAt),
            status: purchase.status,
            version: purchase.version,
            discardedAt: fromIsoOrNull(purchase.discardedAt),
          })
          .where(
            and(
              eq(purchases.workspaceId, purchase.workspaceId),
              eq(purchases.id, purchase.id),
              eq(purchases.version, expectedVersion),
              eq(purchases.status, "draft"),
            ),
          )
          .returning({ id: purchases.id });
        if (rows.length !== 1) return false;
        if (replaceLines) {
          await tx
            .delete(purchaseLines)
            .where(
              and(
                eq(purchaseLines.workspaceId, purchase.workspaceId),
                eq(purchaseLines.purchaseId, purchase.id),
              ),
            );
          if (purchase.lines.length > 0)
            await tx.insert(purchaseLines).values(
              purchase.lines.map((line) => ({
                id: line.lineId,
                workspaceId: purchase.workspaceId,
                purchaseId: purchase.id,
                productId: line.productId,
                productName: line.productName,
                quantityScaled: line.quantity.valueScaled,
                unit: line.quantity.unit,
                unitPriceMinor: line.unitPrice.amountMinor,
                lineTotalMinor: line.lineTotal.amountMinor,
                currency: line.unitPrice.currency,
              })),
            );
        }
        return true;
      },
      async confirm(purchase: PurchaseState, expectedVersion: number) {
        const rows = await tx
          .update(purchases)
          .set({
            status: purchase.status,
            totalAmountMinor: purchase.totalAmount.amountMinor,
            version: purchase.version,
            confirmedAt: fromIsoOrNull(purchase.confirmedAt),
          })
          .where(
            and(
              eq(purchases.workspaceId, purchase.workspaceId),
              eq(purchases.id, purchase.id),
              eq(purchases.version, expectedVersion),
              eq(purchases.status, "draft"),
            ),
          )
          .returning({ id: purchases.id });
        return rows.length === 1;
      },
      async insertVoid(record: PurchaseVoidState) {
        const rows = await tx
          .insert(purchaseVoids)
          .values({
            id: record.id,
            workspaceId: record.workspaceId,
            purchaseId: record.purchaseId,
            reasonCode: record.reasonCode,
            reason: record.reason,
            amountMinor: record.amount.amountMinor,
            currency: record.amount.currency,
            transactionTime: fromIso(record.transactionTime),
            recordedAt: fromIso(record.recordedAt),
            actorId: record.actorId,
          })
          .onConflictDoNothing()
          .returning({ id: purchaseVoids.id });
        return rows.length === 1;
      },
    },

    purchaseReceipts: {
      async findById(workspaceId: WorkspaceId, receiptId: string) {
        const rows = await tx
          .select()
          .from(purchaseReceipts)
          .where(
            and(eq(purchaseReceipts.workspaceId, workspaceId), eq(purchaseReceipts.id, receiptId)),
          )
          .limit(1);
        const row = rows[0];
        if (row === undefined) return null;
        const [lines, reversals] = await Promise.all([
          tx
            .select()
            .from(purchaseReceiptLines)
            .where(
              and(
                eq(purchaseReceiptLines.workspaceId, workspaceId),
                eq(purchaseReceiptLines.receiptId, receiptId),
              ),
            ),
          tx
            .select()
            .from(purchaseReceiptReversals)
            .where(
              and(
                eq(purchaseReceiptReversals.workspaceId, workspaceId),
                eq(purchaseReceiptReversals.receiptId, receiptId),
              ),
            )
            .limit(1),
        ]);
        const reversal = reversals[0];
        return {
          id: row.id,
          workspaceId: row.workspaceId,
          purchaseId: row.purchaseId,
          lines: lines.map((line) => ({
            receiptLineId: line.id,
            purchaseLineId: line.purchaseLineId,
            productId: line.productId,
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
                  workspaceId: reversal.workspaceId,
                  receiptId: reversal.receiptId,
                  reasonCode: reversal.reasonCode,
                  reason: reversal.reason,
                  transactionTime: toIso(reversal.transactionTime),
                  recordedAt: toIso(reversal.recordedAt),
                  actorId: reversal.actorId,
                },
        } as unknown as PurchaseReceiptState;
      },
      async insert(receipt: PurchaseReceiptState) {
        await tx.insert(purchaseReceipts).values({
          id: receipt.id,
          workspaceId: receipt.workspaceId,
          purchaseId: receipt.purchaseId,
          note: receipt.note,
          transactionTime: fromIso(receipt.transactionTime),
          recordedAt: fromIso(receipt.recordedAt),
          actorId: receipt.actorId,
        });
        await tx.insert(purchaseReceiptLines).values(
          receipt.lines.map((line) => ({
            id: line.receiptLineId,
            workspaceId: receipt.workspaceId,
            receiptId: receipt.id,
            purchaseLineId: line.purchaseLineId,
            productId: line.productId,
            quantityScaled: line.quantity.valueScaled,
            unit: line.quantity.unit,
          })),
        );
      },
      async insertReversal(reversal: PurchaseReceiptReversalState) {
        const rows = await tx
          .insert(purchaseReceiptReversals)
          .values({
            id: reversal.id,
            workspaceId: reversal.workspaceId,
            receiptId: reversal.receiptId,
            reasonCode: reversal.reasonCode,
            reason: reversal.reason,
            transactionTime: fromIso(reversal.transactionTime),
            recordedAt: fromIso(reversal.recordedAt),
            actorId: reversal.actorId,
          })
          .onConflictDoNothing()
          .returning({ id: purchaseReceiptReversals.id });
        return rows.length === 1;
      },
      async netReceivedByPurchaseLine(workspaceId: WorkspaceId, purchaseId: string) {
        const rows = await tx.execute(sql`
          select prl.purchase_line_id as "purchaseLineId",
            coalesce(sum(case when prr.id is null then prl.quantity_scaled else 0 end), 0)::bigint as "net"
          from purchase_receipt_lines prl
          join purchase_receipts pr on pr.id = prl.receipt_id and pr.workspace_id = prl.workspace_id
          left join purchase_receipt_reversals prr
            on prr.workspace_id = pr.workspace_id and prr.receipt_id = pr.id
          where pr.workspace_id = ${workspaceId}::uuid and pr.purchase_id = ${purchaseId}::uuid
          group by prl.purchase_line_id
        `);
        return new Map(
          (rows as unknown as Array<{ purchaseLineId: string; net: string }>).map((row) => [
            row.purchaseLineId,
            Number(row.net),
          ]),
        );
      },
    },

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

    deliveries: {
      findById: (workspaceId: WorkspaceId, deliveryId: DeliveryId) =>
        loadDelivery(tx, workspaceId, deliveryId),
      async findByIdForUpdate(workspaceId: WorkspaceId, deliveryId: DeliveryId) {
        await tx
          .select({ id: deliveries.id })
          .from(deliveries)
          .where(and(eq(deliveries.workspaceId, workspaceId), eq(deliveries.id, deliveryId)))
          .limit(1)
          .for("update");
        return loadDelivery(tx, workspaceId, deliveryId);
      },
      async insert(delivery: DeliveryState) {
        const inserted = await tx
          .insert(deliveries)
          .values({
            id: delivery.id,
            workspaceId: delivery.workspaceId,
            saleId: delivery.saleId,
            status: delivery.status,
            note: delivery.note,
            cancellationReason: delivery.cancellationReason,
            version: delivery.version,
            transactionTime: fromIso(delivery.transactionTime),
            recordedAt: fromIso(delivery.recordedAt),
            dispatchedAt: fromIsoOrNull(delivery.dispatchedAt),
            deliveredAt: fromIsoOrNull(delivery.deliveredAt),
            actorId: delivery.actorId,
          })
          .onConflictDoNothing()
          .returning({ id: deliveries.id });
        if (inserted.length === 0) return false;
        await tx.insert(deliveryLines).values(
          delivery.lines.map((line) => ({
            id: line.deliveryLineId,
            workspaceId: delivery.workspaceId,
            deliveryId: delivery.id,
            saleLineId: line.saleLineId,
            productId: line.productId,
            productName: line.productName,
            quantityScaled: line.quantity.valueScaled,
            unit: line.quantity.unit,
          })),
        );
        return true;
      },
      async update(delivery: DeliveryState, expectedVersion: number, replaceLines: boolean) {
        const changed = await tx
          .update(deliveries)
          .set({
            status: delivery.status,
            note: delivery.note,
            cancellationReason: delivery.cancellationReason,
            version: delivery.version,
            recordedAt: fromIso(delivery.recordedAt),
            dispatchedAt: fromIsoOrNull(delivery.dispatchedAt),
            deliveredAt: fromIsoOrNull(delivery.deliveredAt),
          })
          .where(
            and(
              eq(deliveries.workspaceId, delivery.workspaceId),
              eq(deliveries.id, delivery.id),
              eq(deliveries.version, expectedVersion),
            ),
          )
          .returning({ id: deliveries.id });
        if (changed.length === 0) return false;
        if (replaceLines) {
          await tx
            .delete(deliveryLines)
            .where(
              and(
                eq(deliveryLines.workspaceId, delivery.workspaceId),
                eq(deliveryLines.deliveryId, delivery.id),
              ),
            );
          await tx.insert(deliveryLines).values(
            delivery.lines.map((line) => ({
              id: line.deliveryLineId,
              workspaceId: delivery.workspaceId,
              deliveryId: delivery.id,
              saleLineId: line.saleLineId,
              productId: line.productId,
              productName: line.productName,
              quantityScaled: line.quantity.valueScaled,
              unit: line.quantity.unit,
            })),
          );
        }
        return true;
      },
      async insertReturn(record: DeliveryReturnState) {
        const inserted = await tx
          .insert(deliveryReturns)
          .values({
            id: record.id,
            workspaceId: record.workspaceId,
            deliveryId: record.deliveryId,
            reason: record.reason,
            transactionTime: fromIso(record.transactionTime),
            recordedAt: fromIso(record.recordedAt),
            actorId: record.actorId,
          })
          .onConflictDoNothing()
          .returning({ id: deliveryReturns.id });
        if (inserted.length === 0) return false;
        await tx.insert(deliveryReturnLines).values(
          record.lines.map((line) => ({
            returnId: record.id,
            deliveryLineId: line.deliveryLineId,
            quantityScaled: line.quantity.valueScaled,
            unit: line.quantity.unit,
          })),
        );
        return true;
      },
      async netFulfilledBySaleLine(
        workspaceId: WorkspaceId,
        saleId: SaleId,
        excludeDeliveryId: DeliveryId | null,
      ) {
        const rows = await tx.execute(sql`
          with dispatched as (
            select dl.sale_line_id, sum(dl.quantity_scaled)::bigint as quantity
            from ${deliveryLines} dl
            join ${deliveries} d
              on d.workspace_id = dl.workspace_id and d.id = dl.delivery_id
            where d.workspace_id = ${workspaceId}::uuid
              and d.sale_id = ${saleId}::uuid
              and d.status in ('dispatched', 'delivered')
              and (${excludeDeliveryId}::uuid is null or d.id <> ${excludeDeliveryId}::uuid)
            group by dl.sale_line_id
          ), returned as (
            select dl.sale_line_id, sum(drl.quantity_scaled)::bigint as quantity
            from ${deliveryReturnLines} drl
            join ${deliveryReturns} dr on dr.id = drl.return_id
            join ${deliveryLines} dl on dl.id = drl.delivery_line_id
            join ${deliveries} d
              on d.workspace_id = dl.workspace_id and d.id = dl.delivery_id
            where d.workspace_id = ${workspaceId}::uuid
              and d.sale_id = ${saleId}::uuid
              and (${excludeDeliveryId}::uuid is null or d.id <> ${excludeDeliveryId}::uuid)
            group by dl.sale_line_id
          )
          select coalesce(dispatched.sale_line_id, returned.sale_line_id) as "saleLineId",
            (coalesce(dispatched.quantity, 0) - coalesce(returned.quantity, 0))::bigint as "net"
          from dispatched
          full join returned using (sale_line_id)
        `);
        return new Map(
          (rows as unknown as Array<{ saleLineId: string; net: number | string }>).map((row) => [
            String(row.saleLineId),
            Number(row.net),
          ]),
        );
      },
      async fulfilmentBySaleLine(workspaceId: WorkspaceId, saleId: SaleId) {
        const rows = await tx.execute(sql`
          with dispatched as (
            select dl.sale_line_id, sum(dl.quantity_scaled)::bigint as quantity
            from ${deliveryLines} dl
            join ${deliveries} d
              on d.workspace_id = dl.workspace_id and d.id = dl.delivery_id
            where d.workspace_id = ${workspaceId}::uuid
              and d.sale_id = ${saleId}::uuid
              and d.status in ('dispatched', 'delivered')
            group by dl.sale_line_id
          ), returned as (
            select dl.sale_line_id, sum(drl.quantity_scaled)::bigint as quantity
            from ${deliveryReturnLines} drl
            join ${deliveryReturns} dr
              on dr.workspace_id = ${workspaceId}::uuid and dr.id = drl.return_id
            join ${deliveryLines} dl on dl.id = drl.delivery_line_id
            join ${deliveries} d
              on d.workspace_id = dl.workspace_id and d.id = dl.delivery_id
            where d.workspace_id = ${workspaceId}::uuid
              and d.sale_id = ${saleId}::uuid
            group by dl.sale_line_id
          )
          select coalesce(dispatched.sale_line_id, returned.sale_line_id) as "saleLineId",
            coalesce(dispatched.quantity, 0)::bigint as "dispatched",
            coalesce(returned.quantity, 0)::bigint as "returned"
          from dispatched
          full join returned using (sale_line_id)
        `);
        return new Map(
          (
            rows as unknown as Array<{
              saleLineId: string;
              dispatched: number | string;
              returned: number | string;
            }>
          ).map((row) => [
            String(row.saleLineId),
            { dispatched: Number(row.dispatched), returned: Number(row.returned) },
          ]),
        );
      },
    },

    documents: {
      async nextVersion(args: {
        workspaceId: WorkspaceId;
        documentType: DocumentType;
        sourceType: DocumentSourceType;
        sourceId: string;
      }) {
        await tx.execute(sql`select pg_advisory_xact_lock(
          hashtextextended(
            ${`${args.workspaceId}:${args.documentType}:${args.sourceType}:${args.sourceId}`},
            0
          )
        )`);
        const rows = await tx
          .select({ version: sql<number>`coalesce(max(${documents.version}), 0) + 1` })
          .from(documents)
          .where(
            and(
              eq(documents.workspaceId, args.workspaceId),
              eq(documents.documentType, args.documentType),
              eq(documents.sourceType, args.sourceType),
              eq(documents.sourceId, args.sourceId),
            ),
          );
        return Number(rows[0]?.version ?? 1);
      },
      async insert(document: DocumentDto) {
        const rows = await tx
          .insert(documents)
          .values({
            id: document.id,
            workspaceId: document.workspaceId,
            documentType: document.documentType,
            sourceType: document.sourceType,
            sourceId: document.sourceId,
            version: document.version,
            snapshot: document.snapshot,
            digest: document.digest,
            generatedAt: fromIso(document.generatedAt),
            generatedBy: document.generatedBy,
          })
          .onConflictDoNothing()
          .returning({ id: documents.id });
        return rows.length === 1;
      },
      async get(workspaceId: WorkspaceId, documentId: string) {
        const rows = await tx
          .select()
          .from(documents)
          .where(and(eq(documents.workspaceId, workspaceId), eq(documents.id, documentId)))
          .limit(1);
        const row = rows[0];
        return row === undefined
          ? null
          : ({
              id: row.id,
              workspaceId: row.workspaceId,
              documentType: row.documentType,
              sourceType: row.sourceType,
              sourceId: row.sourceId,
              version: row.version,
              snapshot: row.snapshot as Record<string, unknown>,
              digest: row.digest,
              generatedAt: toIso(row.generatedAt),
              generatedBy: row.generatedBy,
            } as DocumentDto);
      },
      async insertShare(share: {
        id: string;
        workspaceId: WorkspaceId;
        documentId: string;
        tokenHash: string;
        expiresAt: IsoInstant | null;
        createdAt: IsoInstant;
        createdBy: ActorId;
      }) {
        const rows = await tx
          .insert(documentShares)
          .values({
            id: share.id,
            workspaceId: share.workspaceId,
            documentId: share.documentId,
            tokenHash: share.tokenHash,
            expiresAt: fromIsoOrNull(share.expiresAt),
            createdAt: fromIso(share.createdAt),
            createdBy: share.createdBy,
          })
          .onConflictDoNothing()
          .returning({ id: documentShares.id });
        return rows.length === 1;
      },
      async revokeShare(args: {
        workspaceId: WorkspaceId;
        shareId: string;
        revokedAt: IsoInstant;
        revokedBy: ActorId;
        reason: string;
      }) {
        const rows = await tx
          .update(documentShares)
          .set({
            revokedAt: fromIso(args.revokedAt),
            revokedBy: args.revokedBy,
            revocationReason: args.reason,
          })
          .where(
            and(
              eq(documentShares.workspaceId, args.workspaceId),
              eq(documentShares.id, args.shareId),
              sql`${documentShares.revokedAt} is null`,
            ),
          )
          .returning({ id: documentShares.id });
        return rows.length === 1;
      },
    },

    operations: {
      async restoreBackup(workspaceId: WorkspaceId, payload: WorkspaceBackupV3["payload"]) {
        const [
          customerRows,
          productRows,
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
            .select({ id: sales.id })
            .from(sales)
            .where(eq(sales.workspaceId, workspaceId))
            .limit(1),
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
            (workspace_id, product_id, unit, quantity_scaled, movement_count,
             last_movement_transaction_time, updated_at)
          SELECT ${workspaceId}::uuid, product_id, unit, sum(quantity_scaled),
                 count(*)::int, max(transaction_time), now()
          FROM ${inventoryMovements}
          WHERE workspace_id = ${workspaceId}::uuid
          GROUP BY product_id, unit
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

    sales: {
      async findByIdForUpdate(workspaceId: WorkspaceId, saleId: SaleId): Promise<SaleState | null> {
        // Row lock held for the rest of the transaction (ADR-0009). Lines are not
        // locked separately: they are only ever written with their sale.
        //
        // The lock on the *sale* is also what serialises two concurrent voids,
        // even though a void writes to a different table (BR-SALE-013).
        const rows = await tx
          .select()
          .from(sales)
          .where(and(eq(sales.workspaceId, workspaceId), eq(sales.id, saleId)))
          .limit(1)
          .for("update");
        const row = rows[0];
        if (row === undefined) {
          return null;
        }

        const lineRows = await tx
          .select()
          .from(saleLines)
          .where(and(eq(saleLines.workspaceId, workspaceId), eq(saleLines.saleId, saleId)))
          .orderBy(asc(saleLines.position));

        const voidRows = await tx
          .select()
          .from(saleVoids)
          .where(and(eq(saleVoids.workspaceId, workspaceId), eq(saleVoids.saleId, saleId)))
          .limit(1);

        return toSaleState(row, lineRows, voidRows[0] ?? null);
      },

      async insert(sale: SaleState): Promise<void> {
        await tx.insert(sales).values({
          id: sale.id,
          workspaceId: sale.workspaceId,
          customerId: sale.customerId,
          status: sale.status,
          currency: sale.currency,
          totalAmountMinor: sale.totalAmount.amountMinor,
          note: sale.note,
          version: sale.version,
          transactionTime: fromIso(sale.transactionTime),
          recordedAt: fromIso(sale.recordedAt),
          postedAt: fromIsoOrNull(sale.postedAt),
          dueAt: fromIsoOrNull(sale.dueAt),
          replacesSaleId: sale.replacesSaleId,
        });

        if (sale.lines.length > 0) {
          await tx.insert(saleLines).values(
            sale.lines.map((line, position) => ({
              id: line.lineId,
              workspaceId: sale.workspaceId,
              saleId: sale.id,
              productId: line.productId,
              productName: line.productName,
              quantityScaled: line.quantity.valueScaled,
              unit: line.quantity.unit,
              unitPriceMinor: line.unitPrice.amountMinor,
              lineTotalMinor: line.lineTotal.amountMinor,
              currency: sale.currency,
              position,
            })),
          );
        }
      },

      /**
       * The one and only mutation of a sale: draft → posted (BR-SALE-008).
       *
       * Conditional on the version, so a concurrent writer that slipped between
       * the read and the write loses instead of overwriting (BR-SALE-006), and
       * conditional on `status = 'draft'`, so this cannot touch a posted row even
       * if a caller passed a stale version that happened to match. Sale lines are
       * not rewritten — posting does not change them.
       */
      async post(sale: SaleState, expectedVersion: number): Promise<boolean> {
        const updated = await tx
          .update(sales)
          .set({
            status: "posted",
            totalAmountMinor: sale.totalAmount.amountMinor,
            version: sale.version,
            postedAt: fromIsoOrNull(sale.postedAt),
          })
          .where(
            and(
              eq(sales.workspaceId, sale.workspaceId),
              eq(sales.id, sale.id),
              eq(sales.version, expectedVersion),
              eq(sales.status, "draft"),
            ),
          )
          .returning({ id: sales.id });
        return updated.length === 1;
      },

      /**
       * Edits or discards a draft. Conditional on the version **and** on the row
       * still being a draft, so a posted sale is unreachable through this path
       * whatever version arrives (BR-SALE-008).
       */
      async updateDraft(
        sale: SaleState,
        expectedVersion: number,
        options: { replaceLines: boolean },
      ): Promise<boolean> {
        const updated = await tx
          .update(sales)
          .set({
            status: sale.status,
            totalAmountMinor: sale.totalAmount.amountMinor,
            note: sale.note,
            dueAt: fromIsoOrNull(sale.dueAt),
            discardedAt: fromIsoOrNull(sale.discardedAt),
            version: sale.version,
          })
          .where(
            and(
              eq(sales.workspaceId, sale.workspaceId),
              eq(sales.id, sale.id),
              eq(sales.version, expectedVersion),
              eq(sales.status, "draft"),
            ),
          )
          .returning({ id: sales.id });

        if (updated.length !== 1) {
          return false;
        }

        if (options.replaceLines) {
          // Wholesale replacement, matching the command: a per-line diff would
          // need a merge rule, and any merge rule produces a total nobody typed.
          await tx.delete(saleLines).where(eq(saleLines.saleId, sale.id));
          if (sale.lines.length > 0) {
            await tx.insert(saleLines).values(
              sale.lines.map((line, position) => ({
                id: line.lineId,
                workspaceId: sale.workspaceId,
                saleId: sale.id,
                productId: line.productId,
                productName: line.productName,
                quantityScaled: line.quantity.valueScaled,
                unit: line.quantity.unit,
                unitPriceMinor: line.unitPrice.amountMinor,
                lineTotalMinor: line.lineTotal.amountMinor,
                currency: sale.currency,
                position,
              })),
            );
          }
        }

        return true;
      },

      /**
       * Appends the void record. Nothing here updates the sale — the sale's
       * financial state is read from this table's existence (BR-SALE-013), and
       * `UNIQUE (sale_id)` makes a second void impossible at the storage layer.
       */
      async insertVoid(
        record: SaleVoidState,
        actorId: ActorId,
        commandId: CommandId,
      ): Promise<boolean> {
        // `onConflictDoNothing` plus a row count, exactly as the receipt claim
        // works: the unique index decides the winner and the loser is told, not
        // crashed (BR-SALE-013).
        const inserted = await tx
          .insert(saleVoids)
          .values({
            id: record.id,
            workspaceId: record.workspaceId,
            saleId: record.saleId,
            reasonCode: record.reasonCode,
            reason: record.reason,
            amountMinor: record.amount.amountMinor,
            currency: record.amount.currency,
            transactionTime: fromIso(record.transactionTime),
            recordedAt: fromIso(record.recordedAt),
            actorId,
            commandId,
          })
          .onConflictDoNothing()
          .returning({ id: saleVoids.id });
        return inserted.length === 1;
      },
    },

    payments: {
      async findByIdForUpdate(
        workspaceId: WorkspaceId,
        paymentId: PaymentId,
      ): Promise<PaymentState | null> {
        const rows = await tx
          .select()
          .from(payments)
          .where(and(eq(payments.workspaceId, workspaceId), eq(payments.id, paymentId)))
          .limit(1)
          .for("update");
        const row = rows[0];
        return row === undefined ? null : toPaymentState(row);
      },

      async insert(payment: PaymentState): Promise<void> {
        await tx.insert(payments).values({
          id: payment.id,
          workspaceId: payment.workspaceId,
          customerId: payment.customerId,
          amountMinor: payment.amount.amountMinor,
          currency: payment.amount.currency,
          method: payment.method,
          payerName: payment.payerName,
          note: payment.note,
          status: payment.status,
          reversedAmountMinor: payment.reversedAmount.amountMinor,
          version: payment.version,
          transactionTime: fromIso(payment.transactionTime),
          recordedAt: fromIso(payment.recordedAt),
        });
      },

      /** The only mutable columns on a payment, and `reversed` only ever grows. */
      async update(payment: PaymentState, expectedVersion: number): Promise<boolean> {
        const updated = await tx
          .update(payments)
          .set({
            status: payment.status,
            reversedAmountMinor: payment.reversedAmount.amountMinor,
            version: payment.version,
          })
          .where(
            and(
              eq(payments.workspaceId, payment.workspaceId),
              eq(payments.id, payment.id),
              eq(payments.version, expectedVersion),
            ),
          )
          .returning({ id: payments.id });
        return updated.length === 1;
      },

      async insertReversal(reversal: PaymentReversalState): Promise<void> {
        await tx.insert(paymentReversals).values({
          id: reversal.id,
          workspaceId: reversal.workspaceId,
          paymentId: reversal.paymentId,
          amountMinor: reversal.amount.amountMinor,
          currency: reversal.amount.currency,
          reason: reversal.reason,
          transactionTime: fromIso(reversal.transactionTime),
          recordedAt: fromIso(reversal.recordedAt),
        });
      },
    },

    /** No update, no delete. The port has no such method and neither does this. */
    accountEntries: {
      async append(
        drafts: readonly AccountEntryDraft[],
      ): Promise<readonly CustomerAccountEntryDto[]> {
        if (drafts.length === 0) {
          return [];
        }
        const inserted = await tx
          .insert(customerAccountEntries)
          .values(
            drafts.map((draft) => ({
              id: ids.newId(),
              workspaceId: draft.workspaceId,
              customerId: draft.customerId,
              amountMinor: draft.amount.amountMinor,
              currency: draft.amount.currency,
              sourceType: draft.sourceType,
              sourceId: draft.sourceId,
              reversalOfEntryId: draft.reversalOfEntryId,
              reasonCode: draft.reasonCode,
              reason: draft.reason,
              transactionTime: fromIso(draft.transactionTime),
              recordedAt: fromIso(draft.recordedAt),
              actorId: draft.actorId,
              commandId: draft.commandId,
            })),
          )
          .returning();
        return inserted.map(toAccountEntryDto);
      },

      async listByCustomer(
        workspaceId: WorkspaceId,
        customerId: CustomerId,
      ): Promise<readonly CustomerAccountEntryDto[]> {
        const rows = await tx
          .select()
          .from(customerAccountEntries)
          .where(
            and(
              eq(customerAccountEntries.workspaceId, workspaceId),
              eq(customerAccountEntries.customerId, customerId),
            ),
          )
          .orderBy(
            asc(customerAccountEntries.transactionTime),
            asc(customerAccountEntries.recordedAt),
            asc(customerAccountEntries.id),
          );
        return rows.map(toAccountEntryDto);
      },

      async findBySource(
        workspaceId: WorkspaceId,
        sourceType: AccountEntrySourceType,
        sourceId: string,
      ): Promise<CustomerAccountEntryDto | null> {
        const rows = await tx
          .select()
          .from(customerAccountEntries)
          .where(
            and(
              eq(customerAccountEntries.workspaceId, workspaceId),
              eq(customerAccountEntries.sourceType, sourceType),
              eq(customerAccountEntries.sourceId, sourceId),
            ),
          )
          .limit(1);
        const row = rows[0];
        return row === undefined ? null : toAccountEntryDto(row);
      },
    },

    accountBalances: {
      async get(
        workspaceId: WorkspaceId,
        customerId: CustomerId,
      ): Promise<CustomerAccountBalance | null> {
        const rows = await tx
          .select()
          .from(customerAccountBalances)
          .where(
            and(
              eq(customerAccountBalances.workspaceId, workspaceId),
              eq(customerAccountBalances.customerId, customerId),
            ),
          )
          .limit(1);
        const row = rows[0];
        return row === undefined ? null : toCustomerAccountBalance(row);
      },

      /** Upsert: the projection is disposable and always safe to overwrite. */
      async save(balance: CustomerAccountBalance): Promise<void> {
        await tx
          .insert(customerAccountBalances)
          .values({
            workspaceId: balance.workspaceId,
            customerId: balance.customerId,
            balanceMinor: balance.balance.amountMinor,
            currency: balance.balance.currency,
            entryCount: balance.entryCount,
            lastEntryTransactionTime: fromIsoOrNull(balance.lastEntryTransactionTime),
            updatedAt: fromIso(balance.updatedAt),
          })
          .onConflictDoUpdate({
            target: [customerAccountBalances.workspaceId, customerAccountBalances.customerId],
            set: {
              balanceMinor: balance.balance.amountMinor,
              entryCount: balance.entryCount,
              lastEntryTransactionTime: fromIsoOrNull(balance.lastEntryTransactionTime),
              updatedAt: fromIso(balance.updatedAt),
            },
          });
      },
    },

    audit: {
      async append(record: {
        workspaceId: WorkspaceId;
        actorId: ActorId;
        commandId: CommandId;
        aggregateType: AuditAggregateType;
        aggregateId: string;
        action: AuditAction;
        transactionTime: IsoInstant;
        recordedAt: IsoInstant;
        before: Record<string, unknown> | null;
        after: Record<string, unknown> | null;
        reason: string | null;
      }): Promise<void> {
        await tx.insert(auditLogs).values({
          id: ids.newId(),
          workspaceId: record.workspaceId,
          commandId: record.commandId,
          actorId: record.actorId,
          aggregateType: record.aggregateType,
          aggregateId: record.aggregateId,
          action: record.action,
          transactionTime: fromIso(record.transactionTime),
          recordedAt: fromIso(record.recordedAt),
          before: record.before,
          after: record.after,
          reason: record.reason,
          rejectionCode: null,
        });
      },
    },

    receipts: {
      async find(workspaceId: WorkspaceId, idempotencyKey: IdempotencyKey) {
        const rows = await tx
          .select()
          .from(commandReceipts)
          .where(
            and(
              eq(commandReceipts.workspaceId, workspaceId),
              eq(commandReceipts.idempotencyKey, idempotencyKey),
            ),
          )
          .limit(1);
        const row = rows[0];
        return row === undefined ? null : toReceipt(row);
      },

      async findByCommandId(workspaceId: WorkspaceId, commandId: CommandId) {
        const rows = await tx
          .select()
          .from(commandReceipts)
          .where(
            and(
              eq(commandReceipts.workspaceId, workspaceId),
              eq(commandReceipts.commandId, commandId),
            ),
          )
          .limit(1);
        const row = rows[0];
        return row === undefined ? null : toReceipt(row);
      },

      /**
       * `onConflictDoNothing` plus a row count is the whole concurrency story:
       * the unique index decides the winner, and the loser is told the command is
       * already in progress rather than running it twice (ADR-0008).
       */
      async claim(receipt: {
        commandId: CommandId;
        workspaceId: WorkspaceId;
        idempotencyKey: IdempotencyKey;
        commandType: string;
        payloadHash: string;
        status: "in_progress" | "completed";
        result: unknown;
        recordedAt: IsoInstant;
      }): Promise<boolean> {
        const inserted = await tx
          .insert(commandReceipts)
          .values({
            commandId: receipt.commandId,
            workspaceId: receipt.workspaceId,
            idempotencyKey: receipt.idempotencyKey,
            commandType: receipt.commandType,
            payloadHash: receipt.payloadHash,
            status: receipt.status,
            result: receipt.result,
            recordedAt: fromIso(receipt.recordedAt),
          })
          .onConflictDoNothing()
          .returning({ commandId: commandReceipts.commandId });
        return inserted.length === 1;
      },

      async complete(
        workspaceId: WorkspaceId,
        idempotencyKey: IdempotencyKey,
        result: unknown,
      ): Promise<void> {
        await tx
          .update(commandReceipts)
          .set({ status: "completed", result })
          .where(
            and(
              eq(commandReceipts.workspaceId, workspaceId),
              eq(commandReceipts.idempotencyKey, idempotencyKey),
            ),
          );
      },
    },
  };
}

function toReceipt(row: {
  commandId: string;
  workspaceId: string;
  idempotencyKey: string;
  commandType: string;
  payloadHash: string;
  status: "in_progress" | "completed";
  result: unknown;
  recordedAt: Date;
}) {
  return {
    commandId: row.commandId as CommandId,
    workspaceId: row.workspaceId as WorkspaceId,
    idempotencyKey: row.idempotencyKey as IdempotencyKey,
    commandType: row.commandType,
    payloadHash: row.payloadHash,
    status: row.status,
    result: row.result,
    recordedAt: toIso(row.recordedAt),
  };
}

export type { CurrencyCode };

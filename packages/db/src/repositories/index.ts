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
  WorkspaceId,
  WorkspaceRole,
} from "@vuarau/domain-contracts";
import type {
  CustomerAccountBalance,
  CustomerState,
  AccountEntryDraft,
  SaleState,
  PaymentReversalState,
  PaymentState,
  ProductState,
  SaleVoidState,
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
  workspaceMemberships,
  workspaces,
} from "../schema/index.ts";
import {
  fromIso,
  fromIsoOrNull,
  toCustomerAccountBalance,
  toCustomerState,
  toIso,
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

    operations: {
      async restoreBackup(
        workspaceId: WorkspaceId,
        payload: {
          readonly workspace: Record<string, unknown>;
          readonly memberships: readonly Record<string, unknown>[];
          readonly customers: readonly Record<string, unknown>[];
          readonly products: readonly Record<string, unknown>[];
          readonly sales: readonly Record<string, unknown>[];
          readonly saleLines: readonly Record<string, unknown>[];
          readonly saleVoids: readonly Record<string, unknown>[];
          readonly payments: readonly Record<string, unknown>[];
          readonly paymentReversals: readonly Record<string, unknown>[];
          readonly accountEntries: readonly Record<string, unknown>[];
          readonly audit: readonly Record<string, unknown>[];
          readonly commandReceipts: readonly Record<string, unknown>[];
        },
      ) {
        const [customerRows, productRows, saleRows, paymentRows, entryRows] = await Promise.all([
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
        ]);
        if (
          [customerRows, productRows, saleRows, paymentRows, entryRows].some(
            (rows) => rows.length > 0,
          )
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
        if (payload.commandReceipts.length > 0) {
          await tx.insert(commandReceipts).values(
            payload.commandReceipts.map((raw) => {
              const row = scoped(raw);
              return { ...row, recordedAt: date(row["recordedAt"]) };
            }) as unknown as (typeof commandReceipts.$inferInsert)[],
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

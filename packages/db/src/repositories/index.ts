import { and, asc, eq } from "drizzle-orm";
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
  WorkspaceId,
} from "@vuarau/domain-contracts";
import type {
  CustomerAccountBalance,
  CustomerState,
  AccountEntryDraft,
  SaleState,
  PaymentReversalState,
  PaymentState,
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
  workspaceMemberships,
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
 * Every method takes `workspaceId` as a required argument. There is no method
 * that can read across workspaces (BR-CUSTOMER-002).
 */

// The concrete transaction type Drizzle hands a callback. Kept loose here so the
// repositories work with both a transaction and a bare connection.
type Tx = PgTransaction<never, never, never>;

export type IdMinter = { newId(): string };

export function createRepositories(tx: Tx, ids: IdMinter) {
  return {
    workspaces: {
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

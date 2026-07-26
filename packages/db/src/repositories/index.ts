import { and, asc, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type {
  ActorId,
  AuditAction,
  AuditAggregateType,
  CommandId,
  CurrencyCode,
  CustomerId,
  DebtLedgerEntryDto,
  IdempotencyKey,
  IsoInstant,
  LedgerSourceType,
  OrderId,
  PaymentId,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import type {
  CustomerDebtSummary,
  CustomerState,
  LedgerEntryDraft,
  OrderState,
  PaymentReversalState,
  PaymentState,
} from "@vuarau/domain-kernel";
import {
  actors,
  auditLogs,
  commandReceipts,
  customerDebtSummaries,
  customers,
  debtLedgerEntries,
  orderLines,
  orders,
  paymentReversals,
  payments,
  workspaceMemberships,
} from "../schema/index.ts";
import {
  fromIso,
  fromIsoOrNull,
  toCustomerDebtSummary,
  toCustomerState,
  toIso,
  toLedgerEntryDto,
  toOrderState,
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

    orders: {
      async findByIdForUpdate(
        workspaceId: WorkspaceId,
        orderId: OrderId,
      ): Promise<OrderState | null> {
        // Row lock held for the rest of the transaction (ADR-0009). Lines are not
        // locked separately: they are only ever written with their order.
        const rows = await tx
          .select()
          .from(orders)
          .where(and(eq(orders.workspaceId, workspaceId), eq(orders.id, orderId)))
          .limit(1)
          .for("update");
        const row = rows[0];
        if (row === undefined) {
          return null;
        }

        const lineRows = await tx
          .select()
          .from(orderLines)
          .where(and(eq(orderLines.workspaceId, workspaceId), eq(orderLines.orderId, orderId)))
          .orderBy(asc(orderLines.position));

        return toOrderState(row, lineRows);
      },

      async insert(order: OrderState): Promise<void> {
        await tx.insert(orders).values({
          id: order.id,
          workspaceId: order.workspaceId,
          customerId: order.customerId,
          status: order.status,
          currency: order.currency,
          totalAmountMinor: order.totalAmount.amountMinor,
          note: order.note,
          version: order.version,
          transactionTime: fromIso(order.transactionTime),
          recordedAt: fromIso(order.recordedAt),
          confirmedAt: fromIsoOrNull(order.confirmedAt),
          cancelledAt: fromIsoOrNull(order.cancelledAt),
        });

        if (order.lines.length > 0) {
          await tx.insert(orderLines).values(
            order.lines.map((line, position) => ({
              id: line.lineId,
              workspaceId: order.workspaceId,
              orderId: order.id,
              productId: line.productId,
              productName: line.productName,
              quantityScaled: line.quantity.valueScaled,
              unit: line.quantity.unit,
              unitPriceMinor: line.unitPrice.amountMinor,
              lineTotalMinor: line.lineTotal.amountMinor,
              currency: order.currency,
              position,
            })),
          );
        }
      },

      /**
       * Conditional on the version, so a concurrent writer that slipped between
       * the read and the write loses instead of overwriting (BR-SALE-006).
       * Order lines are not rewritten here — confirmation does not change them.
       */
      async update(order: OrderState, expectedVersion: number): Promise<boolean> {
        const updated = await tx
          .update(orders)
          .set({
            status: order.status,
            totalAmountMinor: order.totalAmount.amountMinor,
            note: order.note,
            version: order.version,
            confirmedAt: fromIsoOrNull(order.confirmedAt),
            cancelledAt: fromIsoOrNull(order.cancelledAt),
          })
          .where(
            and(
              eq(orders.workspaceId, order.workspaceId),
              eq(orders.id, order.id),
              eq(orders.version, expectedVersion),
            ),
          )
          .returning({ id: orders.id });
        return updated.length === 1;
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
    ledger: {
      async append(drafts: readonly LedgerEntryDraft[]): Promise<readonly DebtLedgerEntryDto[]> {
        if (drafts.length === 0) {
          return [];
        }
        const inserted = await tx
          .insert(debtLedgerEntries)
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
        return inserted.map(toLedgerEntryDto);
      },

      async listByCustomer(
        workspaceId: WorkspaceId,
        customerId: CustomerId,
      ): Promise<readonly DebtLedgerEntryDto[]> {
        const rows = await tx
          .select()
          .from(debtLedgerEntries)
          .where(
            and(
              eq(debtLedgerEntries.workspaceId, workspaceId),
              eq(debtLedgerEntries.customerId, customerId),
            ),
          )
          .orderBy(asc(debtLedgerEntries.transactionTime), asc(debtLedgerEntries.recordedAt));
        return rows.map(toLedgerEntryDto);
      },

      async findBySource(
        workspaceId: WorkspaceId,
        sourceType: LedgerSourceType,
        sourceId: string,
      ): Promise<DebtLedgerEntryDto | null> {
        const rows = await tx
          .select()
          .from(debtLedgerEntries)
          .where(
            and(
              eq(debtLedgerEntries.workspaceId, workspaceId),
              eq(debtLedgerEntries.sourceType, sourceType),
              eq(debtLedgerEntries.sourceId, sourceId),
            ),
          )
          .limit(1);
        const row = rows[0];
        return row === undefined ? null : toLedgerEntryDto(row);
      },
    },

    debtSummaries: {
      async get(
        workspaceId: WorkspaceId,
        customerId: CustomerId,
      ): Promise<CustomerDebtSummary | null> {
        const rows = await tx
          .select()
          .from(customerDebtSummaries)
          .where(
            and(
              eq(customerDebtSummaries.workspaceId, workspaceId),
              eq(customerDebtSummaries.customerId, customerId),
            ),
          )
          .limit(1);
        const row = rows[0];
        return row === undefined ? null : toCustomerDebtSummary(row);
      },

      /** Upsert: the projection is disposable and always safe to overwrite. */
      async save(summary: CustomerDebtSummary): Promise<void> {
        await tx
          .insert(customerDebtSummaries)
          .values({
            workspaceId: summary.workspaceId,
            customerId: summary.customerId,
            balanceMinor: summary.balance.amountMinor,
            currency: summary.balance.currency,
            entryCount: summary.entryCount,
            lastEntryTransactionTime: fromIsoOrNull(summary.lastEntryTransactionTime),
            updatedAt: fromIso(summary.updatedAt),
          })
          .onConflictDoUpdate({
            target: [customerDebtSummaries.workspaceId, customerDebtSummaries.customerId],
            set: {
              balanceMinor: summary.balance.amountMinor,
              entryCount: summary.entryCount,
              lastEntryTransactionTime: fromIsoOrNull(summary.lastEntryTransactionTime),
              updatedAt: fromIso(summary.updatedAt),
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

import { and, asc, eq, sql } from "drizzle-orm";
import type {
  ActorId,
  CommandId,
  IsoInstant,
  SupplierId,
  SupplierPaymentId,
  SupplierAccountEntryDto,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import type {
  SupplierState,
  SupplierPaymentState,
  SupplierPaymentReversalState,
} from "@vuarau/domain-kernel";
import {
  suppliers,
  supplierPayments,
  supplierPaymentReversals,
  supplierAccountEntries,
  supplierAccountBalances,
} from "../../schema/index.ts";
import { fromIso, fromIsoOrNull, toIso, toIsoOrNull } from "../row-mappers.ts";
import { toSupplierState, toSupplierPaymentState } from "../shared/write-helpers.ts";
import type { Tx, IdMinter } from "../shared/types.ts";

export const createSupplierWriteRepositories = (tx: Tx, ids: IdMinter) => ({
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
        cashAccountId: payment.cashAccountId ?? null,
        note: payment.note,
        evidenceReferences: [...payment.evidenceReferences],
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
    async insertReversal(reversal: SupplierPaymentReversalState) {
      await tx.insert(supplierPaymentReversals).values({
        id: reversal.id,
        workspaceId: reversal.workspaceId,
        supplierPaymentId: reversal.supplierPaymentId,
        amountMinor: reversal.amount.amountMinor,
        currency: reversal.amount.currency,
        reason: reversal.reason,
        evidenceReferences: [...reversal.evidenceReferences],
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
});

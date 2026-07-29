import { and, asc, eq } from "drizzle-orm";
import type {
  CustomerId,
  CustomerAccountEntryDto,
  AccountEntrySourceType,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import type { CustomerAccountBalance, AccountEntryDraft } from "@vuarau/domain-kernel";
import { customerAccountBalances, customerAccountEntries } from "../../schema/index.ts";
import {
  fromIso,
  fromIsoOrNull,
  toCustomerAccountBalance,
  toAccountEntryDto,
} from "../row-mappers.ts";
import type { Tx, IdMinter } from "../shared/types.ts";

export const createAccountWriteRepositories = (tx: Tx, ids: IdMinter) => ({
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
});

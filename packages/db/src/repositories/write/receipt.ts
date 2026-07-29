import { and, eq } from "drizzle-orm";
import type { CommandId, IdempotencyKey, IsoInstant, WorkspaceId } from "@vuarau/domain-contracts";
import { commandReceipts } from "../../schema/index.ts";
import { fromIso } from "../row-mappers.ts";
import { toReceipt } from "../shared/write-helpers.ts";
import type { Tx } from "../shared/types.ts";

export const createReceiptWriteRepositories = (tx: Tx) => ({
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
});

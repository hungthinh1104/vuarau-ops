import { and, asc, eq, gt, sql } from "drizzle-orm";
import {
  workspaceChangeTopicSchema,
  type CommandId,
  type IdempotencyKey,
  type IsoInstant,
  type WorkspaceId,
} from "@vuarau/domain-contracts";
import { commandReceipts, workspaceChangeFeed } from "../../schema/index.ts";
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

    /** The unique index remains the concurrency boundary for the claim. */
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
          revision: null,
          topics: null,
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
      change: { readonly topics: readonly string[] } = { topics: ["workspace"] },
    ) {
      // Business execution is not serialized. Only this short end-of-command
      // critical section allocates a monotonic position for the durable feed.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`workspace-revision:${workspaceId}`}, 0))`,
      );
      const receiptRows = await tx
        .select({
          commandId: commandReceipts.commandId,
          commandType: commandReceipts.commandType,
          recordedAt: commandReceipts.recordedAt,
        })
        .from(commandReceipts)
        .where(
          and(
            eq(commandReceipts.workspaceId, workspaceId),
            eq(commandReceipts.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      const receipt = receiptRows[0];
      if (receipt === undefined) throw new Error("Cannot complete an unknown command receipt.");
      const latestRows = await tx
        .select({ latest: sql<number>`coalesce(max(${workspaceChangeFeed.revision}), 0)` })
        .from(workspaceChangeFeed)
        .where(eq(workspaceChangeFeed.workspaceId, workspaceId));
      const latest = latestRows[0]?.latest ?? 0;
      const revision = latest + 1;
      await tx
        .update(commandReceipts)
        .set({ status: "completed", result, revision, topics: change.topics })
        .where(
          and(
            eq(commandReceipts.workspaceId, workspaceId),
            eq(commandReceipts.idempotencyKey, idempotencyKey),
          ),
        );
      await tx.insert(workspaceChangeFeed).values({
        commandId: receipt.commandId,
        workspaceId,
        revision,
        commandType: receipt.commandType,
        topics: change.topics,
        recordedAt: receipt.recordedAt,
      });
      return { revision: String(revision), topics: change.topics };
    },

    async changesSince(workspaceId: WorkspaceId, revision: string, limit: number) {
      const since = Number(revision);
      if (!Number.isSafeInteger(since) || since < 0) {
        throw new Error("Invalid workspace change revision.");
      }
      const rows = await tx
        .select()
        .from(workspaceChangeFeed)
        .where(
          and(
            eq(workspaceChangeFeed.workspaceId, workspaceId),
            gt(workspaceChangeFeed.revision, since),
          ),
        )
        .orderBy(asc(workspaceChangeFeed.revision))
        .limit(Math.min(Math.max(limit, 1), 200));
      const latestRows = await tx
        .select({ latest: sql<number>`coalesce(max(${workspaceChangeFeed.revision}), 0)` })
        .from(workspaceChangeFeed)
        .where(eq(workspaceChangeFeed.workspaceId, workspaceId));
      const latest = latestRows[0]?.latest ?? 0;
      return {
        changes: rows.map((row) => {
          const topics = workspaceChangeTopicSchema.array().safeParse(row.topics);
          if (!topics.success) throw new Error("Stored workspace change topics are invalid.");
          return {
            revision: String(row.revision),
            commandType: row.commandType,
            topics: topics.data,
            recordedAt: row.recordedAt.toISOString(),
          };
        }),
        nextRevision: String(latest),
      };
    },
  },
});

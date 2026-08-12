import { and, eq, isNotNull } from "drizzle-orm";
import { workspaceChangeTopicSchema, type WorkspaceId } from "@vuarau/domain-contracts";
import { commandReceipts, workspaceChangeFeed } from "../../schema/index.ts";
import type { Tx } from "../shared/types.ts";

export async function restoreWorkspaceChangeFeed(
  tx: Tx,
  workspaceId: WorkspaceId,
): Promise<{ readonly kind: "integrity_error"; readonly reason: string } | null> {
  const rows = await tx
    .select()
    .from(commandReceipts)
    .where(
      and(
        eq(commandReceipts.workspaceId, workspaceId),
        eq(commandReceipts.status, "completed"),
        isNotNull(commandReceipts.revision),
      ),
    );
  const feedRows = [];
  for (const row of rows) {
    const topics = workspaceChangeTopicSchema.array().safeParse(row.topics);
    if (!topics.success) {
      return {
        kind: "integrity_error",
        reason: "completed receipt has invalid durable change topics",
      };
    }
    feedRows.push({
      commandId: row.commandId,
      workspaceId,
      revision: row.revision!,
      commandType: row.commandType,
      topics: topics.data,
      recordedAt: row.recordedAt,
    });
  }
  if (feedRows.length > 0) await tx.insert(workspaceChangeFeed).values(feedRows);
  return null;
}

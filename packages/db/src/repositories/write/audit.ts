import type {
  ActorId,
  AuditAction,
  AuditAggregateType,
  CommandId,
  IsoInstant,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import { auditLogs } from "../../schema/index.ts";
import { fromIso } from "../row-mappers.ts";
import type { Tx, IdMinter } from "../shared/types.ts";

export const createAuditWriteRepositories = (tx: Tx, ids: IdMinter) => ({
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
});

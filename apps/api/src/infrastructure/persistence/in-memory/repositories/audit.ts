import type { Repositories } from "../../ports.ts";
import type { AuditRecordDto } from "@vuarau/domain-contracts";
import { after, before } from "../store.ts";
import type { IdGenerator } from "../../../clock.ts";
import type { Store } from "../store.ts";

export const createAuditRepositories = (
  store: Store,
  ids: IdGenerator,
): Pick<Repositories, "audit"> => ({
  audit: {
    append: async (record) => {
      store.audit.push({
        id: ids.newId() as AuditRecordDto["id"],
        workspaceId: record.workspaceId,
        commandId: record.commandId,
        actorId: record.actorId,
        aggregateType: record.aggregateType,
        aggregateId: record.aggregateId,
        action: record.action,
        transactionTime: record.transactionTime,
        recordedAt: record.recordedAt,
        before: record.before,
        after: record.after,
        reason: record.reason,
        rejectionCode: null,
      });
    },
  },
});

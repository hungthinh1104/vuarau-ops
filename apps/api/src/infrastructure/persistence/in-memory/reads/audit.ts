import type { Repositories } from "../../ports.ts";
import type { SaleId } from "@vuarau/domain-contracts";
import { key, descendingBy, before, takePage } from "../store.ts";
import type { Store } from "../store.ts";

export const createAuditReads = (store: Store): Pick<Repositories, "auditReads"> => ({
  auditReads: {
    timeline: async ({ workspaceId, aggregateType, aggregateId, actorId, from, to, page }) => {
      const matched = store.audit
        .filter((record) => record.workspaceId === workspaceId)
        .filter((record) => aggregateType === null || record.aggregateType === aggregateType)
        .filter((record) => aggregateId === null || record.aggregateId === aggregateId)
        .filter((record) => actorId === null || record.actorId === actorId)
        .filter((record) => from === null || record.recordedAt >= from)
        .filter((record) => to === null || record.recordedAt <= to)
        .sort(
          descendingBy(
            (record) => record.recordedAt,
            (record) => record.id,
          ),
        )
        .filter((record) =>
          page.after === null
            ? true
            : before([record.recordedAt, record.id], [page.after.sortValue, page.after.id]),
        )
        .map((record) => {
          const sale =
            record.aggregateType === "sale"
              ? store.sales.get(key(workspaceId, record.aggregateId))
              : undefined;
          return {
            id: record.id,
            workspaceId: record.workspaceId,
            actorId: record.actorId,
            actorDisplayName: store.actorNames.get(record.actorId) ?? "",
            commandId: record.commandId,
            action: record.action,
            aggregateType: record.aggregateType,
            aggregateId: record.aggregateId,
            transactionTime: record.transactionTime,
            recordedAt: record.recordedAt,
            before: record.before,
            after: record.after,
            reason: record.reason,
            rejectionCode: record.rejectionCode,
            correction:
              record.action === "sale.voided"
                ? {
                    relation: "voids_sale" as const,
                    targetSaleId: record.aggregateId as SaleId,
                  }
                : sale?.replacesSaleId != null
                  ? {
                      relation: "replaces_sale" as const,
                      targetSaleId: sale.replacesSaleId,
                    }
                  : null,
          };
        });

      return takePage(matched, page, (row) => ({
        sortValue: row.recordedAt,
        id: row.id,
      }));
    },
  },
});

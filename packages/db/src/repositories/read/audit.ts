import type { SQL } from "drizzle-orm";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { actors, auditLogs, sales } from "../../schema/index.ts";
import { fromIso, toIso } from "../row-mappers.ts";
import type { Page } from "../shared/read-helpers.ts";
import { fetchLimit, paged, auditCorrection } from "../shared/read-helpers.ts";
import type { Tx } from "../shared/types.ts";

export const createAuditReadRepositories = (tx: Tx) => ({
  auditReads: {
    async timeline(args: {
      workspaceId: string;
      aggregateType: "customer" | "sale" | "payment" | "debt" | null;
      aggregateId: string | null;
      actorId: string | null;
      from: string | null;
      to: string | null;
      page: Page;
    }) {
      const { workspaceId, aggregateType, aggregateId, actorId, from, to, page } = args;

      const filters: SQL[] = [eq(auditLogs.workspaceId, workspaceId)];
      if (aggregateType !== null) filters.push(eq(auditLogs.aggregateType, aggregateType));
      if (aggregateId !== null) filters.push(eq(auditLogs.aggregateId, aggregateId));
      if (actorId !== null) filters.push(eq(auditLogs.actorId, actorId));
      if (from !== null) filters.push(gte(auditLogs.recordedAt, fromIso(from as never)));
      if (to !== null) filters.push(lte(auditLogs.recordedAt, fromIso(to as never)));
      if (page.after !== null) {
        filters.push(
          sql`(${auditLogs.recordedAt}, ${auditLogs.id}) < (${page.after.sortValue}::timestamptz, ${page.after.id}::uuid)`,
        );
      }

      // Ordered by *recording* time, not business time: an audit trail answers
      // "what happened in what order, as far as this system knew", and a
      // back-dated entry belongs where it was written down, not where it claims
      // to belong (docs/07-data/time-semantics.md).
      const rows = await tx
        .select({
          id: auditLogs.id,
          workspaceId: auditLogs.workspaceId,
          actorId: auditLogs.actorId,
          actorDisplayName: actors.displayName,
          commandId: auditLogs.commandId,
          action: auditLogs.action,
          aggregateType: auditLogs.aggregateType,
          aggregateId: auditLogs.aggregateId,
          transactionTime: auditLogs.transactionTime,
          recordedAt: auditLogs.recordedAt,
          before: auditLogs.before,
          after: auditLogs.after,
          reason: auditLogs.reason,
          rejectionCode: auditLogs.rejectionCode,
          replacesSaleId: sales.replacesSaleId,
        })
        .from(auditLogs)
        .innerJoin(actors, eq(actors.id, auditLogs.actorId))
        // Only meaningful for sale records; null everywhere else, which is what
        // makes `correction` null for a payment or an adjustment.
        .leftJoin(sales, eq(sales.id, auditLogs.aggregateId))
        .where(and(...filters))
        .orderBy(desc(auditLogs.recordedAt), desc(auditLogs.id))
        .limit(fetchLimit(page));

      return paged(
        rows.map((row) => ({
          id: row.id,
          workspaceId: row.workspaceId,
          actorId: row.actorId,
          actorDisplayName: row.actorDisplayName,
          commandId: row.commandId,
          action: row.action,
          aggregateType: row.aggregateType,
          aggregateId: row.aggregateId,
          transactionTime: toIso(row.transactionTime),
          recordedAt: toIso(row.recordedAt),
          before: row.before as Record<string, unknown> | null,
          after: row.after as Record<string, unknown> | null,
          reason: row.reason,
          rejectionCode: row.rejectionCode,
          correction: auditCorrection(row),
        })),
        page,
        (row) => ({ sortValue: row.recordedAt, id: row.id }),
      );
    },
  },
});

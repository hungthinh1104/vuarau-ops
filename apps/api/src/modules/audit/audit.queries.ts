import type { AuditTimelineEntryDto, AuditTimelineInput, Page } from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery, toPage, toPageQuery } from "../shared/read-pipeline.ts";

/**
 * UC-AUDIT-001 — who did what, in what order, and how one action corrected
 * another.
 *
 * Ordered by **recording** time rather than business time. An audit trail answers
 * "in what order did this system learn things", and a back-dated sale belongs
 * where it was written down, not where it claims to belong
 * (docs/07-data/time-semantics.md). The account timeline is the one ordered by
 * business time, because aging is a question about when money moved.
 *
 * `audit.read` is held by `owner` and `accountant`: this is the record that
 * answers for the books.
 */
export function getAuditTimeline(
  ctx: CommandContext,
  input: AuditTimelineInput,
): Promise<DomainResult<Page<AuditTimelineEntryDto>>> {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "audit.read",
    execute: async ({ repos }) => {
      const result = await repos.auditReads.timeline({
        workspaceId: input.workspaceId,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        actorId: input.actorId,
        from: input.from,
        to: input.to,
        page: toPageQuery(input),
      });
      return toPage(result, (row) => row);
    },
  });
}

import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import type {
  CashStatementMatchDto,
  OperationalCloseDto,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import {
  cashStatementMatches,
  cashStatementMatchReversals,
  operationalCloses,
  operationalCloseReopens,
} from "../../schema/index.ts";
import { toCashStatementMatchDto, toOperationalCloseDto } from "../shared/close-mappers.ts";
import { fetchLimit, paged, type Page } from "../shared/read-helpers.ts";
import type { Tx } from "../shared/types.ts";

export const createCloseReadRepositories = (tx: Tx) => ({
  operationalCloseReads: {
    async get(workspaceId: WorkspaceId, operationalCloseId: OperationalCloseDto["id"]) {
      const row = (
        await tx
          .select()
          .from(operationalCloses)
          .where(
            and(
              eq(operationalCloses.workspaceId, workspaceId),
              eq(operationalCloses.id, operationalCloseId),
            ),
          )
          .limit(1)
      )[0];
      if (row === undefined) return null;
      const reopen = (
        await tx
          .select()
          .from(operationalCloseReopens)
          .where(
            and(
              eq(operationalCloseReopens.workspaceId, workspaceId),
              eq(operationalCloseReopens.operationalCloseId, operationalCloseId),
            ),
          )
          .limit(1)
      )[0];
      return toOperationalCloseDto(row, reopen);
    },
    async list(args: {
      workspaceId: WorkspaceId;
      fromBusinessDate: string | null;
      toBusinessDate: string | null;
      page: Page;
    }) {
      const filters: SQL[] = [eq(operationalCloses.workspaceId, args.workspaceId)];
      if (args.fromBusinessDate !== null)
        filters.push(gte(operationalCloses.businessDate, args.fromBusinessDate));
      if (args.toBusinessDate !== null)
        filters.push(lte(operationalCloses.businessDate, args.toBusinessDate));
      if (args.page.after !== null) {
        filters.push(
          sql`(${operationalCloses.businessDate}, ${operationalCloses.id}) < (${args.page.after.sortValue}, ${args.page.after.id}::uuid)`,
        );
      }
      const rows = await tx
        .select()
        .from(operationalCloses)
        .where(and(...filters))
        .orderBy(desc(operationalCloses.businessDate), desc(operationalCloses.id))
        .limit(fetchLimit(args.page));
      const result = await Promise.all(
        rows.map(async (row) => {
          const reopen = (
            await tx
              .select()
              .from(operationalCloseReopens)
              .where(
                and(
                  eq(operationalCloseReopens.workspaceId, args.workspaceId),
                  eq(operationalCloseReopens.operationalCloseId, row.id),
                ),
              )
              .limit(1)
          )[0];
          return toOperationalCloseDto(row, reopen);
        }),
      );
      return paged(result, args.page, (close) => ({ sortValue: close.businessDate, id: close.id }));
    },
  },
  cashStatementMatchReads: {
    async get(workspaceId: WorkspaceId, cashStatementMatchId: CashStatementMatchDto["id"]) {
      const row = (
        await tx
          .select()
          .from(cashStatementMatches)
          .where(
            and(
              eq(cashStatementMatches.workspaceId, workspaceId),
              eq(cashStatementMatches.id, cashStatementMatchId),
            ),
          )
          .limit(1)
      )[0];
      if (row === undefined) return null;
      const reversal = (
        await tx
          .select()
          .from(cashStatementMatchReversals)
          .where(
            and(
              eq(cashStatementMatchReversals.workspaceId, workspaceId),
              eq(cashStatementMatchReversals.cashStatementMatchId, cashStatementMatchId),
            ),
          )
          .limit(1)
      )[0];
      return toCashStatementMatchDto(row, reversal);
    },
    async list(args: {
      workspaceId: WorkspaceId;
      cashAccountId: CashStatementMatchDto["cashAccountId"] | null;
      sourceType: CashStatementMatchDto["sourceType"] | null;
      page: Page;
    }) {
      const filters: SQL[] = [eq(cashStatementMatches.workspaceId, args.workspaceId)];
      if (args.cashAccountId !== null)
        filters.push(eq(cashStatementMatches.cashAccountId, args.cashAccountId));
      if (args.sourceType !== null)
        filters.push(eq(cashStatementMatches.sourceType, args.sourceType));
      if (args.page.after !== null) {
        filters.push(
          sql`(${cashStatementMatches.statementAt}, ${cashStatementMatches.id}) < (${args.page.after.sortValue}::timestamptz, ${args.page.after.id}::uuid)`,
        );
      }
      const rows = await tx
        .select()
        .from(cashStatementMatches)
        .where(and(...filters))
        .orderBy(desc(cashStatementMatches.statementAt), desc(cashStatementMatches.id))
        .limit(fetchLimit(args.page));
      const result = await Promise.all(
        rows.map(async (row) => {
          const reversal = (
            await tx
              .select()
              .from(cashStatementMatchReversals)
              .where(
                and(
                  eq(cashStatementMatchReversals.workspaceId, args.workspaceId),
                  eq(cashStatementMatchReversals.cashStatementMatchId, row.id),
                ),
              )
              .limit(1)
          )[0];
          return toCashStatementMatchDto(row, reversal);
        }),
      );
      return paged(result, args.page, (match) => ({ sortValue: match.statementAt, id: match.id }));
    },
  },
});

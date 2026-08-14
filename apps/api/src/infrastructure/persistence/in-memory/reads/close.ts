import type { Repositories } from "../../ports.ts";
import { after, before, descendingBy, takePage } from "../store.ts";
import type { Store } from "../store.ts";

export const createCloseReads = (
  store: Store,
): Pick<
  Repositories,
  | "operationalCloseReads"
  | "operationalCloseExceptionAcknowledgementReads"
  | "cashStatementMatchReads"
> => ({
  operationalCloseReads: {
    get: async (workspaceId, operationalCloseId) =>
      store.operationalCloses.get(`${workspaceId}:${operationalCloseId}`) ?? null,
    list: async ({ workspaceId, fromBusinessDate, toBusinessDate, page }) => {
      const rows = [...store.operationalCloses.values()]
        .filter((close) => close.workspaceId === workspaceId)
        .filter((close) => fromBusinessDate === null || close.businessDate >= fromBusinessDate)
        .filter((close) => toBusinessDate === null || close.businessDate <= toBusinessDate)
        .sort(
          descendingBy(
            (close) => close.businessDate,
            (close) => close.id,
          ),
        )
        .filter((close) =>
          page.after === null
            ? true
            : before([close.businessDate, close.id], [page.after.sortValue, page.after.id]),
        );
      return takePage(rows, page, (close) => ({ sortValue: close.businessDate, id: close.id }));
    },
  },
  operationalCloseExceptionAcknowledgementReads: {
    listForBusinessDate: async (workspaceId, businessDate) =>
      [...store.operationalCloseExceptionAcknowledgements.values()]
        .filter(
          (acknowledgement) =>
            acknowledgement.workspaceId === workspaceId &&
            acknowledgement.businessDate === businessDate,
        )
        .sort((left, right) =>
          left.recordedAt === right.recordedAt
            ? left.id.localeCompare(right.id)
            : left.recordedAt.localeCompare(right.recordedAt),
        ),
  },
  cashStatementMatchReads: {
    get: async (workspaceId, cashStatementMatchId) =>
      store.cashStatementMatches.get(`${workspaceId}:${cashStatementMatchId}`) ?? null,
    list: async ({ workspaceId, cashAccountId, sourceType, page }) => {
      const rows = [...store.cashStatementMatches.values()]
        .filter((match) => match.workspaceId === workspaceId)
        .filter((match) => cashAccountId === null || match.cashAccountId === cashAccountId)
        .filter((match) => sourceType === null || match.sourceType === sourceType)
        .sort(
          descendingBy(
            (match) => match.statementAt,
            (match) => match.id,
          ),
        )
        .filter((match) =>
          page.after === null
            ? true
            : after([match.statementAt, match.id], [page.after.sortValue, page.after.id]),
        );
      return takePage(rows, page, (match) => ({ sortValue: match.statementAt, id: match.id }));
    },
  },
});

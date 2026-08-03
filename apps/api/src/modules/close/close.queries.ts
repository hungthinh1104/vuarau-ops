import type {
  CashStatementMatchGetInput,
  CashStatementMatchListInput,
  OperationalCloseGetInput,
  OperationalCloseListInput,
} from "@vuarau/domain-contracts";
import { runQuery, toPage, toPageQuery } from "../shared/read-pipeline.ts";
import type { CommandContext } from "../shared/command-pipeline.ts";

export function getOperationalClose(ctx: CommandContext, input: OperationalCloseGetInput) {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "operations.close",
    execute: async ({ repos }) =>
      repos.operationalCloseReads.get(input.workspaceId, input.operationalCloseId),
  });
}

export function listOperationalCloses(ctx: CommandContext, input: OperationalCloseListInput) {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "operations.close",
    execute: async ({ repos }) =>
      toPage(
        await repos.operationalCloseReads.list({
          workspaceId: input.workspaceId,
          fromBusinessDate: input.fromBusinessDate,
          toBusinessDate: input.toBusinessDate,
          page: toPageQuery(input),
        }),
        (row) => row,
      ),
  });
}

export function getCashStatementMatch(ctx: CommandContext, input: CashStatementMatchGetInput) {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "cash.read",
    execute: async ({ repos }) =>
      repos.cashStatementMatchReads.get(input.workspaceId, input.cashStatementMatchId),
  });
}

export function listCashStatementMatches(ctx: CommandContext, input: CashStatementMatchListInput) {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "cash.read",
    execute: async ({ repos }) =>
      toPage(
        await repos.cashStatementMatchReads.list({
          workspaceId: input.workspaceId,
          cashAccountId: input.cashAccountId,
          sourceType: input.sourceType,
          page: toPageQuery(input),
        }),
        (row) => row,
      ),
  });
}

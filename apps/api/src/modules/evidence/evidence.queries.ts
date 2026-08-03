import type {
  CostObservationGetInput,
  CostObservationListInput,
  ReconciliationObservationGetInput,
  ReconciliationObservationListInput,
  DebtObservationGetInput,
  DebtObservationListInput,
} from "@vuarau/domain-contracts";
import { err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery, toPage, toPageQuery } from "../shared/read-pipeline.ts";

export async function getCostObservation(ctx: CommandContext, input: CostObservationGetInput) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "evidence.read",
    execute: ({ repos }) =>
      repos.costObservationReads.get(input.workspaceId, input.costObservationId),
  });
  if (!result.ok) return result;
  return result.value === null
    ? err("COST_OBSERVATION_NOT_FOUND", "No such cost observation.")
    : ok(result.value);
}

export const listCostObservations = (ctx: CommandContext, input: CostObservationListInput) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "evidence.read",
    execute: async ({ repos }) =>
      toPage(
        await repos.costObservationReads.list({
          workspaceId: input.workspaceId,
          kind: input.kind,
          page: toPageQuery(input),
        }),
        (row) => row,
      ),
  });

export async function getReconciliationObservation(
  ctx: CommandContext,
  input: ReconciliationObservationGetInput,
) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "evidence.read",
    execute: ({ repos }) =>
      repos.reconciliationObservationReads.get(
        input.workspaceId,
        input.reconciliationObservationId,
      ),
  });
  if (!result.ok) return result;
  return result.value === null
    ? err("RECONCILIATION_OBSERVATION_NOT_FOUND", "No such reconciliation observation.")
    : ok(result.value);
}

export const listReconciliationObservations = (
  ctx: CommandContext,
  input: ReconciliationObservationListInput,
) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "evidence.read",
    execute: async ({ repos }) =>
      toPage(
        await repos.reconciliationObservationReads.list({
          workspaceId: input.workspaceId,
          kind: input.kind,
          page: toPageQuery(input),
        }),
        (row) => row,
      ),
  });

export async function getDebtObservation(ctx: CommandContext, input: DebtObservationGetInput) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "evidence.read",
    execute: ({ repos }) =>
      repos.debtObservationReads.get(input.workspaceId, input.debtObservationId),
  });
  if (!result.ok) return result;
  return result.value === null
    ? err("DEBT_OBSERVATION_NOT_FOUND", "No such debt observation.")
    : ok(result.value);
}

export const listDebtObservations = (ctx: CommandContext, input: DebtObservationListInput) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "evidence.read",
    execute: async ({ repos }) =>
      toPage(
        await repos.debtObservationReads.list({
          workspaceId: input.workspaceId,
          kind: input.kind,
          page: toPageQuery(input),
        }),
        (row) => row,
      ),
  });

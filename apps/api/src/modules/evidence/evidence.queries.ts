import type {
  CostObservationGetInput,
  CostObservationListInput,
  ReconciliationObservationGetInput,
  ReconciliationObservationListInput,
  DebtObservationGetInput,
  DebtObservationListInput,
  SupplyCommitmentObservationGetInput,
  SupplyCommitmentObservationListInput,
  SupplierObservationGetInput,
  SupplierObservationListInput,
  DemandObservationGetInput,
  DemandObservationListInput,
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

export async function getSupplyCommitmentObservation(
  ctx: CommandContext,
  input: SupplyCommitmentObservationGetInput,
) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "evidence.read",
    execute: ({ repos }) =>
      repos.supplyCommitmentObservationReads.get(
        input.workspaceId,
        input.supplyCommitmentObservationId,
      ),
  });
  if (!result.ok) return result;
  return result.value === null
    ? err("SUPPLY_COMMITMENT_OBSERVATION_NOT_FOUND", "No such supply commitment observation.")
    : ok(result.value);
}

export const listSupplyCommitmentObservations = (
  ctx: CommandContext,
  input: SupplyCommitmentObservationListInput,
) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "evidence.read",
    execute: async ({ repos }) =>
      toPage(
        await repos.supplyCommitmentObservationReads.list({
          workspaceId: input.workspaceId,
          kind: input.kind,
          page: toPageQuery(input),
        }),
        (row) => row,
      ),
  });

export async function getSupplierObservation(
  ctx: CommandContext,
  input: SupplierObservationGetInput,
) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "evidence.read",
    execute: ({ repos }) =>
      repos.supplierObservationReads.get(input.workspaceId, input.supplierObservationId),
  });
  if (!result.ok) return result;
  return result.value === null
    ? err("SUPPLIER_OBSERVATION_NOT_FOUND", "No such supplier observation.")
    : ok(result.value);
}

export const listSupplierObservations = (
  ctx: CommandContext,
  input: SupplierObservationListInput,
) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "evidence.read",
    execute: async ({ repos }) =>
      toPage(
        await repos.supplierObservationReads.list({
          workspaceId: input.workspaceId,
          kind: input.kind,
          page: toPageQuery(input),
        }),
        (row) => row,
      ),
  });

export async function getDemandObservation(ctx: CommandContext, input: DemandObservationGetInput) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "evidence.read",
    execute: ({ repos }) =>
      repos.demandObservationReads.get(input.workspaceId, input.demandObservationId),
  });
  if (!result.ok) return result;
  return result.value === null
    ? err("DEMAND_OBSERVATION_NOT_FOUND", "No such demand observation.")
    : ok(result.value);
}

export const listDemandObservations = (ctx: CommandContext, input: DemandObservationListInput) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "evidence.read",
    execute: async ({ repos }) =>
      toPage(
        await repos.demandObservationReads.list({
          workspaceId: input.workspaceId,
          kind: input.kind,
          page: toPageQuery(input),
        }),
        (row) => row,
      ),
  });

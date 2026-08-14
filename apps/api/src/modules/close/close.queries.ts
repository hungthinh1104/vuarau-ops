import type {
  CashStatementMatchGetInput,
  CashStatementMatchListInput,
  OperationalCloseGetInput,
  OperationalCloseListInput,
  OperationalCloseReadinessInput,
  ReconciliationObservationKind,
  WorkspacePolicyVersionId,
} from "@vuarau/domain-contracts";
import {
  defaultWorkspaceOperationalProfile,
  operationalClosePolicyDefinitionSchema,
  operationalCloseReadinessSchema,
  OPERATIONS_EXCEPTION_KINDS,
  operationsExceptionDefinition,
  vietnamBusinessDateForInstant,
  vietnamBusinessDayRange,
} from "@vuarau/domain-contracts";
import {
  isMeasurableReconciliationObservation,
  resolvePolicyForDecision,
} from "@vuarau/domain-kernel";
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

export function getOperationalCloseReadiness(
  ctx: CommandContext,
  input: OperationalCloseReadinessInput,
) {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "operations.close",
    execute: async ({ repos, asOf }) => {
      const profile =
        (await repos.workspaces.findOperationalProfile(input.workspaceId)) ??
        defaultWorkspaceOperationalProfile(input.workspaceId);
      const businessDate =
        input.businessDate ?? vietnamBusinessDateForInstant(asOf, profile.businessDayStartMinute);
      const period = vietnamBusinessDayRange(businessDate, profile.businessDayStartMinute);
      const [policies, closePage, boardCounts, integrity] = await Promise.all([
        repos.workspacePolicyReads.listAll(input.workspaceId),
        repos.operationalCloseReads.list({
          workspaceId: input.workspaceId,
          fromBusinessDate: businessDate,
          toBusinessDate: businessDate,
          page: { after: null, limit: 1 },
        }),
        repos.dashboardReads.operationsBoardCounts({
          workspaceId: input.workspaceId,
          filter: "all",
          search: "",
          now: asOf,
        }),
        repos.operationsReads.integrity(input.workspaceId),
      ]);
      const currentClose = closePage.rows[0] ?? null;
      const policy = resolvePolicyForDecision(
        policies,
        "operating_cycle_reconciliation",
        asOf,
        asOf,
      );
      let requiredObservationKinds: ReconciliationObservationKind[] = [];
      let policyVersionId: WorkspacePolicyVersionId | null = null;
      const blockers: (
        "policy_unavailable" | "missing_observation" | "already_closed" | "blocking_exception"
      )[] = [];
      if (policy === null) {
        blockers.push("policy_unavailable");
      } else {
        const definition = operationalClosePolicyDefinitionSchema.safeParse(policy.definition);
        if (!definition.success) blockers.push("policy_unavailable");
        else {
          requiredObservationKinds = [...definition.data.parameters.requiredObservationKinds];
          policyVersionId = policy.id;
        }
      }
      const observations =
        requiredObservationKinds.length === 0
          ? []
          : await repos.reconciliationObservationReads.listForPeriod({
              workspaceId: input.workspaceId,
              kinds: requiredObservationKinds,
              start: period.start,
              end: period.end,
            });
      const availableObservationKinds = requiredObservationKinds.filter((kind) =>
        observations.some(
          (observation) =>
            observation.kind === kind && isMeasurableReconciliationObservation(observation),
        ),
      );
      const missingObservationKinds = requiredObservationKinds.filter(
        (kind) => !availableObservationKinds.includes(kind),
      );
      if (missingObservationKinds.length > 0) blockers.push("missing_observation");
      if (currentClose?.state === "closed") blockers.push("already_closed");
      const exceptionCounts = {
        ...boardCounts.counts.exceptionCounts,
        reconciliation_variance: Math.max(
          boardCounts.counts.exceptionCounts.reconciliation_variance,
          integrity.status === "attention" ? 1 : 0,
        ),
      };
      const exceptionSummary = OPERATIONS_EXCEPTION_KINDS.flatMap((kind) => {
        const count = exceptionCounts[kind];
        return count > 0 ? [{ kind, count, ...operationsExceptionDefinition(kind) }] : [];
      });
      if (exceptionSummary.some((exception) => exception.closeImpact === "blocking"))
        blockers.push("blocking_exception");
      return operationalCloseReadinessSchema.parse({
        workspaceId: input.workspaceId,
        businessDate,
        period,
        asOf,
        state: blockers.length === 0 ? "ready" : "blocked",
        blockers,
        exceptionSummary,
        policyVersionId,
        requiredObservationKinds,
        availableObservationKinds,
        missingObservationKinds,
        existingCloseId: currentClose?.id ?? null,
        existingCloseState: currentClose?.state ?? null,
        existingCloseVersion: currentClose?.version ?? null,
      });
    },
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

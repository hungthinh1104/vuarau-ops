import type {
  CashStatementMatchGetInput,
  CashStatementMatchListInput,
  OperationalCloseGetInput,
  OperationalCloseListInput,
  OperationalCloseReadinessInput,
  OperationalCloseReadiness,
  ReconciliationObservationKind,
  WorkspacePolicyVersionId,
  WorkspaceOperationalProfileDto,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import {
  defaultWorkspaceOperationalProfile,
  operationalClosePolicyDefinitionSchema,
  operationalCloseReadinessSchema,
  OPERATIONS_EXCEPTION_KINDS,
  operationsExceptionDefinition,
  operationsControlException,
  vietnamBusinessDateForInstant,
  vietnamBusinessDayRange,
} from "@vuarau/domain-contracts";
import {
  isMeasurableReconciliationObservation,
  resolvePolicyForDecision,
} from "@vuarau/domain-kernel";
import { runQuery, toPage, toPageQuery } from "../shared/read-pipeline.ts";
import type { CommandContext } from "../shared/command-pipeline.ts";
import type { Repositories } from "../../infrastructure/persistence/ports.ts";

/**
 * The close readiness calculation is shared by the read surface and the
 * write-path. A command must not be able to close a day that this calculation
 * says is blocked.
 */
export async function evaluateOperationalCloseReadiness(
  repos: Repositories,
  input: {
    workspaceId: WorkspaceId;
    businessDate: string;
    asOf: string;
    profile: WorkspaceOperationalProfileDto;
  },
): Promise<OperationalCloseReadiness> {
  const { workspaceId, businessDate, asOf, profile } = input;
  const period = vietnamBusinessDayRange(businessDate, profile.businessDayStartMinute);
  const [policies, closePage, boardCounts, integrity, acknowledgements] = await Promise.all([
    repos.workspacePolicyReads.listAll(workspaceId),
    repos.operationalCloseReads.list({
      workspaceId,
      fromBusinessDate: businessDate,
      toBusinessDate: businessDate,
      page: { after: null, limit: 1 },
    }),
    repos.dashboardReads.operationsBoardCounts({
      workspaceId,
      filter: "all",
      search: "",
      now: asOf,
    }),
    repos.operationsReads.integrity(workspaceId),
    repos.operationalCloseExceptionAcknowledgementReads.listForBusinessDate(
      workspaceId,
      businessDate,
    ),
  ]);
  const currentClose = closePage.rows[0] ?? null;
  const policy = resolvePolicyForDecision(policies, "operating_cycle_reconciliation", asOf, asOf);
  let requiredObservationKinds: ReconciliationObservationKind[] = [];
  let policyVersionId: WorkspacePolicyVersionId | null = null;
  const blockers: (
    | "policy_unavailable"
    | "missing_observation"
    | "already_closed"
    | "blocking_exception"
    | "unacknowledged_exception"
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
          workspaceId,
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
    const acknowledgedCount = acknowledgements.filter(
      (acknowledgement) => acknowledgement.exceptionKind === kind,
    ).length;
    const definition = operationsExceptionDefinition(kind);
    const boardCount = boardCounts.counts.exceptionCounts[kind];
    const nextActionHref =
      kind === "reconciliation_variance" && boardCount === 0 && integrity.status === "attention"
        ? null
        : `/operations-board?filter=${kind}`;
    return count > 0
      ? [
          {
            kind,
            count,
            acknowledgedCount,
            ...definition,
            nextAction: { label: definition.nextAction, href: nextActionHref },
          },
        ]
      : [];
  });
  if (exceptionSummary.some((exception) => exception.closeImpact === "blocking"))
    blockers.push("blocking_exception");
  if (
    exceptionSummary.some(
      (exception) =>
        exception.closeImpact === "acknowledgeable" &&
        exception.acknowledgedCount < exception.count,
    )
  )
    blockers.push("unacknowledged_exception");
  const controlException =
    blockers.length === 0
      ? null
      : operationsControlException(
          "operational_close_blocked",
          {
            kind: "workspace",
            reference: `CLOSE-${businessDate}`,
            id: workspaceId,
          },
          [
            { key: "business_date", value: businessDate },
            { key: "blockers", value: blockers.join(",") },
          ],
          "/workspace/operations",
        );
  return operationalCloseReadinessSchema.parse({
    workspaceId,
    businessDate,
    period,
    asOf,
    state: blockers.length === 0 ? "ready" : "blocked",
    blockers,
    controlException,
    exceptionSummary,
    acknowledgements,
    policyVersionId,
    requiredObservationKinds,
    availableObservationKinds,
    missingObservationKinds,
    existingCloseId: currentClose?.id ?? null,
    existingCloseState: currentClose?.state ?? null,
    existingCloseVersion: currentClose?.version ?? null,
  });
}

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
      return evaluateOperationalCloseReadiness(repos, {
        workspaceId: input.workspaceId,
        businessDate,
        asOf,
        profile,
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

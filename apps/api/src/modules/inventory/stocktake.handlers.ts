import type {
  ApproveStocktakeCommand,
  CommandEnvelope,
  RecordStocktakeCountCommand,
  ReopenStocktakeCommand,
  StartStocktakeCommand,
  StocktakeDto,
  WorkspacePolicyVersionId,
  WorkspacePolicyDto,
} from "@vuarau/domain-contracts";
import {
  approveStocktakeCommandSchema,
  recordStocktakeCountCommandSchema,
  reopenStocktakeCommandSchema,
  startStocktakeCommandSchema,
  stocktakeVariancePolicyDefinitionSchema,
} from "@vuarau/domain-contracts";
import {
  activeStocktakeCounts,
  calculateStocktakeExpectedQuantity,
  decideApproveStocktake,
  decideRecordStocktakeCount,
  decideReopenStocktake,
  decideStartStocktake,
  err,
  ok,
  resolveEffectiveWorkspacePolicy,
  stocktakeDto,
} from "@vuarau/domain-kernel";
import type { DomainResult } from "@vuarau/domain-kernel";
import type { InventoryMovementState } from "@vuarau/domain-kernel";
import type { Repositories } from "../../infrastructure/persistence/ports.ts";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { applyInventoryMovements } from "./inventory-effects.ts";

async function effectiveStocktakePolicy(
  repos: Repositories,
  workspaceId: StartStocktakeCommand["workspaceId"],
  asOf: StartStocktakeCommand["payload"]["asOf"],
  knowledgeAt: StartStocktakeCommand["occurredAt"],
): Promise<
  DomainResult<{
    policy: WorkspacePolicyDto;
    definition: ReturnType<typeof stocktakeVariancePolicyDefinitionSchema.parse>;
  }>
> {
  const policies = await repos.workspacePolicyReads.listAll(workspaceId);
  const policy = resolveEffectiveWorkspacePolicy(policies, "stocktake_variance", asOf, knowledgeAt);
  if (policy === null) {
    return err(
      "STOCKTAKE_POLICY_UNAVAILABLE",
      "An approved stocktake variance policy is required.",
    );
  }
  const definition = stocktakeVariancePolicyDefinitionSchema.safeParse(policy.definition);
  if (!definition.success) {
    return err("STOCKTAKE_POLICY_UNAVAILABLE", "The effective stocktake policy is invalid.");
  }
  return ok({ policy, definition: definition.data });
}

async function policyByVersion(
  repos: Repositories,
  workspaceId: StartStocktakeCommand["workspaceId"],
  policyVersionId: WorkspacePolicyVersionId,
) {
  const policy = await repos.workspacePolicies.findById(workspaceId, policyVersionId);
  if (policy === null || policy.state !== "approved") {
    return err(
      "STOCKTAKE_POLICY_UNAVAILABLE",
      "The stocktake policy lineage is missing or is no longer approved.",
    );
  }
  const definition = stocktakeVariancePolicyDefinitionSchema.safeParse(policy.definition);
  if (!definition.success) {
    return err("STOCKTAKE_POLICY_UNAVAILABLE", "The stocktake policy lineage is invalid.");
  }
  return ok({ policy, definition: definition.data });
}

function auditBase(
  command: Pick<CommandEnvelope, "workspaceId" | "actorId" | "commandId" | "occurredAt">,
  recordedAt: StartStocktakeCommand["occurredAt"],
) {
  return {
    workspaceId: command.workspaceId,
    actorId: command.actorId,
    commandId: command.commandId,
    transactionTime: command.occurredAt,
    recordedAt,
  };
}

export function startStocktake(ctx: CommandContext, input: unknown) {
  return runCommand<StartStocktakeCommand, StocktakeDto>({
    commandType: "StartStocktake",
    schema: startStocktakeCommandSchema,
    input,
    ctx,
    requiredPermission: "inventory.adjust",
    requiredWorkflows: ["inventory"],
    execute: async ({ command, repos, recordedAt }) => {
      const policy = await effectiveStocktakePolicy(
        repos,
        command.workspaceId,
        command.payload.asOf,
        recordedAt,
      );
      if (!policy.ok) return policy;
      const decision = decideStartStocktake(command, policy.value.policy.id, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.stocktakes.insert(decision.value))) {
        return err("STOCKTAKE_ALREADY_EXISTS", "A stocktake session with this id already exists.");
      }
      await repos.audit.append({
        ...auditBase(command, recordedAt),
        aggregateType: "stocktake",
        aggregateId: decision.value.id,
        action: "stocktake.started",
        before: null,
        after: { status: decision.value.status, policyVersionId: decision.value.policyVersionId },
        reason: decision.value.note,
      });
      return ok(stocktakeDto(decision.value));
    },
  });
}

export function recordStocktakeCount(ctx: CommandContext, input: unknown) {
  return runCommand<RecordStocktakeCountCommand, StocktakeDto>({
    commandType: "RecordStocktakeCount",
    schema: recordStocktakeCountCommandSchema,
    input,
    ctx,
    requiredPermission: "inventory.adjust",
    requiredWorkflows: ["inventory"],
    execute: async ({ command, repos, recordedAt, operationalProfile }) => {
      const session = await repos.stocktakes.findByIdForUpdate(
        command.workspaceId,
        command.payload.stocktakeSessionId,
      );
      if (session === null) return err("STOCKTAKE_NOT_FOUND", "No such stocktake session.");
      if (
        (await repos.products.findById(command.workspaceId, command.payload.productId)) === null
      ) {
        return err("PRODUCT_NOT_FOUND", "No such Product.");
      }
      if (operationalProfile.qualityGradeMode === "required") {
        if (command.payload.qualityGradeId === null || command.payload.qualityGradeName === null) {
          return err("SALE_QUALITY_GRADE_REQUIRED", "A quality grade is required for this depot.");
        }
        const grade = await repos.qualityGrades.findById(
          command.workspaceId,
          command.payload.qualityGradeId,
        );
        if (grade === null) return err("QUALITY_GRADE_NOT_FOUND", "No such quality grade.");
        if (!grade.isActive) return err("QUALITY_GRADE_INACTIVE", "Quality grade is inactive.");
        if (grade.name !== command.payload.qualityGradeName) {
          return err(
            "SALE_QUALITY_GRADE_SNAPSHOT_MISMATCH",
            "The quality grade snapshot is stale.",
          );
        }
      } else if (
        command.payload.qualityGradeId !== null ||
        command.payload.qualityGradeName !== null
      ) {
        return err("QUALITY_GRADE_NOT_USED", "This depot records inventory without grades.");
      }
      const decision = decideRecordStocktakeCount({
        session,
        existingCounts: session.counts,
        command,
        recordedAt,
      });
      if (!decision.ok) return decision;
      if (!(await repos.stocktakes.insertCount(decision.value.count))) {
        return err("STOCKTAKE_COUNT_DUPLICATE", "This count identity already exists.");
      }
      if (!(await repos.stocktakes.update(decision.value.session, session.version))) {
        return err("STOCKTAKE_VERSION_CONFLICT", "The stocktake changed concurrently.");
      }
      await repos.audit.append({
        ...auditBase(command, recordedAt),
        aggregateType: "stocktake",
        aggregateId: session.id,
        action: "stocktake.count_recorded",
        before: { countCount: session.counts.length },
        after: {
          countCount: decision.value.session.counts.length,
          productId: command.payload.productId,
          countId: decision.value.count.id,
        },
        reason: null,
      });
      return ok(stocktakeDto(decision.value.session));
    },
  });
}

export function approveStocktake(ctx: CommandContext, input: unknown) {
  return runCommand<ApproveStocktakeCommand, StocktakeDto>({
    commandType: "ApproveStocktake",
    schema: approveStocktakeCommandSchema,
    input,
    ctx,
    requiredPermission: "inventory.adjust",
    requiredWorkflows: ["inventory"],
    execute: async ({ command, repos, recordedAt }) => {
      const session = await repos.stocktakes.findByIdForUpdate(
        command.workspaceId,
        command.payload.stocktakeSessionId,
      );
      if (session === null) return err("STOCKTAKE_NOT_FOUND", "No such stocktake session.");
      if (session.version !== command.payload.expectedVersion) {
        return err("STOCKTAKE_VERSION_CONFLICT", "The stocktake changed concurrently.");
      }
      const policy = await policyByVersion(repos, command.workspaceId, session.policyVersionId);
      if (!policy.ok) return policy;
      const decision = decideApproveStocktake({ session, command });
      if (!decision.ok) return decision;
      const drafts: Array<Parameters<typeof applyInventoryMovements>[1][number]> = [];
      for (const count of activeStocktakeCounts(session.counts)) {
        const movements = await repos.inventoryMovements.listByProduct(
          command.workspaceId,
          count.productId,
          count.quantity.unit,
        );
        const expected = calculateStocktakeExpectedQuantity({
          movements: movements.filter(
            (movement) => movement.qualityGradeId === count.qualityGradeId,
          ),
          asOf: session.asOf,
        });
        const variance = count.quantity.valueScaled - expected;
        if (variance === 0) continue;
        drafts.push({
          workspaceId: command.workspaceId,
          productId: count.productId,
          qualityGradeId: count.qualityGradeId,
          qualityGradeName: count.qualityGradeName,
          quantity: { valueScaled: variance, unit: count.quantity.unit },
          sourceType: "stocktake_variance",
          sourceId: command.commandId,
          sourceLineId: count.id,
          reversalOfMovementId: null,
          reasonCode: "stocktake_variance",
          reason: command.payload.reason,
          transactionTime: command.occurredAt,
          recordedAt,
          actorId: command.actorId,
          commandId: command.commandId,
        });
      }
      const appended = await applyInventoryMovements(repos, drafts);
      if (appended.length !== drafts.length) {
        return err(
          "STOCKTAKE_VARIANCE_ALREADY_APPLIED",
          "A stocktake variance effect already exists for this approval.",
        );
      }
      const next = {
        ...decision.value,
        varianceMovementIds: [
          ...session.varianceMovementIds,
          ...appended.map((movement) => movement.id),
        ],
      };
      if (!(await repos.stocktakes.update(next, session.version))) {
        return err("STOCKTAKE_VERSION_CONFLICT", "The stocktake changed concurrently.");
      }
      await repos.audit.append({
        ...auditBase(command, recordedAt),
        aggregateType: "stocktake",
        aggregateId: session.id,
        action: "stocktake.approved",
        before: { status: session.status, version: session.version },
        after: {
          status: next.status,
          version: next.version,
          varianceMovementCount: appended.length,
          policyVersionId: policy.value.policy.id,
        },
        reason: command.payload.reason,
      });
      return ok(stocktakeDto(next));
    },
  });
}

export function reopenStocktake(ctx: CommandContext, input: unknown) {
  return runCommand<ReopenStocktakeCommand, StocktakeDto>({
    commandType: "ReopenStocktake",
    schema: reopenStocktakeCommandSchema,
    input,
    ctx,
    requiredPermission: "inventory.adjust",
    requiredWorkflows: ["inventory"],
    execute: async ({ command, repos, recordedAt }) => {
      const session = await repos.stocktakes.findByIdForUpdate(
        command.workspaceId,
        command.payload.stocktakeSessionId,
      );
      if (session === null) return err("STOCKTAKE_NOT_FOUND", "No such stocktake session.");
      if (session.version !== command.payload.expectedVersion) {
        return err("STOCKTAKE_VERSION_CONFLICT", "The stocktake changed concurrently.");
      }
      const policy = await policyByVersion(repos, command.workspaceId, session.policyVersionId);
      if (!policy.ok) return policy;
      const decision = decideReopenStocktake({
        session,
        command,
        allowReopen: policy.value.definition.parameters.allowReopen,
      });
      if (!decision.ok) return decision;
      const candidates: InventoryMovementState[] = [];
      const knownMovementIds = new Set<string>();
      for (const count of activeStocktakeCounts(session.counts)) {
        const movements = await repos.inventoryMovements.listByProduct(
          command.workspaceId,
          count.productId,
          count.quantity.unit,
        );
        for (const movement of movements) knownMovementIds.add(movement.id);
        for (const movement of movements) {
          if (
            movement.sourceType === "stocktake_variance" &&
            session.varianceMovementIds.includes(movement.id)
          ) {
            candidates.push(movement);
          }
        }
      }
      if (session.varianceMovementIds.some((movementId) => !knownMovementIds.has(movementId))) {
        return err(
          "STOCKTAKE_LINEAGE_MISSING",
          "The stocktake variance lineage is incomplete; no reversal was written.",
        );
      }
      const reversedIds = new Set(
        candidates
          .filter((movement) => movement.reversalOfMovementId !== null)
          .map((movement) => movement.reversalOfMovementId),
      );
      const active = candidates.filter(
        (movement) => movement.reversalOfMovementId === null && !reversedIds.has(movement.id),
      );
      const drafts: Array<Parameters<typeof applyInventoryMovements>[1][number]> = active.map(
        (movement) => ({
          workspaceId: command.workspaceId,
          productId: movement.productId,
          qualityGradeId: movement.qualityGradeId,
          qualityGradeName: movement.qualityGradeName,
          quantity: { valueScaled: -movement.quantity.valueScaled, unit: movement.quantity.unit },
          sourceType: "stocktake_variance",
          sourceId: command.commandId,
          sourceLineId: movement.id,
          reversalOfMovementId: movement.id,
          reasonCode: "stocktake_reopen",
          reason: command.payload.reason,
          transactionTime: command.occurredAt,
          recordedAt,
          actorId: command.actorId,
          commandId: command.commandId,
        }),
      );
      const appended = await applyInventoryMovements(repos, drafts);
      if (appended.length !== drafts.length) {
        return err(
          "STOCKTAKE_VARIANCE_ALREADY_APPLIED",
          "A stocktake variance reversal already exists for this reopen.",
        );
      }
      const next = {
        ...decision.value,
        varianceMovementIds: [
          ...session.varianceMovementIds,
          ...appended.map((movement) => movement.id),
        ],
      };
      if (!(await repos.stocktakes.update(next, session.version))) {
        return err("STOCKTAKE_VERSION_CONFLICT", "The stocktake changed concurrently.");
      }
      await repos.audit.append({
        ...auditBase(command, recordedAt),
        aggregateType: "stocktake",
        aggregateId: session.id,
        action: "stocktake.reopened",
        before: { status: session.status, version: session.version },
        after: { status: next.status, version: next.version, reversalCount: appended.length },
        reason: command.payload.reason,
      });
      return ok(stocktakeDto(next));
    },
  });
}

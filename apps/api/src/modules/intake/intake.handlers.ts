import type {
  CreateQualityIssueCodeCommand,
  DeactivateQualityIssueCodeCommand,
  GoodsArrivalDto,
  QualityDispositionDto,
  QualityInspectionDto,
  QualityIssueCodeDto,
  ReactivateQualityIssueCodeCommand,
  RecordGoodsArrivalCommand,
  RecordQualityDispositionCommand,
  RecordQualityInspectionCommand,
  ReverseGoodsArrivalCommand,
  ReverseQualityDispositionCommand,
  ReverseQualityInspectionCommand,
  UpdateQualityIssueCodeCommand,
} from "@vuarau/domain-contracts";
import {
  createQualityIssueCodeCommandSchema,
  deactivateQualityIssueCodeCommandSchema,
  reactivateQualityIssueCodeCommandSchema,
  recordGoodsArrivalCommandSchema,
  recordQualityDispositionCommandSchema,
  recordQualityInspectionCommandSchema,
  reverseGoodsArrivalCommandSchema,
  reverseQualityDispositionCommandSchema,
  reverseQualityInspectionCommandSchema,
  updateQualityIssueCodeCommandSchema,
} from "@vuarau/domain-contracts";
import {
  decideCreateQualityIssueCode,
  decideQualityIssueCodeLifecycle,
  decideRecordGoodsArrival,
  decideRecordQualityDisposition,
  decideRecordQualityInspection,
  decideReverseGoodsArrival,
  decideReverseQualityDisposition,
  decideReverseQualityInspection,
  decideUpdateQualityIssueCode,
  err,
  ok,
} from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { applyInventoryMovements } from "../inventory/inventory-effects.ts";

async function appendAudit(
  repos: Parameters<Parameters<CommandContext["deps"]["uow"]["transaction"]>[0]>[0],
  command: { workspaceId: string; actorId: string; commandId: string },
  draft: Parameters<typeof repos.audit.append>[0],
) {
  await repos.audit.append({
    ...draft,
    workspaceId: command.workspaceId,
    actorId: command.actorId,
    commandId: command.commandId,
  } as Parameters<typeof repos.audit.append>[0]);
}

export function createQualityIssueCode(ctx: CommandContext, input: unknown) {
  return runCommand<CreateQualityIssueCodeCommand, QualityIssueCodeDto>({
    commandType: "CreateQualityIssueCode",
    schema: createQualityIssueCodeCommandSchema,
    input,
    ctx,
    requiredPermission: "quality.issue.manage",
    execute: async ({ command, repos, recordedAt }) => {
      const decision = decideCreateQualityIssueCode(command, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.qualityIssueCodes.insert(decision.value.code))) {
        return err(
          "QUALITY_ISSUE_CODE_VERSION_CONFLICT",
          "Issue code identity or code already exists.",
        );
      }
      await appendAudit(repos, command, decision.value.audit as never);
      return ok(decision.value.code);
    },
  });
}

export function updateQualityIssueCode(ctx: CommandContext, input: unknown) {
  return runCommand<UpdateQualityIssueCodeCommand, QualityIssueCodeDto>({
    commandType: "UpdateQualityIssueCode",
    schema: updateQualityIssueCodeCommandSchema,
    input,
    ctx,
    requiredPermission: "quality.issue.manage",
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.qualityIssueCodes.findByIdForUpdate(
        command.workspaceId,
        command.payload.qualityIssueCodeId,
      );
      if (current === null) return err("QUALITY_ISSUE_CODE_NOT_FOUND", "No such issue code.");
      const decision = decideUpdateQualityIssueCode(command, current, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.qualityIssueCodes.update(decision.value.code, current.version))) {
        return err("QUALITY_ISSUE_CODE_VERSION_CONFLICT", "Issue code changed concurrently.");
      }
      await appendAudit(repos, command, decision.value.audit as never);
      return ok(decision.value.code);
    },
  });
}

function issueCodeLifecycle(ctx: CommandContext, input: unknown, targetActive: boolean) {
  const schema = targetActive
    ? reactivateQualityIssueCodeCommandSchema
    : deactivateQualityIssueCodeCommandSchema;
  return runCommand<
    DeactivateQualityIssueCodeCommand | ReactivateQualityIssueCodeCommand,
    QualityIssueCodeDto
  >({
    commandType: targetActive ? "ReactivateQualityIssueCode" : "DeactivateQualityIssueCode",
    schema,
    input,
    ctx,
    requiredPermission: "quality.issue.manage",
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.qualityIssueCodes.findByIdForUpdate(
        command.workspaceId,
        command.payload.qualityIssueCodeId,
      );
      if (current === null) return err("QUALITY_ISSUE_CODE_NOT_FOUND", "No such issue code.");
      const decision = decideQualityIssueCodeLifecycle(command, current, targetActive, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.qualityIssueCodes.update(decision.value.code, current.version))) {
        return err("QUALITY_ISSUE_CODE_VERSION_CONFLICT", "Issue code changed concurrently.");
      }
      await appendAudit(repos, command, decision.value.audit as never);
      return ok(decision.value.code);
    },
  });
}

export const deactivateQualityIssueCode = (ctx: CommandContext, input: unknown) =>
  issueCodeLifecycle(ctx, input, false);
export const reactivateQualityIssueCode = (ctx: CommandContext, input: unknown) =>
  issueCodeLifecycle(ctx, input, true);

export function recordGoodsArrival(ctx: CommandContext, input: unknown) {
  return runCommand<RecordGoodsArrivalCommand, GoodsArrivalDto>({
    commandType: "RecordGoodsArrival",
    schema: recordGoodsArrivalCommandSchema,
    input,
    ctx,
    requiredPermission: "intake.record",
    requiredWorkflows: ["purchasing", "inventory", "inspected_intake"],
    execute: async ({ command, repos, recordedAt, operationalProfile }) => {
      const supplier = await repos.suppliers.findById(
        command.workspaceId,
        command.payload.supplierId,
      );
      if (supplier === null) return err("SUPPLIER_NOT_FOUND", "No such supplier.");
      if (!supplier.isActive) return err("SUPPLIER_INACTIVE", "Supplier is inactive.");
      const purchase =
        command.payload.purchaseId === null
          ? null
          : await repos.purchases.findById(command.workspaceId, command.payload.purchaseId);
      if (command.payload.purchaseId !== null) {
        if (
          purchase === null ||
          purchase.status !== "confirmed" ||
          purchase.voidRecord !== null ||
          purchase.supplierId !== command.payload.supplierId
        ) {
          return err(
            "GOODS_ARRIVAL_PURCHASE_MISMATCH",
            "Arrival requires an active confirmed Purchase for the same supplier.",
          );
        }
      }
      const lineIds = new Set<string>();
      for (const line of command.payload.lines) {
        if (lineIds.has(line.arrivalLineId)) {
          return err("GOODS_ARRIVAL_LINE_INVALID", "Arrival line identities must be unique.");
        }
        lineIds.add(line.arrivalLineId);
        const product = await repos.products.findById(command.workspaceId, line.productId);
        if (
          product === null ||
          !product.isActive ||
          product.displayName !== line.productName ||
          product.preferredUnit !== line.arrivedQuantity.unit
        ) {
          return err(
            "GOODS_ARRIVAL_LINE_INVALID",
            "Arrival product snapshot or unit does not match the active Product.",
            { arrivalLineId: line.arrivalLineId },
          );
        }
        if (purchase !== null) {
          const purchaseLine = purchase.lines.find(
            (candidate) => candidate.lineId === line.purchaseLineId,
          );
          if (
            purchaseLine === undefined ||
            purchaseLine.productId !== line.productId ||
            purchaseLine.productName !== line.productName ||
            purchaseLine.quantity.unit !== line.arrivedQuantity.unit
          ) {
            return err(
              "GOODS_ARRIVAL_PURCHASE_MISMATCH",
              "Arrival line does not match its Purchase line.",
              { arrivalLineId: line.arrivalLineId },
            );
          }
        }
        if (operationalProfile.weighingMode === "gross_tare_net") {
          if (line.weighing === null) {
            return err("WEIGHING_REQUIRED", "Gross, tare and net weight are required.");
          }
          if (
            line.arrivedQuantity.unit !== line.weighing.netWeight.unit ||
            line.arrivedQuantity.valueScaled !== line.weighing.netWeight.valueScaled
          ) {
            return err("WEIGHING_INVALID", "Arrived quantity must equal measured net weight.");
          }
        } else if (line.weighing !== null) {
          return err("WEIGHING_NOT_USED", "This depot records quantity without weighing detail.");
        }
      }
      const decision = decideRecordGoodsArrival(command, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.goodsArrivals.insert(decision.value.arrival))) {
        return err("GOODS_ARRIVAL_LINE_INVALID", "Arrival identity already exists.");
      }
      await appendAudit(repos, command, decision.value.audit as never);
      return ok(decision.value.arrival);
    },
  });
}

export function reverseGoodsArrival(ctx: CommandContext, input: unknown) {
  return runCommand<ReverseGoodsArrivalCommand, GoodsArrivalDto>({
    commandType: "ReverseGoodsArrival",
    schema: reverseGoodsArrivalCommandSchema,
    input,
    ctx,
    requiredPermission: "intake.reverse",
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.goodsArrivals.findByIdForUpdate(
        command.workspaceId,
        command.payload.arrivalId,
      );
      if (current === null) return err("GOODS_ARRIVAL_NOT_FOUND", "No such arrival.");
      const downstream = await repos.goodsArrivals.downstreamFactCount(
        command.workspaceId,
        current.id,
      );
      const decision = decideReverseGoodsArrival(command, current, downstream, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.goodsArrivals.insertReversal(decision.value.arrival))) {
        return err("GOODS_ARRIVAL_ALREADY_REVERSED", "Arrival is already reversed.");
      }
      await appendAudit(repos, command, decision.value.audit as never);
      return ok(decision.value.arrival);
    },
  });
}

export function recordQualityInspection(ctx: CommandContext, input: unknown) {
  return runCommand<RecordQualityInspectionCommand, QualityInspectionDto>({
    commandType: "RecordQualityInspection",
    schema: recordQualityInspectionCommandSchema,
    input,
    ctx,
    requiredPermission: "quality.inspect",
    requiredWorkflows: ["inspected_intake"],
    execute: async ({ command, repos, recordedAt }) => {
      const found = await repos.goodsArrivals.findLine(
        command.workspaceId,
        command.payload.arrivalLineId,
      );
      if (found === null) return err("GOODS_ARRIVAL_NOT_FOUND", "No such arrival line.");
      const existing = await repos.qualityInspections.activeInspectedQuantity(
        command.workspaceId,
        command.payload.arrivalLineId,
      );
      if (
        existing !== null &&
        (existing.unit !== command.payload.inspectedQuantity.unit ||
          existing.valueScaled + command.payload.inspectedQuantity.valueScaled >
            found.line.arrivedQuantity.valueScaled)
      ) {
        return err(
          "QUALITY_INSPECTION_QUANTITY_EXCEEDS_ARRIVAL",
          "Active inspections exceed the arrival line quantity.",
        );
      }
      for (const issue of command.payload.issues) {
        const code = await repos.qualityIssueCodes.findById(
          command.workspaceId,
          issue.qualityIssueCodeId,
        );
        if (code === null) return err("QUALITY_ISSUE_CODE_NOT_FOUND", "No such issue code.");
        if (!code.isActive) return err("QUALITY_ISSUE_CODE_INACTIVE", "Issue code is inactive.");
        if (code.code !== issue.qualityIssueCode || code.displayName !== issue.qualityIssueName) {
          return err("QUALITY_INSPECTION_INVALID", "Issue-code snapshot is stale.");
        }
      }
      const decision = decideRecordQualityInspection(
        command,
        found.line,
        found.arrival.reversal === null,
        recordedAt,
      );
      if (!decision.ok) return decision;
      if (!(await repos.qualityInspections.insert(decision.value.inspection))) {
        return err("QUALITY_INSPECTION_INVALID", "Inspection identity already exists.");
      }
      await appendAudit(repos, command, decision.value.audit as never);
      return ok(decision.value.inspection);
    },
  });
}

export function reverseQualityInspection(ctx: CommandContext, input: unknown) {
  return runCommand<ReverseQualityInspectionCommand, QualityInspectionDto>({
    commandType: "ReverseQualityInspection",
    schema: reverseQualityInspectionCommandSchema,
    input,
    ctx,
    requiredPermission: "quality.inspect.reverse",
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.qualityInspections.findByIdForUpdate(
        command.workspaceId,
        command.payload.inspectionId,
      );
      if (current === null) return err("QUALITY_INSPECTION_NOT_FOUND", "No such inspection.");
      const downstream = await repos.qualityInspections.downstreamFactCount(
        command.workspaceId,
        current.arrivalLineId,
      );
      if (downstream > 0) {
        return err(
          "QUALITY_INSPECTION_HAS_DOWNSTREAM_FACTS",
          "Inspection already supports a disposition and cannot be reversed.",
        );
      }
      const decision = decideReverseQualityInspection(command, current, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.qualityInspections.insertReversal(decision.value.inspection))) {
        return err("QUALITY_INSPECTION_ALREADY_REVERSED", "Inspection is already reversed.");
      }
      await appendAudit(repos, command, decision.value.audit as never);
      return ok(decision.value.inspection);
    },
  });
}

export function recordQualityDisposition(ctx: CommandContext, input: unknown) {
  return runCommand<RecordQualityDispositionCommand, QualityDispositionDto>({
    commandType: "RecordQualityDisposition",
    schema: recordQualityDispositionCommandSchema,
    input,
    ctx,
    requiredPermission: "quality.disposition",
    requiredWorkflows: ["inventory", "inspected_intake"],
    execute: async ({ command, repos, recordedAt, operationalProfile }) => {
      const source = await repos.qualityDispositions.sourceSummary(
        command.workspaceId,
        command.payload.source,
      );
      if (source === null) {
        return err("QUALITY_DISPOSITION_SOURCE_NOT_FOUND", "No such disposition source.");
      }
      for (const allocation of command.payload.allocations) {
        if (allocation.outcome !== "accepted") continue;
        if (operationalProfile.qualityGradeMode === "required") {
          if (allocation.qualityGradeId === null || allocation.qualityGradeName === null) {
            return err(
              "SALE_QUALITY_GRADE_REQUIRED",
              "Accepted quantity requires a commercial grade.",
            );
          }
          const grade = await repos.qualityGrades.findById(
            command.workspaceId,
            allocation.qualityGradeId,
          );
          if (grade === null) return err("QUALITY_GRADE_NOT_FOUND", "No such grade.");
          if (!grade.isActive) return err("QUALITY_GRADE_INACTIVE", "Grade is inactive.");
          if (grade.name !== allocation.qualityGradeName) {
            return err("SALE_QUALITY_GRADE_SNAPSHOT_MISMATCH", "Accepted grade snapshot is stale.");
          }
        } else if (allocation.qualityGradeId !== null || allocation.qualityGradeName !== null) {
          return err("QUALITY_GRADE_NOT_USED", "This depot does not use commercial grades.");
        }
      }
      const acceptedNew = command.payload.allocations
        .filter((allocation) => allocation.outcome === "accepted")
        .reduce((sum, allocation) => sum + allocation.quantity.valueScaled, 0);
      if (
        acceptedNew > 0 &&
        source.summary.purchaseId !== null &&
        source.summary.purchaseLineId !== null
      ) {
        const purchase = await repos.purchases.findById(
          command.workspaceId,
          source.summary.purchaseId,
        );
        if (purchase === null) {
          return err("GOODS_ARRIVAL_PURCHASE_MISMATCH", "Purchase no longer resolves.");
        }
        const purchaseLine = purchase.lines.find(
          (line) => line.lineId === source.summary.purchaseLineId,
        );
        if (purchaseLine === undefined) {
          return err("GOODS_ARRIVAL_PURCHASE_MISMATCH", "Purchase line no longer resolves.");
        }
        const direct = await repos.purchaseReceipts.netReceivedByPurchaseLine(
          command.workspaceId,
          purchase.id,
        );
        const inspected = await repos.qualityDispositions.acceptedQuantityForPurchaseLine(
          command.workspaceId,
          purchaseLine.lineId,
        );
        if (
          purchaseLine.quantity.unit !== source.summary.sourceQuantity.unit ||
          (inspected !== null && inspected.unit !== purchaseLine.quantity.unit) ||
          (direct.get(purchaseLine.lineId) ?? 0) + (inspected?.valueScaled ?? 0) + acceptedNew >
            purchaseLine.quantity.valueScaled
        ) {
          return err(
            "RECEIPT_QUANTITY_EXCEEDS_PURCHASE",
            "Accepted quantity exceeds the Purchase line.",
          );
        }
      }
      const decision = decideRecordQualityDisposition(
        command,
        source.summary,
        source.active,
        recordedAt,
      );
      if (!decision.ok) return decision;
      if (!(await repos.qualityDispositions.insert(decision.value.disposition))) {
        return err("QUALITY_DISPOSITION_INVALID", "Disposition identity already exists.");
      }
      const accepted = decision.value.disposition.allocations.filter(
        (allocation) => allocation.outcome === "accepted",
      );
      await applyInventoryMovements(
        repos,
        accepted.map((allocation) => ({
          workspaceId: command.workspaceId,
          productId: source.summary.productId,
          qualityGradeId: allocation.qualityGradeId,
          qualityGradeName: allocation.qualityGradeName,
          quantity: allocation.quantity,
          sourceType: "quality_disposition" as const,
          sourceId: decision.value.disposition.id,
          sourceLineId: allocation.allocationId,
          reversalOfMovementId: null,
          reasonCode: "accepted_after_inspection",
          reason: allocation.note ?? decision.value.disposition.note,
          transactionTime: command.occurredAt,
          recordedAt,
          actorId: command.actorId,
          commandId: command.commandId,
        })),
      );
      await appendAudit(repos, command, decision.value.audit as never);
      return ok(decision.value.disposition);
    },
  });
}

export function reverseQualityDisposition(ctx: CommandContext, input: unknown) {
  return runCommand<ReverseQualityDispositionCommand, QualityDispositionDto>({
    commandType: "ReverseQualityDisposition",
    schema: reverseQualityDispositionCommandSchema,
    input,
    ctx,
    requiredPermission: "quality.disposition.reverse",
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.qualityDispositions.findByIdForUpdate(
        command.workspaceId,
        command.payload.dispositionId,
      );
      if (current === null) return err("QUALITY_DISPOSITION_NOT_FOUND", "No such disposition.");
      const downstream = await repos.qualityDispositions.downstreamFactCount(
        command.workspaceId,
        current.id,
      );
      const decision = decideReverseQualityDisposition(command, current, downstream, recordedAt);
      if (!decision.ok) return decision;
      const source = await repos.qualityDispositions.sourceSummary(
        command.workspaceId,
        current.source,
      );
      if (source === null) {
        throw new Error(`Disposition ${current.id} has no canonical source.`);
      }
      const accepted = current.allocations.filter(
        (allocation) => allocation.outcome === "accepted",
      );
      const originals = await Promise.all(
        accepted.map(async (allocation) => {
          const movements = await repos.inventoryMovements.listByProduct(
            command.workspaceId,
            source.summary.productId,
            allocation.quantity.unit,
          );
          return (
            movements.find(
              (movement) =>
                movement.sourceType === "quality_disposition" &&
                movement.sourceId === current.id &&
                movement.sourceLineId === allocation.allocationId,
            ) ?? null
          );
        }),
      );
      if (originals.some((movement) => movement === null)) {
        throw new Error(`Disposition ${current.id} is missing an accepted inventory movement.`);
      }
      if (!(await repos.qualityDispositions.insertReversal(decision.value.disposition))) {
        return err("QUALITY_DISPOSITION_ALREADY_REVERSED", "Disposition is already reversed.");
      }
      await applyInventoryMovements(
        repos,
        accepted.map((allocation, index) => ({
          workspaceId: command.workspaceId,
          productId: source.summary.productId,
          qualityGradeId: allocation.qualityGradeId,
          qualityGradeName: allocation.qualityGradeName,
          quantity: {
            valueScaled: -allocation.quantity.valueScaled,
            unit: allocation.quantity.unit,
          },
          sourceType: "quality_disposition_reversal" as const,
          sourceId: command.payload.reversalId,
          sourceLineId: allocation.allocationId,
          reversalOfMovementId: originals[index]!.id,
          reasonCode: "quality_disposition_reversal",
          reason: command.payload.reason,
          transactionTime: command.occurredAt,
          recordedAt,
          actorId: command.actorId,
          commandId: command.commandId,
        })),
      );
      await appendAudit(repos, command, decision.value.audit as never);
      return ok(decision.value.disposition);
    },
  });
}

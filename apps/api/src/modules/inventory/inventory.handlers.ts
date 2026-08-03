import type {
  AdjustInventoryCommand,
  PurchaseReceiptDto,
  RecordPurchaseReceiptCommand,
  ReversePurchaseReceiptCommand,
  ReclassifyInventoryCommand,
} from "@vuarau/domain-contracts";
import {
  adjustInventoryCommandSchema,
  recordPurchaseReceiptCommandSchema,
  reversePurchaseReceiptCommandSchema,
  reclassifyInventoryCommandSchema,
} from "@vuarau/domain-contracts";
import {
  decideRecordPurchaseReceipt,
  decideReversePurchaseReceipt,
  err,
  ok,
  validateInventoryAdjustment,
  validateInventoryReclassification,
} from "@vuarau/domain-kernel";
import type { PurchaseReceiptState } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { applyInventoryMovements } from "./inventory-effects.ts";

const dto = (receipt: PurchaseReceiptState): PurchaseReceiptDto => ({
  ...receipt,
  evidenceReferences: [...(receipt.evidenceReferences ?? [])],
  lines: receipt.lines.map((line) => ({ ...line })),
  reversal:
    receipt.reversal === null
      ? null
      : {
          id: receipt.reversal.id,
          reasonCode: receipt.reversal.reasonCode,
          reason: receipt.reversal.reason,
          transactionTime: receipt.reversal.transactionTime,
          recordedAt: receipt.reversal.recordedAt,
          evidenceReferences: [...(receipt.reversal.evidenceReferences ?? [])],
        },
});

export function recordPurchaseReceipt(ctx: CommandContext, input: unknown) {
  return runCommand<RecordPurchaseReceiptCommand, PurchaseReceiptDto>({
    commandType: "RecordPurchaseReceipt",
    schema: recordPurchaseReceiptCommandSchema,
    input,
    ctx,
    requiredPermission: "receiving.record",
    requiredWorkflows: ["purchasing", "inventory", "direct_receiving"],
    execute: async ({ command, repos, recordedAt, operationalProfile }) => {
      const purchase = await repos.purchases.findByIdForUpdate(
        command.workspaceId,
        command.payload.purchaseId,
      );
      if (purchase === null) return err("PURCHASE_NOT_FOUND", "No such Purchase.");
      for (const line of command.payload.lines) {
        if (operationalProfile.qualityGradeMode === "required") {
          if (line.qualityGradeId === null || line.qualityGradeName === null) {
            return err(
              "SALE_QUALITY_GRADE_REQUIRED",
              "This depot requires a quality grade on every accepted Receipt line.",
            );
          }
          const grade = await repos.qualityGrades.findById(
            command.workspaceId,
            line.qualityGradeId,
          );
          if (grade === null) return err("QUALITY_GRADE_NOT_FOUND", "No such quality grade.");
          if (!grade.isActive) return err("QUALITY_GRADE_INACTIVE", "Quality grade is inactive.");
          if (grade.name !== line.qualityGradeName) {
            return err(
              "SALE_QUALITY_GRADE_SNAPSHOT_MISMATCH",
              "Receipt grade snapshot does not match the selected grade.",
            );
          }
        } else if (line.qualityGradeId !== null || line.qualityGradeName !== null) {
          return err(
            "QUALITY_GRADE_NOT_USED",
            "This depot records accepted inventory without commercial grades.",
          );
        }
      }
      const net = await repos.purchaseReceipts.netReceivedByPurchaseLine(
        command.workspaceId,
        purchase.id,
      );
      const decision = decideRecordPurchaseReceipt({
        command,
        purchase,
        existingNetByLine: net,
        recordedAt,
      });
      if (!decision.ok) return decision;
      await repos.purchaseReceipts.insert(decision.value);
      await applyInventoryMovements(
        repos,
        decision.value.lines.map((line) => ({
          workspaceId: command.workspaceId,
          productId: line.productId,
          qualityGradeId: line.qualityGradeId,
          qualityGradeName: line.qualityGradeName,
          quantity: line.quantity,
          sourceType: "purchase_receipt",
          sourceId: decision.value.id,
          sourceLineId: line.receiptLineId,
          reversalOfMovementId: null,
          reasonCode: null,
          reason: null,
          transactionTime: command.occurredAt,
          recordedAt,
          actorId: command.actorId,
          commandId: command.commandId,
        })),
      );
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "receipt",
        aggregateId: decision.value.id,
        action: "receipt.recorded",
        transactionTime: command.occurredAt,
        recordedAt,
        before: null,
        after: { lineCount: decision.value.lines.length },
        reason: null,
      });
      return ok(dto(decision.value));
    },
  });
}

export function reversePurchaseReceipt(ctx: CommandContext, input: unknown) {
  return runCommand<ReversePurchaseReceiptCommand, PurchaseReceiptDto>({
    commandType: "ReversePurchaseReceipt",
    schema: reversePurchaseReceiptCommandSchema,
    input,
    ctx,
    requiredPermission: "receiving.reverse",
    execute: async ({ command, repos, recordedAt }) => {
      const receipt = await repos.purchaseReceipts.findById(
        command.workspaceId,
        command.payload.receiptId,
      );
      if (receipt === null) return err("RECEIPT_NOT_FOUND", "No such Receipt.");
      const decision = decideReversePurchaseReceipt(receipt, command, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.purchaseReceipts.insertReversal(decision.value)))
        return err("RECEIPT_ALREADY_REVERSED", "Receipt is already reversed.");
      const originals = await Promise.all(
        receipt.lines.map(async (line) => {
          const movements = await repos.inventoryMovements.listByProduct(
            command.workspaceId,
            line.productId,
            line.quantity.unit,
          );
          return (
            movements.find(
              (movement) =>
                movement.sourceType === "purchase_receipt" &&
                movement.sourceId === receipt.id &&
                movement.sourceLineId === line.receiptLineId,
            ) ?? null
          );
        }),
      );
      if (originals.some((movement) => movement === null))
        throw new Error(`Receipt ${receipt.id} is missing an inventory movement.`);
      await applyInventoryMovements(
        repos,
        receipt.lines.map((line, index) => ({
          workspaceId: command.workspaceId,
          productId: line.productId,
          qualityGradeId: line.qualityGradeId,
          qualityGradeName: line.qualityGradeName,
          quantity: { valueScaled: -line.quantity.valueScaled, unit: line.quantity.unit },
          sourceType: "purchase_receipt_reversal",
          sourceId: decision.value.id,
          sourceLineId: line.receiptLineId,
          reversalOfMovementId: originals[index]!.id,
          reasonCode: decision.value.reasonCode,
          reason: decision.value.reason,
          transactionTime: command.occurredAt,
          recordedAt,
          actorId: command.actorId,
          commandId: command.commandId,
        })),
      );
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "receipt",
        aggregateId: receipt.id,
        action: "receipt.reversed",
        transactionTime: command.occurredAt,
        recordedAt,
        before: { active: true },
        after: { active: false },
        reason: decision.value.reason,
      });
      return ok(dto({ ...receipt, reversal: decision.value }));
    },
  });
}

export function adjustInventory(ctx: CommandContext, input: unknown) {
  return runCommand<AdjustInventoryCommand, { adjustmentId: string }>({
    commandType: "AdjustInventory",
    schema: adjustInventoryCommandSchema,
    input,
    ctx,
    requiredPermission: "inventory.adjust",
    requiredWorkflows: ["inventory"],
    execute: async ({ command, repos, recordedAt, operationalProfile }) => {
      if ((await repos.products.findById(command.workspaceId, command.payload.productId)) === null)
        return err("PRODUCT_NOT_FOUND", "No such Product.");
      let grade: { id: typeof command.payload.qualityGradeId; name: string } | null = null;
      if (operationalProfile.qualityGradeMode === "required") {
        if (command.payload.qualityGradeId === null || command.payload.qualityGradeName === null) {
          return err(
            "SALE_QUALITY_GRADE_REQUIRED",
            "This depot requires a quality grade for inventory adjustments.",
          );
        }
        const currentGrade = await repos.qualityGrades.findById(
          command.workspaceId,
          command.payload.qualityGradeId,
        );
        if (currentGrade === null) return err("QUALITY_GRADE_NOT_FOUND", "No such quality grade.");
        if (!currentGrade.isActive)
          return err("QUALITY_GRADE_INACTIVE", "Quality grade is inactive.");
        if (currentGrade.name !== command.payload.qualityGradeName) {
          return err(
            "SALE_QUALITY_GRADE_SNAPSHOT_MISMATCH",
            "Inventory grade snapshot does not match the selected grade.",
          );
        }
        grade = { id: currentGrade.id, name: currentGrade.name };
      } else if (
        command.payload.qualityGradeId !== null ||
        command.payload.qualityGradeName !== null
      ) {
        return err(
          "QUALITY_GRADE_NOT_USED",
          "This depot records inventory without commercial grades.",
        );
      }
      const decision = validateInventoryAdjustment(command);
      if (!decision.ok) return decision;
      await applyInventoryMovements(repos, [
        {
          workspaceId: command.workspaceId,
          productId: command.payload.productId,
          qualityGradeId: grade?.id ?? null,
          qualityGradeName: grade?.name ?? null,
          quantity: { valueScaled: decision.value, unit: command.payload.quantity.unit },
          sourceType: "inventory_adjustment",
          sourceId: command.payload.adjustmentId,
          sourceLineId: null,
          reversalOfMovementId: null,
          reasonCode: command.payload.reasonCode,
          reason: command.payload.reason.trim(),
          transactionTime: command.occurredAt,
          recordedAt,
          actorId: command.actorId,
          commandId: command.commandId,
        },
      ]);
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "inventory",
        aggregateId: command.payload.adjustmentId,
        action: "inventory.adjusted",
        transactionTime: command.occurredAt,
        recordedAt,
        before: null,
        after: { direction: command.payload.direction },
        reason: command.payload.reason.trim(),
      });
      return ok({ adjustmentId: command.payload.adjustmentId });
    },
  });
}

export function reclassifyInventory(ctx: CommandContext, input: unknown) {
  return runCommand<ReclassifyInventoryCommand, { reclassificationId: string }>({
    commandType: "ReclassifyInventory",
    schema: reclassifyInventoryCommandSchema,
    input,
    ctx,
    requiredPermission: "inventory.reclassify",
    requiredWorkflows: ["inventory", "quality_grading"],
    execute: async ({ command, repos, recordedAt }) => {
      if ((await repos.products.findById(command.workspaceId, command.payload.productId)) === null)
        return err("PRODUCT_NOT_FOUND", "No such Product.");
      const [fromGrade, toGrade] = await Promise.all([
        repos.qualityGrades.findById(command.workspaceId, command.payload.fromQualityGradeId),
        repos.qualityGrades.findById(command.workspaceId, command.payload.toQualityGradeId),
      ]);
      if (fromGrade === null || toGrade === null)
        return err("QUALITY_GRADE_NOT_FOUND", "Reclassification grade is missing.");
      if (!fromGrade.isActive || !toGrade.isActive)
        return err("QUALITY_GRADE_INACTIVE", "Reclassification requires active grades.");
      if (
        fromGrade.name !== command.payload.fromQualityGradeName ||
        toGrade.name !== command.payload.toQualityGradeName
      )
        return err(
          "SALE_QUALITY_GRADE_SNAPSHOT_MISMATCH",
          "Reclassification grade snapshot is stale.",
        );
      const decision = validateInventoryReclassification(command);
      if (!decision.ok) return decision;
      await applyInventoryMovements(repos, [
        {
          workspaceId: command.workspaceId,
          productId: command.payload.productId,
          qualityGradeId: fromGrade.id,
          qualityGradeName: fromGrade.name,
          quantity: {
            valueScaled: -decision.value,
            unit: command.payload.quantity.unit,
          },
          sourceType: "inventory_reclassification",
          sourceId: command.payload.reclassificationId,
          sourceLineId: fromGrade.id,
          reversalOfMovementId: null,
          reasonCode: "reclassification_out",
          reason: command.payload.reason.trim(),
          transactionTime: command.occurredAt,
          recordedAt,
          actorId: command.actorId,
          commandId: command.commandId,
        },
        {
          workspaceId: command.workspaceId,
          productId: command.payload.productId,
          qualityGradeId: toGrade.id,
          qualityGradeName: toGrade.name,
          quantity: command.payload.quantity,
          sourceType: "inventory_reclassification",
          sourceId: command.payload.reclassificationId,
          sourceLineId: toGrade.id,
          reversalOfMovementId: null,
          reasonCode: "reclassification_in",
          reason: command.payload.reason.trim(),
          transactionTime: command.occurredAt,
          recordedAt,
          actorId: command.actorId,
          commandId: command.commandId,
        },
      ]);
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "inventory",
        aggregateId: command.payload.reclassificationId,
        action: "inventory.reclassified",
        transactionTime: command.occurredAt,
        recordedAt,
        before: {
          qualityGradeId: fromGrade.id,
          quantityScaled: decision.value,
          unit: command.payload.quantity.unit,
        },
        after: {
          qualityGradeId: toGrade.id,
          quantityScaled: decision.value,
          unit: command.payload.quantity.unit,
        },
        reason: command.payload.reason.trim(),
      });
      return ok({ reclassificationId: command.payload.reclassificationId });
    },
  });
}

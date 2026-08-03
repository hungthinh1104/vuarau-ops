import type {
  ConfirmPurchaseCommand,
  CreatePurchaseDraftCommand,
  DiscardPurchaseDraftCommand,
  PurchaseDto,
  UpdatePurchaseDraftCommand,
  VoidPurchaseCommand,
} from "@vuarau/domain-contracts";
import {
  confirmPurchaseCommandSchema,
  createPurchaseDraftCommandSchema,
  discardPurchaseDraftCommandSchema,
  updatePurchaseDraftCommandSchema,
  voidPurchaseCommandSchema,
} from "@vuarau/domain-contracts";
import {
  canVoidPurchase,
  decideConfirmPurchase,
  decideCreatePurchaseDraft,
  decideDiscardPurchase,
  decideUpdatePurchaseDraft,
  decideVoidPurchase,
  err,
  ok,
} from "@vuarau/domain-kernel";
import type { DomainResult, PurchaseState } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { applySupplierAccountEffects } from "../supplier/supplier-account-effects.ts";

const dto = (purchase: PurchaseState): PurchaseDto => ({
  ...purchase,
  lines: purchase.lines.map((line) => ({ ...line })),
  evidenceReferences: [...(purchase.evidenceReferences ?? [])],
  voidRecord:
    purchase.voidRecord === null
      ? null
      : {
          id: purchase.voidRecord.id,
          purchaseId: purchase.voidRecord.purchaseId,
          reasonCode: purchase.voidRecord.reasonCode,
          reason: purchase.voidRecord.reason,
          evidenceReferences: [...(purchase.voidRecord.evidenceReferences ?? [])],
          amount: purchase.voidRecord.amount,
          transactionTime: purchase.voidRecord.transactionTime,
          recordedAt: purchase.voidRecord.recordedAt,
        },
});

async function validateReferences(
  repos: Parameters<Parameters<typeof runCommand>[0]["execute"]>[0]["repos"],
  purchase: PurchaseState,
  requireActiveSupplier: boolean,
) {
  const supplier = await repos.suppliers.findById(purchase.workspaceId, purchase.supplierId);
  if (supplier === null) return err("SUPPLIER_NOT_FOUND", "No such supplier.");
  if (requireActiveSupplier && !supplier.isActive)
    return err("SUPPLIER_INACTIVE", "Inactive supplier cannot be used for a new Purchase.");
  for (const line of purchase.lines) {
    if ((await repos.products.findById(purchase.workspaceId, line.productId)) === null)
      return err("PRODUCT_NOT_FOUND", "Purchase Product is outside this workspace.");
  }
  return ok(undefined);
}

export function createPurchaseDraft(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<PurchaseDto>> {
  return runCommand<CreatePurchaseDraftCommand, PurchaseDto>({
    commandType: "CreatePurchaseDraft",
    schema: createPurchaseDraftCommandSchema,
    input,
    ctx,
    requiredPermission: "purchase.create",
    requiredWorkflows: ["purchasing"],
    execute: async ({ command, repos, recordedAt }) => {
      if (
        (await repos.purchases.findById(command.workspaceId, command.payload.purchaseId)) !== null
      )
        return err("PURCHASE_VERSION_CONFLICT", "Purchase identity already exists.");
      const decision = decideCreatePurchaseDraft(command, recordedAt);
      if (!decision.ok) return decision;
      if (decision.value.replacesPurchaseId !== null) {
        const original = await repos.purchases.findById(
          command.workspaceId,
          decision.value.replacesPurchaseId,
        );
        const existingReplacement = await repos.purchases.findReplacementOf(
          command.workspaceId,
          decision.value.replacesPurchaseId,
        );
        if (
          original === null ||
          original.status !== "confirmed" ||
          original.voidRecord === null ||
          existingReplacement !== null
        ) {
          return err(
            "PURCHASE_REPLACEMENT_INVALID",
            "Replacement requires one voided Purchase without an existing replacement.",
          );
        }
      }
      const refs = await validateReferences(repos, decision.value, true);
      if (!refs.ok) return refs;
      if (!(await repos.purchases.insert(decision.value))) {
        return decision.value.replacesPurchaseId === null
          ? err("PURCHASE_VERSION_CONFLICT", "Purchase identity already exists.")
          : err(
              "PURCHASE_REPLACEMENT_INVALID",
              "Replacement requires one voided Purchase without an existing replacement.",
            );
      }
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "purchase",
        aggregateId: decision.value.id,
        action: "purchase.draft_created",
        transactionTime: command.occurredAt,
        recordedAt,
        before: null,
        after: { status: "draft", version: 1 },
        reason: null,
      });
      return ok(dto(decision.value));
    },
  });
}

export function updatePurchaseDraft(ctx: CommandContext, input: unknown) {
  return runCommand<UpdatePurchaseDraftCommand, PurchaseDto>({
    commandType: "UpdatePurchaseDraft",
    schema: updatePurchaseDraftCommandSchema,
    input,
    ctx,
    requiredPermission: "purchase.update",
    requiredWorkflows: ["purchasing"],
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.purchases.findByIdForUpdate(
        command.workspaceId,
        command.payload.purchaseId,
      );
      if (current === null) return err("PURCHASE_NOT_FOUND", "No such Purchase.");
      const decision = decideUpdatePurchaseDraft(current, command, recordedAt);
      if (!decision.ok) return decision;
      const refs = await validateReferences(repos, decision.value, true);
      if (!refs.ok) return refs;
      if (!(await repos.purchases.updateDraft(decision.value, current.version, true)))
        return err("PURCHASE_VERSION_CONFLICT", "Purchase changed on the server.");
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "purchase",
        aggregateId: current.id,
        action: "purchase.draft_edited",
        transactionTime: command.occurredAt,
        recordedAt,
        before: { version: current.version },
        after: { version: decision.value.version },
        reason: null,
      });
      return ok(dto(decision.value));
    },
  });
}

export function discardPurchaseDraft(ctx: CommandContext, input: unknown) {
  return runCommand<DiscardPurchaseDraftCommand, PurchaseDto>({
    commandType: "DiscardPurchaseDraft",
    schema: discardPurchaseDraftCommandSchema,
    input,
    ctx,
    requiredPermission: "purchase.discard",
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.purchases.findByIdForUpdate(
        command.workspaceId,
        command.payload.purchaseId,
      );
      if (current === null) return err("PURCHASE_NOT_FOUND", "No such Purchase.");
      const decision = decideDiscardPurchase(current, command, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.purchases.updateDraft(decision.value, current.version, false)))
        return err("PURCHASE_VERSION_CONFLICT", "Purchase changed on the server.");
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "purchase",
        aggregateId: current.id,
        action: "purchase.discarded",
        transactionTime: command.occurredAt,
        recordedAt,
        before: { status: "draft" },
        after: { status: "discarded" },
        reason: command.payload.reason,
      });
      return ok(dto(decision.value));
    },
  });
}

export function confirmPurchase(ctx: CommandContext, input: unknown) {
  return runCommand<ConfirmPurchaseCommand, PurchaseDto>({
    commandType: "ConfirmPurchase",
    schema: confirmPurchaseCommandSchema,
    input,
    ctx,
    requiredPermission: "purchase.confirm",
    requiredWorkflows: ["purchasing"],
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.purchases.findByIdForUpdate(
        command.workspaceId,
        command.payload.purchaseId,
      );
      if (current === null) return err("PURCHASE_NOT_FOUND", "No such Purchase.");
      const refs = await validateReferences(repos, current, true);
      if (!refs.ok) return refs;
      const decision = decideConfirmPurchase(current, command, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.purchases.confirm(decision.value, current.version)))
        return err("PURCHASE_VERSION_CONFLICT", "Purchase changed on the server.");
      await applySupplierAccountEffects(
        repos,
        [
          {
            workspaceId: command.workspaceId,
            supplierId: decision.value.supplierId,
            amount: decision.value.totalAmount,
            sourceType: "purchase_confirmation",
            sourceId: decision.value.id,
            reversalOfEntryId: null,
            reasonCode: null,
            reason: null,
            transactionTime: decision.value.transactionTime,
            recordedAt,
            actorId: command.actorId,
            commandId: command.commandId,
          },
        ],
        decision.value.currency,
      );
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "purchase",
        aggregateId: current.id,
        action: "purchase.confirmed",
        transactionTime: command.occurredAt,
        recordedAt,
        before: { status: "draft" },
        after: { status: "confirmed", version: decision.value.version },
        reason: null,
      });
      return ok(dto(decision.value));
    },
  });
}

export function voidPurchase(ctx: CommandContext, input: unknown) {
  return runCommand<VoidPurchaseCommand, PurchaseDto>({
    commandType: "VoidPurchase",
    schema: voidPurchaseCommandSchema,
    input,
    ctx,
    requiredPermission: "purchase.void",
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.purchases.findByIdForUpdate(
        command.workspaceId,
        command.payload.purchaseId,
      );
      if (current === null) return err("PURCHASE_NOT_FOUND", "No such Purchase.");
      const received = await repos.purchaseReceipts.netReceivedByPurchaseLine(
        command.workspaceId,
        current.id,
      );
      const acceptedAfterInspection = await Promise.all(
        current.lines.map((line) =>
          repos.qualityDispositions.acceptedQuantityForPurchaseLine(
            command.workspaceId,
            line.lineId,
          ),
        ),
      );
      const hasActiveArrival = await repos.goodsArrivals.hasActiveForPurchase(
        command.workspaceId,
        current.id,
      );
      const voidCapability = canVoidPurchase({
        purchase: current,
        hasActiveReceipts:
          hasActiveArrival ||
          [...received.values()].some((quantity) => quantity > 0) ||
          acceptedAfterInspection.some((quantity) => (quantity?.valueScaled ?? 0) > 0),
      });
      if (!voidCapability.allowed) {
        const code = voidCapability.reasonCode ?? "PURCHASE_NOT_CONFIRMED";
        return err(
          code,
          code === "PURCHASE_HAS_ACTIVE_RECEIPTS"
            ? "Purchase correction is blocked after accepted Receiving."
            : code === "PURCHASE_ALREADY_VOIDED"
              ? "Purchase is already voided."
              : "Only a confirmed Purchase can be voided.",
          voidCapability.details,
        );
      }
      const decision = decideVoidPurchase(current, command, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.purchases.insertVoid(decision.value)))
        return err("PURCHASE_ALREADY_VOIDED", "Purchase is already voided.");
      await applySupplierAccountEffects(
        repos,
        [
          {
            workspaceId: command.workspaceId,
            supplierId: current.supplierId,
            amount: { amountMinor: -current.totalAmount.amountMinor, currency: current.currency },
            sourceType: "purchase_void",
            sourceId: decision.value.id,
            reversalOfEntryId: null,
            reasonCode: decision.value.reasonCode,
            reason: decision.value.reason,
            transactionTime: command.occurredAt,
            recordedAt,
            actorId: command.actorId,
            commandId: command.commandId,
          },
        ],
        current.currency,
      );
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "purchase",
        aggregateId: current.id,
        action: "purchase.voided",
        transactionTime: command.occurredAt,
        recordedAt,
        before: { financialState: "active" },
        after: { financialState: "voided" },
        reason: decision.value.reason,
      });
      return ok(dto({ ...current, voidRecord: decision.value }));
    },
  });
}

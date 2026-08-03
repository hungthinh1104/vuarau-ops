import type {
  ConfirmPurchaseCommand,
  CreatePurchaseDraftCommand,
  DiscardPurchaseDraftCommand,
  IsoInstant,
  PurchaseLineInput,
  UpdatePurchaseDraftCommand,
  VoidPurchaseCommand,
  Capability,
  PurchaseCorrectionPolicyDefinition,
  PurchaseVoidReasonCode,
  WorkspacePolicyDto,
  WorkspacePolicyVersionId,
} from "@vuarau/domain-contracts";
import { ALLOWED, denied } from "@vuarau/domain-contracts";
import {
  calculateLineTotal,
  isExactMoneyAmount,
  purchaseCorrectionPolicyDefinitionSchema,
} from "@vuarau/domain-contracts";
import type { PurchaseLineState, PurchaseState, PurchaseVoidState } from "../shared/state.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";
import { sumMoney, zeroMoney } from "../shared/money.ts";

export function validatePurchaseLines(
  lines: readonly PurchaseLineInput[],
  currency: PurchaseState["currency"],
): DomainResult<readonly PurchaseLineState[]> {
  const result: PurchaseLineState[] = [];
  for (const [index, line] of lines.entries()) {
    if (
      line.productName.trim().length === 0 ||
      line.quantity.valueScaled <= 0 ||
      !Number.isInteger(line.quantity.valueScaled) ||
      line.unitPrice.amountMinor < 0 ||
      !Number.isInteger(line.unitPrice.amountMinor)
    )
      return err("PURCHASE_LINE_INVALID", `Purchase line ${index} is invalid.`);
    if (line.unitPrice.currency !== currency)
      return err("PURCHASE_LINE_INVALID", `Purchase line ${index} currency does not match.`);
    const lineTotal = calculateLineTotal(line.quantity, line.unitPrice);
    if (!isExactMoneyAmount(lineTotal.amountMinor))
      return err("PURCHASE_LINE_INVALID", `Purchase line ${index} exceeds exact range.`);
    result.push({
      ...line,
      productName: line.productName.trim(),
      lineTotal,
    });
  }
  return ok(result);
}

const total = (lines: readonly PurchaseLineState[], currency: PurchaseState["currency"]) =>
  sumMoney(
    lines.map((line) => line.lineTotal),
    currency,
  );

export function decideCreatePurchaseDraft(
  command: CreatePurchaseDraftCommand,
  recordedAt: IsoInstant,
): DomainResult<PurchaseState> {
  const lines = validatePurchaseLines(command.payload.lines, command.payload.currency);
  if (!lines.ok) return lines;
  return ok({
    id: command.payload.purchaseId,
    workspaceId: command.workspaceId,
    supplierId: command.payload.supplierId,
    status: "draft",
    currency: command.payload.currency,
    lines: lines.value,
    totalAmount: total(lines.value, command.payload.currency),
    note: command.payload.note?.trim() || null,
    evidenceReferences: [...(command.payload.evidenceReferences ?? [])],
    dueAt: command.payload.dueAt,
    version: 1,
    transactionTime: command.occurredAt,
    recordedAt,
    confirmedAt: null,
    discardedAt: null,
    replacesPurchaseId: command.payload.replacesPurchaseId,
    voidRecord: null,
  });
}

export function decideUpdatePurchaseDraft(
  current: PurchaseState,
  command: UpdatePurchaseDraftCommand,
  recordedAt: IsoInstant,
): DomainResult<PurchaseState> {
  if (current.status === "confirmed")
    return err("PURCHASE_ALREADY_CONFIRMED", "Confirmed Purchase is immutable.");
  if (current.status === "discarded")
    return err("PURCHASE_ALREADY_DISCARDED", "Discarded Purchase cannot be edited.");
  if (current.version !== command.expectedVersion)
    return err("PURCHASE_VERSION_CONFLICT", "Purchase changed on the server.");
  const lines = validatePurchaseLines(command.payload.lines, command.payload.currency);
  if (!lines.ok) return lines;
  return ok({
    ...current,
    supplierId: command.payload.supplierId,
    currency: command.payload.currency,
    lines: lines.value,
    totalAmount: total(lines.value, command.payload.currency),
    note: command.payload.note?.trim() || null,
    evidenceReferences: [...(command.payload.evidenceReferences ?? [])],
    dueAt: command.payload.dueAt,
    version: current.version + 1,
    recordedAt,
  });
}

export function decideDiscardPurchase(
  current: PurchaseState,
  command: DiscardPurchaseDraftCommand,
  recordedAt: IsoInstant,
): DomainResult<PurchaseState> {
  if (current.status === "confirmed")
    return err("PURCHASE_ALREADY_CONFIRMED", "Confirmed Purchase cannot be discarded.");
  if (current.status === "discarded")
    return err("PURCHASE_ALREADY_DISCARDED", "Purchase is already discarded.");
  if (current.version !== command.expectedVersion)
    return err("PURCHASE_VERSION_CONFLICT", "Purchase changed on the server.");
  return ok({
    ...current,
    status: "discarded",
    version: current.version + 1,
    discardedAt: recordedAt,
  });
}

export function decideConfirmPurchase(
  current: PurchaseState,
  command: ConfirmPurchaseCommand,
  recordedAt: IsoInstant,
): DomainResult<PurchaseState> {
  if (current.status === "confirmed")
    return err("PURCHASE_ALREADY_CONFIRMED", "Purchase is already confirmed.");
  if (current.status === "discarded")
    return err("PURCHASE_ALREADY_DISCARDED", "Discarded Purchase cannot be confirmed.");
  if (current.version !== command.expectedVersion)
    return err("PURCHASE_VERSION_CONFLICT", "Purchase changed on the server.");
  if (current.lines.length === 0) return err("PURCHASE_EMPTY", "Purchase has no lines.");
  const lines = validatePurchaseLines(current.lines, current.currency);
  if (!lines.ok) return lines;
  return ok({
    ...current,
    lines: lines.value,
    totalAmount: total(lines.value, current.currency),
    status: "confirmed",
    version: current.version + 1,
    confirmedAt: recordedAt,
  });
}

export function canVoidPurchase(args: {
  readonly purchase: PurchaseState;
  readonly hasActiveReceipts: boolean;
  readonly reasonCode: PurchaseVoidReasonCode;
  readonly correctionPolicyVersionId?: WorkspacePolicyVersionId | null;
}): Capability {
  if (args.purchase.status !== "confirmed") return denied("PURCHASE_NOT_CONFIRMED");
  if (args.purchase.voidRecord !== null) return denied("PURCHASE_ALREADY_VOIDED");
  if (
    args.hasActiveReceipts &&
    (args.reasonCode !== "commercial_correction" || args.correctionPolicyVersionId == null)
  )
    return denied(
      args.reasonCode === "commercial_correction"
        ? "PURCHASE_CORRECTION_POLICY_UNAVAILABLE"
        : "PURCHASE_HAS_ACTIVE_RECEIPTS",
    );
  return ALLOWED;
}

/**
 * Resolve the only supported correction policy without inventing a global
 * fallback. A malformed, future or expired policy is unavailable and cannot
 * authorize a cross-dimension command.
 */
export function resolvePurchaseCorrectionPolicy(
  policies: readonly WorkspacePolicyDto[],
  asOf: IsoInstant,
): {
  readonly policyVersionId: WorkspacePolicyDto["id"];
  readonly definition: PurchaseCorrectionPolicyDefinition;
} | null {
  const candidates = policies
    .filter(
      (policy) =>
        policy.policyKind === "purchase_correction" &&
        policy.state === "approved" &&
        Date.parse(asOf) >= Date.parse(policy.effectiveFrom) &&
        (policy.effectiveTo === null || Date.parse(asOf) < Date.parse(policy.effectiveTo)),
    )
    .sort((left, right) => right.version - left.version);
  for (const policy of candidates) {
    const parsed = purchaseCorrectionPolicyDefinitionSchema.safeParse(policy.definition);
    if (parsed.success && parsed.data.parameters.afterReceiving === "commercial_replacement_only")
      return { policyVersionId: policy.id, definition: parsed.data };
  }
  return null;
}

export function decideVoidPurchase(
  purchase: PurchaseState,
  command: VoidPurchaseCommand,
  recordedAt: IsoInstant,
  policyVersionId: WorkspacePolicyVersionId | null = null,
): DomainResult<PurchaseVoidState> {
  if (purchase.status !== "confirmed")
    return err("PURCHASE_NOT_CONFIRMED", "Only a confirmed Purchase can be voided.");
  if (purchase.voidRecord !== null)
    return err("PURCHASE_ALREADY_VOIDED", "Purchase is already voided.");
  const reason = command.payload.reason.trim();
  if (reason.length === 0)
    return err("PURCHASE_VOID_REASON_REQUIRED", "Purchase void requires a reason.");
  return ok({
    id: command.payload.purchaseVoidId,
    workspaceId: command.workspaceId,
    purchaseId: purchase.id,
    reasonCode: command.payload.reasonCode,
    reason,
    evidenceReferences: [...(command.payload.evidenceReferences ?? [])],
    amount:
      purchase.totalAmount.amountMinor === 0 ? zeroMoney(purchase.currency) : purchase.totalAmount,
    policyVersionId,
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
  });
}

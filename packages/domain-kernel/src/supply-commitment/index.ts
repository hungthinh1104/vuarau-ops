import type {
  CancelSupplyCommitmentCommand,
  ConfirmSupplyCommitmentCommand,
  CreateSupplyCommitmentDraftCommand,
  IsoInstant,
  SupplyCommitmentCapabilities,
  SupplyCommitmentLineInput,
  UpdateSupplyCommitmentDraftCommand,
} from "@vuarau/domain-contracts";
import { ALLOWED, denied, calculateLineTotal, isExactMoneyAmount } from "@vuarau/domain-contracts";
import type { Decision } from "../shared/effects.ts";
import type { SupplyCommitmentLineState, SupplyCommitmentState } from "../shared/state.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";
import { sumMoney } from "../shared/money.ts";

function validateLines(
  lines: readonly SupplyCommitmentLineInput[],
  currency: SupplyCommitmentState["currency"],
): DomainResult<readonly SupplyCommitmentLineState[]> {
  const result: SupplyCommitmentLineState[] = [];
  for (const [index, line] of lines.entries()) {
    if (
      line.productName.trim().length === 0 ||
      line.quantity.valueScaled <= 0 ||
      !Number.isInteger(line.quantity.valueScaled)
    )
      return err("SUPPLY_COMMITMENT_LINE_INVALID", `Supply Commitment line ${index} is invalid.`, {
        index,
      });
    if (line.agreedUnitPrice !== null && line.agreedUnitPrice.currency !== currency)
      return err(
        "SUPPLY_COMMITMENT_CURRENCY_MISMATCH",
        "Supply Commitment price currency differs.",
      );
    if (line.agreedUnitPrice !== null && line.agreedUnitPrice.amountMinor < 0)
      return err("SUPPLY_COMMITMENT_LINE_INVALID", "Supply Commitment price is invalid.", {
        index,
      });
    const lineTotal =
      line.agreedUnitPrice === null
        ? null
        : calculateLineTotal(line.quantity, line.agreedUnitPrice);
    if (lineTotal !== null && !isExactMoneyAmount(lineTotal.amountMinor))
      return err("SUPPLY_COMMITMENT_LINE_INVALID", "Supply Commitment line exceeds exact range.", {
        index,
      });
    result.push({ ...line, productName: line.productName.trim(), lineTotal });
  }
  return ok(result);
}

function total(
  lines: readonly SupplyCommitmentLineState[],
  currency: SupplyCommitmentState["currency"],
) {
  return lines.length === 0 || lines.some((line) => line.lineTotal === null)
    ? null
    : sumMoney(
        lines.map((line) => line.lineTotal!),
        currency,
      );
}

function guardVersion(current: SupplyCommitmentState, expectedVersion: number): DomainResult<null> {
  return current.version === expectedVersion
    ? ok(null)
    : err("SUPPLY_COMMITMENT_VERSION_CONFLICT", "Supply Commitment changed on the server.", {
        supplyCommitmentId: current.id,
        expectedVersion,
        actualVersion: current.version,
      });
}

export function decideCreateSupplyCommitmentDraft(
  command: CreateSupplyCommitmentDraftCommand,
  recordedAt: IsoInstant,
): DomainResult<Decision<SupplyCommitmentState>> {
  const lines = validateLines(command.payload.lines, command.payload.currency);
  if (!lines.ok) return lines;
  const commitment: SupplyCommitmentState = {
    id: command.payload.supplyCommitmentId,
    workspaceId: command.workspaceId,
    supplierId: command.payload.supplierId,
    status: "draft",
    currency: command.payload.currency,
    lines: lines.value,
    totalAmount: total(lines.value, command.payload.currency),
    expectedArrivalAt: command.payload.expectedArrivalAt,
    paymentTermsSnapshot: command.payload.paymentTermsSnapshot,
    note: command.payload.note?.trim() || null,
    evidenceReferences: [...(command.payload.evidenceReferences ?? [])],
    version: 1,
    transactionTime: command.occurredAt,
    recordedAt,
    confirmedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    replacesSupplyCommitmentId: command.payload.replacesSupplyCommitmentId,
  };
  return ok({
    aggregate: commitment,
    accountEntries: [],
    audit: {
      aggregateType: "supply_commitment",
      aggregateId: commitment.id,
      action: "supply_commitment.draft_created",
      transactionTime: command.occurredAt,
      recordedAt,
      before: null,
      after: { status: commitment.status, lineCount: commitment.lines.length },
      reason: null,
    },
  });
}

export function decideUpdateSupplyCommitmentDraft(
  current: SupplyCommitmentState,
  command: UpdateSupplyCommitmentDraftCommand,
  recordedAt: IsoInstant,
): DomainResult<Decision<SupplyCommitmentState>> {
  const version = guardVersion(current, command.expectedVersion);
  if (!version.ok) return version;
  if (current.status === "confirmed")
    return err(
      "SUPPLY_COMMITMENT_ALREADY_CONFIRMED",
      "A confirmed Supply Commitment is immutable.",
    );
  if (current.status === "cancelled")
    return err(
      "SUPPLY_COMMITMENT_ALREADY_CANCELLED",
      "A cancelled Supply Commitment cannot be edited.",
    );
  const lines = validateLines(command.payload.lines, command.payload.currency);
  if (!lines.ok) return lines;
  const edited: SupplyCommitmentState = {
    ...current,
    supplierId: command.payload.supplierId,
    currency: command.payload.currency,
    lines: lines.value,
    totalAmount: total(lines.value, command.payload.currency),
    expectedArrivalAt: command.payload.expectedArrivalAt,
    paymentTermsSnapshot: command.payload.paymentTermsSnapshot,
    note: command.payload.note?.trim() || null,
    evidenceReferences: [...(command.payload.evidenceReferences ?? [])],
    version: current.version + 1,
    recordedAt,
  };
  return ok({
    aggregate: edited,
    accountEntries: [],
    audit: {
      aggregateType: "supply_commitment",
      aggregateId: current.id,
      action: "supply_commitment.draft_edited",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { version: current.version },
      after: { version: edited.version, lineCount: edited.lines.length },
      reason: null,
    },
  });
}

export function decideConfirmSupplyCommitment(
  current: SupplyCommitmentState,
  command: ConfirmSupplyCommitmentCommand,
  recordedAt: IsoInstant,
): DomainResult<Decision<SupplyCommitmentState>> {
  const version = guardVersion(current, command.expectedVersion);
  if (!version.ok) return version;
  if (current.status === "confirmed")
    return err("SUPPLY_COMMITMENT_ALREADY_CONFIRMED", "Supply Commitment is already confirmed.");
  if (current.status === "cancelled")
    return err(
      "SUPPLY_COMMITMENT_ALREADY_CANCELLED",
      "A cancelled Supply Commitment cannot be confirmed.",
    );
  if (current.lines.length === 0)
    return err("SUPPLY_COMMITMENT_EMPTY", "A Supply Commitment needs at least one line.");
  if (current.lines.some((line) => line.productId === null))
    return err(
      "SUPPLY_COMMITMENT_PRODUCT_REQUIRED",
      "Every confirmed line needs a catalogue Product.",
    );
  const confirmed: SupplyCommitmentState = {
    ...current,
    status: "confirmed",
    version: current.version + 1,
    confirmedAt: command.occurredAt,
  };
  return ok({
    aggregate: confirmed,
    accountEntries: [],
    audit: {
      aggregateType: "supply_commitment",
      aggregateId: current.id,
      action: "supply_commitment.confirmed",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { status: current.status, version: current.version },
      after: { status: confirmed.status, version: confirmed.version },
      reason: null,
    },
  });
}

export function decideCancelSupplyCommitment(
  current: SupplyCommitmentState,
  command: CancelSupplyCommitmentCommand,
  recordedAt: IsoInstant,
): DomainResult<Decision<SupplyCommitmentState>> {
  const version = guardVersion(current, command.expectedVersion);
  if (!version.ok) return version;
  if (current.status === "cancelled")
    return err("SUPPLY_COMMITMENT_ALREADY_CANCELLED", "Supply Commitment is already cancelled.");
  const cancelled: SupplyCommitmentState = {
    ...current,
    status: "cancelled",
    version: current.version + 1,
    cancelledAt: command.occurredAt,
    cancellationReason: command.payload.reason.trim(),
  };
  return ok({
    aggregate: cancelled,
    accountEntries: [],
    audit: {
      aggregateType: "supply_commitment",
      aggregateId: current.id,
      action: "supply_commitment.cancelled",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { status: current.status, version: current.version },
      after: { status: cancelled.status, version: cancelled.version },
      reason: cancelled.cancellationReason,
    },
  });
}

export function supplyCommitmentCapabilities(
  commitment: SupplyCommitmentState,
): SupplyCommitmentCapabilities {
  const terminal =
    commitment.status === "confirmed"
      ? denied("SUPPLY_COMMITMENT_ALREADY_CONFIRMED")
      : commitment.status === "cancelled"
        ? denied("SUPPLY_COMMITMENT_ALREADY_CANCELLED")
        : ALLOWED;
  return {
    edit: terminal,
    confirm: terminal,
    cancel:
      commitment.status === "cancelled" ? denied("SUPPLY_COMMITMENT_ALREADY_CANCELLED") : ALLOWED,
  } satisfies SupplyCommitmentCapabilities;
}

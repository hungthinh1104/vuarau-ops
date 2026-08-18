import type {
  DeliveryReturnSettlementDto,
  IsoInstant,
  RecordDeliveryReturnSettlementCommand,
} from "@vuarau/domain-contracts";
import type { AuditDraft } from "../shared/effects.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

export function decideRecordDeliveryReturnSettlement(
  command: RecordDeliveryReturnSettlementCommand,
  recordedAt: IsoInstant,
  target: DeliveryReturnSettlementDto | null,
  successorExists: boolean,
): DomainResult<{ settlement: DeliveryReturnSettlementDto; audit: AuditDraft }> {
  const { payload } = command;
  if (payload.caseKind === "decision" && payload.relatedSettlementId !== null) {
    return err(
      "DELIVERY_RETURN_SETTLEMENT_CORRECTION_LINK_INVALID",
      "A return settlement decision cannot link to an earlier settlement.",
    );
  }
  if (payload.caseKind === "correction" && payload.relatedSettlementId === null) {
    return err(
      "DELIVERY_RETURN_SETTLEMENT_CORRECTION_TARGET_REQUIRED",
      "A return settlement correction must identify the settlement it corrects.",
    );
  }
  if (payload.caseKind === "correction" && target === null) {
    return err(
      "DELIVERY_RETURN_SETTLEMENT_CORRECTION_TARGET_NOT_FOUND",
      "The return settlement being corrected was not found in this workspace.",
    );
  }
  if (payload.caseKind === "correction" && successorExists) {
    return err(
      "DELIVERY_RETURN_SETTLEMENT_CORRECTION_TARGET_ALREADY_CORRECTED",
      "Only the current return settlement chain tip may be corrected.",
    );
  }
  if (
    payload.caseKind === "correction" &&
    target !== null &&
    (target.returnId !== payload.returnId || target.outcome !== payload.outcome)
  ) {
    return err(
      "DELIVERY_RETURN_SETTLEMENT_RETURN_MISMATCH",
      "A return settlement correction must preserve its return and outcome.",
    );
  }

  const settlement: DeliveryReturnSettlementDto = {
    id: payload.settlementId,
    workspaceId: command.workspaceId,
    returnId: payload.returnId,
    caseKind: payload.caseKind,
    outcome: payload.outcome,
    reason: payload.reason,
    relatedSettlementId: payload.relatedSettlementId,
    evidenceReferences: [...payload.evidenceReferences],
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    commandId: command.commandId,
  };
  const audit: AuditDraft = {
    aggregateType: "delivery_return_settlement",
    aggregateId: settlement.id,
    action: "delivery_return_settlement.recorded",
    transactionTime: settlement.transactionTime,
    recordedAt,
    before: null,
    after: {
      returnId: settlement.returnId,
      caseKind: settlement.caseKind,
      outcome: settlement.outcome,
      relatedSettlementId: settlement.relatedSettlementId,
      moneyEffect: "none",
    },
    reason: settlement.reason,
  };
  return ok({ settlement, audit });
}

/**
 * Returns the current append-only settlement tip for one Delivery Return.
 * Lineage, not transaction time, decides which fact is current. Timestamp/id
 * ordering is only a deterministic corruption fallback when multiple tips
 * exist.
 */
export function currentDeliveryReturnSettlement(
  settlements: readonly DeliveryReturnSettlementDto[],
  returnId: DeliveryReturnSettlementDto["returnId"],
): DeliveryReturnSettlementDto | null {
  const candidates = settlements.filter((settlement) => settlement.returnId === returnId);
  if (candidates.length === 0) return null;
  const successorIds = new Set(
    candidates.flatMap((settlement) =>
      settlement.relatedSettlementId === null ? [] : [settlement.relatedSettlementId],
    ),
  );
  return (
    candidates
      .filter((settlement) => !successorIds.has(settlement.id))
      .toSorted((left, right) =>
        left.recordedAt === right.recordedAt
          ? right.id.localeCompare(left.id)
          : right.recordedAt.localeCompare(left.recordedAt),
      )[0] ?? null
  );
}

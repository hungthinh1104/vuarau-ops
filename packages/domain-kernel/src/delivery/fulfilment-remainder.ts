import type {
  FulfilmentRemainderCaseDto,
  IsoInstant,
  RecordFulfilmentRemainderCaseCommand,
} from "@vuarau/domain-contracts";
import type { AuditDraft } from "../shared/effects.ts";
import type { SaleState } from "../shared/state.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";
import { exactIntegerDifference } from "../shared/money.ts";

export function saleHasPositiveFulfilmentRemainder(
  sale: SaleState,
  fulfilment: ReadonlyMap<string, { readonly dispatched: number; readonly returned: number }>,
): boolean {
  return sale.lines.some((line) => {
    const fact = fulfilment.get(line.lineId);
    const netFulfilled = exactIntegerDifference(
      fact?.dispatched ?? 0,
      fact?.returned ?? 0,
      "fulfilment.remainder.net_fulfilled.quantity_scaled",
    );
    return (
      exactIntegerDifference(
        line.quantity.valueScaled,
        Math.max(0, netFulfilled),
        "fulfilment.remainder.quantity_scaled",
      ) > 0
    );
  });
}

export function decideRecordFulfilmentRemainderCase(args: {
  command: RecordFulfilmentRemainderCaseCommand;
  recordedAt: IsoInstant;
  sale: SaleState;
  positiveRemainder: boolean;
  latest: FulfilmentRemainderCaseDto | null;
  target: FulfilmentRemainderCaseDto | null;
  successorExists: boolean;
}): DomainResult<{ remainderCase: FulfilmentRemainderCaseDto; audit: AuditDraft }> {
  const { command, recordedAt, sale, positiveRemainder, latest, target, successorExists } = args;
  const { payload } = command;
  if (sale.status !== "posted" || sale.voidRecord !== null) {
    return err("FULFILMENT_REMAINDER_SALE_NOT_POSTED", "A remainder case needs a posted Sale.");
  }
  if (payload.caseKind === "opened") {
    if (payload.outcome !== null || payload.relatedCaseId !== null) {
      return err(
        "FULFILMENT_REMAINDER_DECISION_LINK_INVALID",
        "An opened remainder case has no outcome or correction link.",
      );
    }
    if (!positiveRemainder) {
      return err(
        "FULFILMENT_REMAINDER_NOT_PRESENT",
        "The Sale has no positive physical fulfilment remainder.",
      );
    }
    if (latest?.caseKind === "opened") {
      return err(
        "FULFILMENT_REMAINDER_CASE_ALREADY_OPEN",
        "This Sale already has an open remainder case.",
      );
    }
  }
  if (payload.caseKind === "decision") {
    if (payload.outcome === null) {
      return err("FULFILMENT_REMAINDER_OUTCOME_REQUIRED", "A remainder decision needs an outcome.");
    }
    if (payload.relatedCaseId !== null) {
      return err(
        "FULFILMENT_REMAINDER_DECISION_LINK_INVALID",
        "A remainder decision cannot link to another case.",
      );
    }
    if (latest?.caseKind !== "opened") {
      return err(
        "FULFILMENT_REMAINDER_DECISION_NOT_OPEN",
        "A remainder decision requires the current case to be open.",
      );
    }
  }
  if (payload.caseKind === "correction") {
    if (payload.outcome === null) {
      return err(
        "FULFILMENT_REMAINDER_OUTCOME_REQUIRED",
        "A remainder correction needs an outcome.",
      );
    }
    if (payload.relatedCaseId === null) {
      return err(
        "FULFILMENT_REMAINDER_CORRECTION_TARGET_REQUIRED",
        "A remainder correction must identify the case it corrects.",
      );
    }
    if (target === null) {
      return err(
        "FULFILMENT_REMAINDER_CORRECTION_TARGET_NOT_FOUND",
        "The remainder case being corrected was not found in this workspace.",
      );
    }
    if (target.saleId !== payload.saleId) {
      return err(
        "FULFILMENT_REMAINDER_SALE_MISMATCH",
        "A remainder correction must preserve the Sale.",
      );
    }
    if (target.caseKind === "opened") {
      return err(
        "FULFILMENT_REMAINDER_CORRECTION_TARGET_NOT_DECIDED",
        "Only a decided remainder case can be corrected.",
      );
    }
    if (successorExists) {
      return err(
        "FULFILMENT_REMAINDER_CORRECTION_TARGET_ALREADY_CORRECTED",
        "Only the current remainder case chain tip may be corrected.",
      );
    }
  }

  const remainderCase: FulfilmentRemainderCaseDto = {
    id: payload.fulfilmentRemainderCaseId,
    workspaceId: command.workspaceId,
    saleId: payload.saleId,
    caseKind: payload.caseKind,
    outcome: payload.outcome,
    reason: payload.reason,
    relatedCaseId: payload.relatedCaseId,
    evidenceReferences: [...payload.evidenceReferences],
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    commandId: command.commandId,
  };
  return ok({
    remainderCase,
    audit: {
      aggregateType: "fulfilment_remainder_case",
      aggregateId: remainderCase.id,
      action: "fulfilment_remainder_case.recorded",
      transactionTime: remainderCase.transactionTime,
      recordedAt,
      before: null,
      after: {
        saleId: remainderCase.saleId,
        caseKind: remainderCase.caseKind,
        outcome: remainderCase.outcome,
        relatedCaseId: remainderCase.relatedCaseId,
        effect: "fact_only",
      },
      reason: remainderCase.reason,
    },
  });
}

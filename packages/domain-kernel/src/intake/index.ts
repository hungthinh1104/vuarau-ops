import type {
  CreateQualityIssueCodeCommand,
  DeactivateQualityIssueCodeCommand,
  GoodsArrivalDto,
  GoodsArrivalLineInput,
  IsoInstant,
  QualityDispositionDto,
  QualityDispositionSourceSummaryDto,
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
import type { AuditDraft } from "../shared/effects.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

const positiveQuantity = (value: { valueScaled: number }): boolean => value.valueScaled > 0;

export function decideCreateQualityIssueCode(
  command: CreateQualityIssueCodeCommand,
  recordedAt: IsoInstant,
): DomainResult<{ code: QualityIssueCodeDto; audit: AuditDraft }> {
  const code: QualityIssueCodeDto = {
    id: command.payload.qualityIssueCodeId,
    workspaceId: command.workspaceId,
    code: command.payload.code,
    displayName: command.payload.displayName,
    category: command.payload.category,
    description: command.payload.description,
    isActive: true,
    version: 1,
    createdAt: recordedAt,
    updatedAt: recordedAt,
  };
  return ok({
    code,
    audit: {
      aggregateType: "quality_issue_code",
      aggregateId: code.id,
      action: "quality_issue_code.created",
      transactionTime: command.occurredAt,
      recordedAt,
      before: null,
      after: { code: code.code, category: code.category, version: code.version },
      reason: null,
    },
  });
}

export function decideUpdateQualityIssueCode(
  command: UpdateQualityIssueCodeCommand,
  current: QualityIssueCodeDto,
  recordedAt: IsoInstant,
): DomainResult<{ code: QualityIssueCodeDto; audit: AuditDraft }> {
  if (command.expectedVersion !== current.version) {
    return err("QUALITY_ISSUE_CODE_VERSION_CONFLICT", "Quality issue code changed on the server.", {
      expectedVersion: command.expectedVersion,
      actualVersion: current.version,
    });
  }
  const code = {
    ...current,
    code: command.payload.code,
    displayName: command.payload.displayName,
    category: command.payload.category,
    description: command.payload.description,
    version: current.version + 1,
    updatedAt: recordedAt,
  };
  return ok({
    code,
    audit: {
      aggregateType: "quality_issue_code",
      aggregateId: current.id,
      action: "quality_issue_code.updated",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { code: current.code, category: current.category, version: current.version },
      after: { code: code.code, category: code.category, version: code.version },
      reason: null,
    },
  });
}

export function decideQualityIssueCodeLifecycle(
  command: DeactivateQualityIssueCodeCommand | ReactivateQualityIssueCodeCommand,
  current: QualityIssueCodeDto,
  targetActive: boolean,
  recordedAt: IsoInstant,
): DomainResult<{ code: QualityIssueCodeDto; audit: AuditDraft }> {
  if (command.expectedVersion !== current.version) {
    return err("QUALITY_ISSUE_CODE_VERSION_CONFLICT", "Quality issue code changed on the server.");
  }
  if (current.isActive === targetActive) {
    return err(
      targetActive ? "QUALITY_ISSUE_CODE_ALREADY_ACTIVE" : "QUALITY_ISSUE_CODE_ALREADY_INACTIVE",
      targetActive
        ? "Quality issue code is already active."
        : "Quality issue code is already inactive.",
    );
  }
  const code = {
    ...current,
    isActive: targetActive,
    version: current.version + 1,
    updatedAt: recordedAt,
  };
  return ok({
    code,
    audit: {
      aggregateType: "quality_issue_code",
      aggregateId: current.id,
      action: targetActive ? "quality_issue_code.reactivated" : "quality_issue_code.deactivated",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { isActive: current.isActive, version: current.version },
      after: { isActive: code.isActive, version: code.version },
      reason: command.payload.reason,
    },
  });
}

export function decideRecordGoodsArrival(
  command: RecordGoodsArrivalCommand,
  recordedAt: IsoInstant,
): DomainResult<{ arrival: GoodsArrivalDto; audit: AuditDraft }> {
  for (const [index, line] of command.payload.lines.entries()) {
    if (!positiveQuantity(line.arrivedQuantity)) {
      return err("GOODS_ARRIVAL_LINE_INVALID", "Arrived quantity must be positive.", {
        lineIndex: index,
        arrivalLineId: line.arrivalLineId,
      });
    }
  }
  const arrival: GoodsArrivalDto = {
    id: command.payload.arrivalId,
    workspaceId: command.workspaceId,
    supplierId: command.payload.supplierId,
    purchaseId: command.payload.purchaseId,
    vehicleReference: command.payload.vehicleReference,
    lines: command.payload.lines,
    note: command.payload.note,
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    commandId: command.commandId,
    reversal: null,
  };
  return ok({
    arrival,
    audit: {
      aggregateType: "goods_arrival",
      aggregateId: arrival.id,
      action: "goods_arrival.recorded",
      transactionTime: command.occurredAt,
      recordedAt,
      before: null,
      after: {
        supplierId: arrival.supplierId,
        purchaseId: arrival.purchaseId,
        lineCount: arrival.lines.length,
      },
      reason: arrival.note,
    },
  });
}

export function decideReverseGoodsArrival(
  command: ReverseGoodsArrivalCommand,
  current: GoodsArrivalDto,
  downstreamFactCount: number,
  recordedAt: IsoInstant,
): DomainResult<{ arrival: GoodsArrivalDto; audit: AuditDraft }> {
  if (current.reversal !== null) {
    return err("GOODS_ARRIVAL_ALREADY_REVERSED", "Goods arrival is already reversed.");
  }
  if (downstreamFactCount > 0) {
    return err(
      "GOODS_ARRIVAL_HAS_DOWNSTREAM_FACTS",
      "Arrival with inspection or disposition facts cannot be reversed.",
      { downstreamFactCount },
    );
  }
  const arrival: GoodsArrivalDto = {
    ...current,
    reversal: {
      id: command.payload.reversalId,
      reason: command.payload.reason,
      transactionTime: command.occurredAt,
      recordedAt,
      actorId: command.actorId,
      commandId: command.commandId,
    },
  };
  return ok({
    arrival,
    audit: {
      aggregateType: "goods_arrival",
      aggregateId: current.id,
      action: "goods_arrival.reversed",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { reversed: false },
      after: { reversed: true },
      reason: command.payload.reason,
    },
  });
}

export function decideRecordQualityInspection(
  command: RecordQualityInspectionCommand,
  arrivalLine: GoodsArrivalLineInput,
  arrivalActive: boolean,
  recordedAt: IsoInstant,
): DomainResult<{ inspection: QualityInspectionDto; audit: AuditDraft }> {
  if (!arrivalActive) {
    return err("QUALITY_DISPOSITION_SOURCE_REVERSED", "Reversed arrival cannot be inspected.");
  }
  if (
    !positiveQuantity(command.payload.inspectedQuantity) ||
    command.payload.inspectedQuantity.unit !== arrivalLine.arrivedQuantity.unit ||
    command.payload.inspectedQuantity.valueScaled > arrivalLine.arrivedQuantity.valueScaled
  ) {
    return err(
      "QUALITY_INSPECTION_QUANTITY_EXCEEDS_ARRIVAL",
      "Inspected quantity must be positive and may not exceed the arrival line.",
    );
  }
  const issueIds = new Set<string>();
  for (const issue of command.payload.issues) {
    if (issueIds.has(issue.qualityIssueCodeId)) {
      return err("QUALITY_INSPECTION_INVALID", "Inspection issue codes must be unique.");
    }
    issueIds.add(issue.qualityIssueCodeId);
  }
  const inspection: QualityInspectionDto = {
    id: command.payload.inspectionId,
    workspaceId: command.workspaceId,
    arrivalLineId: command.payload.arrivalLineId,
    inspectedQuantity: command.payload.inspectedQuantity,
    issues: command.payload.issues,
    note: command.payload.note,
    evidenceReferences: command.payload.evidenceReferences,
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    commandId: command.commandId,
    reversal: null,
  };
  return ok({
    inspection,
    audit: {
      aggregateType: "quality_inspection",
      aggregateId: inspection.id,
      action: "quality_inspection.recorded",
      transactionTime: command.occurredAt,
      recordedAt,
      before: null,
      after: {
        arrivalLineId: inspection.arrivalLineId,
        issueCount: inspection.issues.length,
        inspectedQuantity: inspection.inspectedQuantity,
      },
      reason: inspection.note,
    },
  });
}

export function decideReverseQualityInspection(
  command: ReverseQualityInspectionCommand,
  current: QualityInspectionDto,
  recordedAt: IsoInstant,
): DomainResult<{ inspection: QualityInspectionDto; audit: AuditDraft }> {
  if (current.reversal !== null) {
    return err("QUALITY_INSPECTION_ALREADY_REVERSED", "Quality inspection is already reversed.");
  }
  const inspection = {
    ...current,
    reversal: {
      id: command.payload.reversalId,
      reason: command.payload.reason,
      transactionTime: command.occurredAt,
      recordedAt,
      actorId: command.actorId,
      commandId: command.commandId,
    },
  };
  return ok({
    inspection,
    audit: {
      aggregateType: "quality_inspection",
      aggregateId: current.id,
      action: "quality_inspection.reversed",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { reversed: false },
      after: { reversed: true },
      reason: command.payload.reason,
    },
  });
}

export function decideRecordQualityDisposition(
  command: RecordQualityDispositionCommand,
  source: QualityDispositionSourceSummaryDto,
  sourceActive: boolean,
  recordedAt: IsoInstant,
): DomainResult<{ disposition: QualityDispositionDto; audit: AuditDraft }> {
  if (!sourceActive) {
    return err("QUALITY_DISPOSITION_SOURCE_REVERSED", "Disposition source is reversed.");
  }
  let allocated = 0;
  const allocationIds = new Set<string>();
  for (const allocation of command.payload.allocations) {
    if (allocationIds.has(allocation.allocationId)) {
      return err("QUALITY_DISPOSITION_INVALID", "Disposition allocation ids must be unique.");
    }
    allocationIds.add(allocation.allocationId);
    if (
      !positiveQuantity(allocation.quantity) ||
      allocation.quantity.unit !== source.eligibleQuantity.unit
    ) {
      return err(
        "QUALITY_DISPOSITION_INVALID",
        "Disposition quantity must be positive and use the source unit.",
      );
    }
    if (
      command.payload.source.type === "quarantine_allocation" &&
      allocation.outcome === "quarantined"
    ) {
      return err(
        "QUALITY_DISPOSITION_INVALID",
        "Quarantined quantity cannot be quarantined again.",
      );
    }
    allocated += allocation.quantity.valueScaled;
  }
  if (allocated > source.eligibleQuantity.valueScaled) {
    return err(
      "QUALITY_DISPOSITION_QUANTITY_EXCEEDS_REMAINING",
      "Disposition exceeds source quantity remaining.",
      { requested: allocated, remaining: source.eligibleQuantity.valueScaled },
    );
  }
  const disposition: QualityDispositionDto = {
    id: command.payload.dispositionId,
    workspaceId: command.workspaceId,
    source: command.payload.source,
    allocations: command.payload.allocations,
    note: command.payload.note,
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    commandId: command.commandId,
    reversal: null,
  };
  return ok({
    disposition,
    audit: {
      aggregateType: "quality_disposition",
      aggregateId: disposition.id,
      action: "quality_disposition.recorded",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { sourceRemaining: source.remainingQuantity },
      after: {
        allocationCount: disposition.allocations.length,
        allocated: { valueScaled: allocated, unit: source.eligibleQuantity.unit },
      },
      reason: disposition.note,
    },
  });
}

export function decideReverseQualityDisposition(
  command: ReverseQualityDispositionCommand,
  current: QualityDispositionDto,
  downstreamFactCount: number,
  recordedAt: IsoInstant,
): DomainResult<{ disposition: QualityDispositionDto; audit: AuditDraft }> {
  if (current.reversal !== null) {
    return err("QUALITY_DISPOSITION_ALREADY_REVERSED", "Quality disposition is already reversed.");
  }
  if (downstreamFactCount > 0) {
    return err(
      "QUALITY_DISPOSITION_HAS_DOWNSTREAM_FACTS",
      "Disposition with downstream quarantine resolution cannot be reversed.",
      { downstreamFactCount },
    );
  }
  const disposition: QualityDispositionDto = {
    ...current,
    reversal: {
      id: command.payload.reversalId,
      reason: command.payload.reason,
      transactionTime: command.occurredAt,
      recordedAt,
      actorId: command.actorId,
      commandId: command.commandId,
    },
  };
  return ok({
    disposition,
    audit: {
      aggregateType: "quality_disposition",
      aggregateId: current.id,
      action: "quality_disposition.reversed",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { reversed: false },
      after: { reversed: true },
      reason: command.payload.reason,
    },
  });
}

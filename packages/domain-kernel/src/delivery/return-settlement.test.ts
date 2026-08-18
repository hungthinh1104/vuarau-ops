import type {
  DeliveryReturnSettlementDto,
  RecordDeliveryReturnSettlementCommand,
} from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import {
  currentDeliveryReturnSettlement,
  decideRecordDeliveryReturnSettlement,
} from "./return-settlement.ts";

const command = (overrides: Partial<RecordDeliveryReturnSettlementCommand> = {}) =>
  ({
    commandId: "00000000-0000-4000-8000-000000000101",
    idempotencyKey: "return-settlement-101",
    workspaceId: "00000000-0000-4000-8000-000000000001",
    actorId: "00000000-0000-4000-8000-000000000002",
    occurredAt: "2026-08-14T01:00:00.000Z",
    payload: {
      settlementId: "00000000-0000-4000-8000-000000000103",
      returnId: "00000000-0000-4000-8000-000000000104",
      caseKind: "decision",
      outcome: "goods_only",
      reason: "Kho hàng đã nhận lại, không phát sinh tiền.",
      relatedSettlementId: null,
      evidenceReferences: ["return-sheet://001"],
    },
    ...overrides,
  }) as unknown as RecordDeliveryReturnSettlementCommand;

const target: DeliveryReturnSettlementDto = {
  id: "00000000-0000-4000-8000-000000000103" as DeliveryReturnSettlementDto["id"],
  workspaceId: "00000000-0000-4000-8000-000000000001" as DeliveryReturnSettlementDto["workspaceId"],
  returnId: "00000000-0000-4000-8000-000000000104" as DeliveryReturnSettlementDto["returnId"],
  caseKind: "decision",
  outcome: "goods_only",
  reason: "Cũ",
  relatedSettlementId: null,
  evidenceReferences: [],
  transactionTime: "2026-08-14T01:00:00.000Z",
  recordedAt: "2026-08-14T01:00:01.000Z",
  actorId: "00000000-0000-4000-8000-000000000002" as DeliveryReturnSettlementDto["actorId"],
  commandId: "00000000-0000-4000-8000-000000000101" as DeliveryReturnSettlementDto["commandId"],
};

describe("return settlement decision", () => {
  it("selects the current lineage tip instead of the newest timestamp", () => {
    const correction = {
      ...target,
      id: "00000000-0000-4000-8000-000000000105" as DeliveryReturnSettlementDto["id"],
      caseKind: "correction" as const,
      relatedSettlementId: target.id,
      recordedAt: "2020-01-01T00:00:00.000Z" as DeliveryReturnSettlementDto["recordedAt"],
    };
    expect(currentDeliveryReturnSettlement([target, correction], target.returnId)).toBe(correction);
  });

  it("records goods-only as an explicit no-money fact", () => {
    const result = decideRecordDeliveryReturnSettlement(
      command(),
      "2026-08-14T01:00:01.000Z",
      null,
      false,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.settlement.outcome).toBe("goods_only");
    expect(result.value.audit.after).toMatchObject({ moneyEffect: "none" });
  });

  it("requires a current settlement tip for correction", () => {
    const result = decideRecordDeliveryReturnSettlement(
      command({
        payload: {
          ...command().payload,
          caseKind: "correction",
          relatedSettlementId: target.id,
        },
      }),
      "2026-08-14T02:00:01.000Z",
      target,
      true,
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe(
        "DELIVERY_RETURN_SETTLEMENT_CORRECTION_TARGET_ALREADY_CORRECTED",
      );
  });
});

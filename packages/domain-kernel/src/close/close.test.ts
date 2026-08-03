import { describe, expect, it } from "vitest";
import {
  cashAccountIdSchema,
  cashMovementIdSchema,
  cashStatementMatchIdSchema,
  commandIdSchema,
  operationalCloseIdSchema,
  reconciliationObservationIdSchema,
  recordCashStatementMatchCommandSchema,
  recordOperationalCloseCommandSchema,
  workspaceIdSchema,
} from "@vuarau/domain-contracts";
import { decideRecordCashStatementMatch, decideRecordOperationalClose } from "./index.ts";

const workspaceId = workspaceIdSchema.parse("00000000-0000-4000-8000-000000000a01");
const otherWorkspaceId = workspaceIdSchema.parse("00000000-0000-4000-8000-000000000a02");
const actorId = "00000000-0000-4000-8000-000000000b01" as never;
const occurredAt = "2026-07-20T05:00:00.000+07:00" as const;
const recordedAt = "2026-07-20T06:00:00.000+07:00" as const;

const observation = (kind: "cash_count" | "inventory_count", scopeWorkspaceId = workspaceId) => ({
  id: reconciliationObservationIdSchema.parse(crypto.randomUUID()),
  workspaceId: scopeWorkspaceId,
  kind,
  caseKind: "normal" as const,
  description: "Đối chiếu tại điểm kiểm soát.",
  participantWording: "Đã kiểm tra số liệu.",
  facts:
    kind === "cash_count"
      ? {
          expectedAmount: { amountMinor: 10_000, currency: "VND" as const },
          observedAmount: { amountMinor: 10_000, currency: "VND" as const },
          expectedQuantity: null,
          observedQuantity: null,
          itemCount: 1,
          productId: null,
          qualityGradeId: null,
          scopeReference: "cash://drawer",
        }
      : {
          expectedAmount: null,
          observedAmount: null,
          expectedQuantity: { valueScaled: 1_000, unit: "kg" as const },
          observedQuantity: { valueScaled: 900, unit: "kg" as const },
          itemCount: 1,
          productId: null,
          qualityGradeId: null,
          scopeReference: "warehouse://main",
        },
  evidenceReferences: ["photo://close/001"],
  relatedObservationId: null,
  transactionTime: occurredAt,
  recordedAt,
  actorId,
  commandId: commandIdSchema.parse(crypto.randomUUID()),
});

const closePolicy = {
  contractVersion: 1 as const,
  parameters: {
    strategy: "observation_signoff" as const,
    requiredObservationKinds: ["cash_count", "inventory_count"] as (
      "cash_count" | "inventory_count"
    )[],
    allowReopen: true,
  },
};

describe("close domain invariants", () => {
  it("requires one measurable observation for every configured scope", () => {
    const cash = observation("cash_count");
    const command = recordOperationalCloseCommandSchema.parse({
      commandId: crypto.randomUUID(),
      idempotencyKey: "close-domain-001",
      workspaceId,
      actorId,
      occurredAt,
      payload: {
        operationalCloseId: operationalCloseIdSchema.parse(crypto.randomUUID()),
        businessDate: "2026-07-20",
        observationIds: [cash.id],
        evidenceReferences: ["review://close/001"],
        reason: "Đối chiếu cuối ngày.",
      },
    });
    const result = decideRecordOperationalClose(
      command,
      [cash],
      closePolicy,
      crypto.randomUUID() as never,
      { start: "2026-07-19T17:00:00.000+07:00", end: occurredAt },
      recordedAt,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "OPERATIONAL_CLOSE_OBSERVATIONS_INVALID" },
    });
  });

  it("rejects observations from another workspace before creating a close", () => {
    const cash = observation("cash_count");
    const inventory = observation("inventory_count", otherWorkspaceId);
    const command = recordOperationalCloseCommandSchema.parse({
      commandId: crypto.randomUUID(),
      idempotencyKey: "close-domain-002",
      workspaceId,
      actorId,
      occurredAt,
      payload: {
        operationalCloseId: operationalCloseIdSchema.parse(crypto.randomUUID()),
        businessDate: "2026-07-20",
        observationIds: [cash.id, inventory.id],
        evidenceReferences: ["review://close/002"],
        reason: "Không được trộn workspace.",
      },
    });
    const result = decideRecordOperationalClose(
      command,
      [cash, inventory],
      closePolicy,
      crypto.randomUUID() as never,
      { start: "2026-07-19T17:00:00.000+07:00", end: occurredAt },
      recordedAt,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "WORKSPACE_ACCESS_DENIED" } });
  });

  it("requires exact account, amount and allowed source when matching a cash movement", () => {
    const command = recordCashStatementMatchCommandSchema.parse({
      commandId: crypto.randomUUID(),
      idempotencyKey: "close-domain-003",
      workspaceId,
      actorId,
      occurredAt,
      payload: {
        cashStatementMatchId: cashStatementMatchIdSchema.parse(crypto.randomUUID()),
        cashAccountId: cashAccountIdSchema.parse("90000000-0000-4000-8000-000000000001"),
        cashMovementId: cashMovementIdSchema.parse("90000000-0000-4000-8000-000000000901"),
        externalReference: "BANK-001",
        statementAt: occurredAt,
        amount: { amountMinor: 20_000, currency: "VND" },
        evidenceReferences: ["bank-statement://001"],
      },
    });
    const movement = {
      id: command.payload.cashMovementId,
      workspaceId,
      cashAccountId: command.payload.cashAccountId,
      amount: { amountMinor: 10_000, currency: "VND" as const },
      sourceType: "customer_payment" as const,
    };
    const result = decideRecordCashStatementMatch(
      command,
      movement,
      {
        contractVersion: 1,
        parameters: {
          strategy: "exact_cash_movement",
          allowedSourceTypes: ["customer_payment"],
          allowReverse: true,
        },
      },
      crypto.randomUUID() as never,
      null,
      recordedAt,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "CASH_STATEMENT_AMOUNT_MISMATCH" } });
  });
});

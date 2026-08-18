import type {
  FulfilmentRemainderCaseDto,
  RecordFulfilmentRemainderCaseCommand,
  SaleId,
  SaleLineId,
} from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import type { SaleState } from "../shared/state.ts";
import {
  currentFulfilmentRemainderCase,
  decideRecordFulfilmentRemainderCase,
  fulfilmentRemainderNeedsConsequence,
  saleHasPositiveFulfilmentRemainder,
} from "./fulfilment-remainder.ts";

const sale = {
  id: "00000000-0000-4000-8000-000000000901" as SaleId,
  workspaceId: "00000000-0000-4000-8000-000000000902",
  status: "posted",
  voidRecord: null,
  lines: [
    {
      lineId: "00000000-0000-4000-8000-000000000903" as SaleLineId,
      quantity: { valueScaled: 100_000, unit: "kg" },
    },
  ],
} as unknown as SaleState;

const command = (caseKind: "opened" | "decision" | "correction", overrides = {}) =>
  ({
    commandId: "00000000-0000-4000-8000-000000000904",
    idempotencyKey: "remainder-904",
    workspaceId: sale.workspaceId,
    actorId: "00000000-0000-4000-8000-000000000905",
    occurredAt: "2026-08-14T01:00:00.000Z",
    payload: {
      fulfilmentRemainderCaseId: "00000000-0000-4000-8000-000000000906",
      saleId: sale.id,
      caseKind,
      outcome: caseKind === "opened" ? null : "continue_fulfilment",
      reason: "Đã xác nhận phần còn lại.",
      relatedCaseId: null,
      evidenceReferences: ["review://remainder/001"],
      ...overrides,
    },
  }) as unknown as RecordFulfilmentRemainderCaseCommand;

const decisionTarget: FulfilmentRemainderCaseDto = {
  id: "00000000-0000-4000-8000-000000000906" as FulfilmentRemainderCaseDto["id"],
  workspaceId: sale.workspaceId as FulfilmentRemainderCaseDto["workspaceId"],
  saleId: sale.id,
  caseKind: "decision",
  outcome: "continue_fulfilment",
  reason: "Đã quyết định.",
  relatedCaseId: null,
  evidenceReferences: [],
  transactionTime: "2026-08-14T01:00:00.000Z",
  recordedAt: "2026-08-14T01:00:01.000Z",
  actorId: "00000000-0000-4000-8000-000000000905" as FulfilmentRemainderCaseDto["actorId"],
  commandId: "00000000-0000-4000-8000-000000000904" as FulfilmentRemainderCaseDto["commandId"],
};

describe("fulfilment remainder decision", () => {
  it("keeps a commercial correction unresolved until its consequence is recorded", () => {
    const decision = {
      ...decisionTarget,
      caseKind: "decision" as const,
      outcome: "commercial_correction" as const,
    };
    expect(fulfilmentRemainderNeedsConsequence(decision)).toBe(true);
    expect(
      fulfilmentRemainderNeedsConsequence({
        ...decision,
        outcome: "continue_fulfilment" as const,
      }),
    ).toBe(false);
    expect(
      fulfilmentRemainderNeedsConsequence({
        ...decision,
        outcome: "cancel_remainder" as const,
      }),
    ).toBe(false);
  });

  it("uses the chain tip when a correction carries an older business timestamp", () => {
    const opened = {
      ...decisionTarget,
      caseKind: "opened" as const,
      outcome: null,
      relatedCaseId: null,
    };
    const decision = {
      ...decisionTarget,
      id: "00000000-0000-4000-8000-000000000908" as FulfilmentRemainderCaseDto["id"],
      transactionTime: "2026-08-13T01:00:00.000Z",
      recordedAt: "2026-08-14T01:00:02.000Z",
      relatedCaseId: null,
    };
    const correction = {
      ...decisionTarget,
      id: "00000000-0000-4000-8000-000000000909" as FulfilmentRemainderCaseDto["id"],
      caseKind: "correction" as const,
      relatedCaseId: decision.id,
      transactionTime: "2026-08-12T01:00:00.000Z",
      recordedAt: "2026-08-14T01:00:03.000Z",
    };

    expect(currentFulfilmentRemainderCase([opened, decision, correction])).toEqual(correction);
  });

  it("only recognizes a positive remainder from physical fulfilment facts", () => {
    expect(saleHasPositiveFulfilmentRemainder(sale, new Map())).toBe(true);
    expect(
      saleHasPositiveFulfilmentRemainder(
        sale,
        new Map([[sale.lines[0]!.lineId, { dispatched: 100_000, returned: 0 }]]),
      ),
    ).toBe(false);
  });

  it("requires an opened fact before a decision and permits one current-tip correction", () => {
    const opened = decideRecordFulfilmentRemainderCase({
      command: command("opened"),
      recordedAt: "2026-08-14T01:00:01.000Z",
      sale,
      positiveRemainder: true,
      latest: null,
      target: null,
      successorExists: false,
    });
    expect(opened.ok).toBe(true);

    const decision = decideRecordFulfilmentRemainderCase({
      command: command("decision"),
      recordedAt: "2026-08-14T01:00:02.000Z",
      sale,
      positiveRemainder: true,
      latest: opened.ok ? opened.value.remainderCase : null,
      target: null,
      successorExists: false,
    });
    expect(decision.ok).toBe(true);

    const correction = decideRecordFulfilmentRemainderCase({
      command: command("correction", {
        relatedCaseId: decisionTarget.id,
        fulfilmentRemainderCaseId: "00000000-0000-4000-8000-000000000907",
      }),
      recordedAt: "2026-08-14T01:00:03.000Z",
      sale,
      positiveRemainder: true,
      latest: decisionTarget,
      target: decisionTarget,
      successorExists: false,
    });
    expect(correction.ok).toBe(true);

    const staleCorrection = decideRecordFulfilmentRemainderCase({
      command: command("correction", { relatedCaseId: decisionTarget.id }),
      recordedAt: "2026-08-14T01:00:04.000Z",
      sale,
      positiveRemainder: true,
      latest: decisionTarget,
      target: decisionTarget,
      successorExists: true,
    });
    expect(staleCorrection).toMatchObject({
      ok: false,
      error: { code: "FULFILMENT_REMAINDER_CORRECTION_TARGET_ALREADY_CORRECTED" },
    });
  });

  it("does not allow ordinary delivery state to manufacture an exception", () => {
    const result = decideRecordFulfilmentRemainderCase({
      command: command("opened"),
      recordedAt: "2026-08-14T01:00:01.000Z",
      sale,
      positiveRemainder: false,
      latest: null,
      target: null,
      successorExists: false,
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "FULFILMENT_REMAINDER_NOT_PRESENT" },
    });
  });
});

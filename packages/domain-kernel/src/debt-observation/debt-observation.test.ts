import { it } from "vitest";
import assert from "node:assert/strict";
import { recordDebtObservationCommandSchema } from "@vuarau/domain-contracts";
import { decideRecordDebtObservation } from "./index.ts";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const ACTOR = "00000000-0000-4000-8000-000000000002";
const RECORDED_AT = "2026-08-03T10:00:00.000Z";
const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

function command(overrides: Record<string, unknown> = {}) {
  return recordDebtObservationCommandSchema.parse({
    workspaceId: WORKSPACE,
    actorId: ACTOR,
    commandId: id("100"),
    occurredAt: RECORDED_AT,
    idempotencyKey: "debt-observation-1",
    payload: {
      debtObservationId: id("101"),
      kind: "agreed_due_date",
      caseKind: "normal",
      description: "Khách hẹn thanh toán sau chuyến giao.",
      participantWording: "Chiều thứ sáu tôi chuyển khoản.",
      facts: {
        amount: null,
        agreedDueAt: "2026-08-07T17:00:00.000Z",
        promiseToPayAt: null,
        termCode: null,
        termText: null,
        paymentReference: null,
        allocationProposal: null,
        customerId: null,
      },
      evidenceReferences: ["external://field/debt-001"],
      relatedObservationId: null,
    },
    ...overrides,
  });
}

it("TC-EVIDENCE-033 preserves debt evidence without a ledger effect", () => {
  const result = decideRecordDebtObservation(command(), RECORDED_AT, null, false);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.observation.facts.agreedDueAt, "2026-08-07T17:00:00.000Z");
  assert.equal(result.value.observation.facts.termText, null);
  assert.equal(result.value.audit.aggregateType, "debt_observation");
  assert.equal(result.value.audit.action, "debt_observation.recorded");
  assert.equal(result.value.audit.after === null || "overdue" in result.value.audit.after, false);
  assert.equal(
    result.value.audit.after === null || "ledgerEffect" in result.value.audit.after,
    false,
  );
});

it("TC-EVIDENCE-034 requires a same-workspace correction target", () => {
  const missing = decideRecordDebtObservation(
    command({
      payload: {
        ...command().payload,
        caseKind: "correction",
        relatedObservationId: id("102"),
      },
    }),
    RECORDED_AT,
    null,
    false,
  );
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error.code, "DEBT_OBSERVATION_CORRECTION_TARGET_NOT_FOUND");

  const target = decideRecordDebtObservation(
    command({ payload: { ...command().payload, debtObservationId: id("102") } }),
    RECORDED_AT,
    null,
    false,
  );
  assert.equal(target.ok, true);
  if (!target.ok) return;

  const linked = decideRecordDebtObservation(
    command({
      payload: {
        ...command().payload,
        caseKind: "correction",
        relatedObservationId: id("102"),
      },
    }),
    RECORDED_AT,
    target.value.observation,
    false,
  );
  assert.equal(linked.ok, true);
});

it("rejects hidden facts from another debt kind", () => {
  const result = decideRecordDebtObservation(
    command({
      payload: {
        ...command().payload,
        facts: { ...command().payload.facts, amount: { amountMinor: 1_000, currency: "VND" } },
      },
    }),
    RECORDED_AT,
    null,
    false,
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "OBSERVATION_FACT_NOT_ALLOWED");
});

it("rejects negative observation magnitude without writing a result", () => {
  const result = decideRecordDebtObservation(
    command({
      payload: {
        ...command().payload,
        kind: "promise_to_pay",
        facts: {
          ...command().payload.facts,
          amount: { amountMinor: -1, currency: "VND" },
          promiseToPayAt: RECORDED_AT,
        },
      },
    }),
    RECORDED_AT,
    null,
    false,
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "OBSERVATION_FACT_NEGATIVE");
});

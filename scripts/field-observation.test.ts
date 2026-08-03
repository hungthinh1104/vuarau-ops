import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessFieldObservationPacket,
  fieldObservationPacketSchema,
  readFieldObservationPacket,
} from "./field-observation.ts";

const validPacket = () => ({
  kind: "FIELD_OPERATIONAL_OBSERVATION" as const,
  packetVersion: 1 as const,
  createdAt: "2026-08-03T10:00:00.000Z",
  releaseOrProcessBoundary: "Field observation rehearsal",
  workspaceReference: "external://depot-a",
  observer: { role: "observer", name: "Field researcher" },
  observations: [
    {
      observationId: "obs-001",
      kind: "customer_order" as const,
      caseKind: "normal" as const,
      observedAt: "2026-08-03",
      description: "Khách gửi đơn ba dòng qua sổ giấy.",
      participantWording: "Ghi như sổ cũ là được.",
      evidenceReference: "external://notes/001",
    },
    {
      observationId: "obs-002",
      kind: "cost_observation" as const,
      caseKind: "partial_or_exception" as const,
      observedAt: "2026-08-03T10:15:00+07:00",
      description: "Người vận hành ghi riêng phí bao bì, chưa kết luận cách tính.",
      participantWording: "Phí này để cuối ngày tính.",
      evidenceReference: "external://notes/002",
    },
    {
      observationId: "obs-003",
      kind: "customer_order" as const,
      caseKind: "correction" as const,
      observedAt: "2026-08-03T10:20:00+07:00",
      description: "Sửa số lượng trên đơn giấy sau khi đối chiếu.",
      participantWording: "Dòng này ghi nhầm.",
      evidenceReference: "external://notes/003",
      relatedObservationId: "obs-001",
      canonicalReference: "external://paper/order-001",
    },
  ],
});

test("TC-OPS-017 accepts source-linked raw observations without inferring effects", () => {
  const result = readFieldObservationPacket(JSON.stringify(validPacket()));
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(assessFieldObservationPacket(result.packet), {
    observationCount: 3,
    kindCounts: {
      customer_order: 2,
      supply_commitment: 0,
      supplier_relationship_or_performance: 0,
      collection_or_arrival: 0,
      weighing: 0,
      inspection: 0,
      disposition: 0,
      sorting_or_grading: 0,
      packing: 0,
      packed_output: 0,
      order_allocation: 0,
      loading: 0,
      dispatch: 0,
      delivery_or_handover: 0,
      payment_or_cash_custody: 0,
      return: 0,
      claim_or_credit: 0,
      cost_observation: 1,
      pricing_observation: 0,
      reconciliation_observation: 0,
    },
    correctionCount: 1,
    canonicalReferenceCount: 1,
  });
  assert.equal(result.packet.observations[1]?.kind, "cost_observation");
});

test("TC-OPS-017 requires an evidence reference for every observation", () => {
  const packet = validPacket();
  packet.observations[0]!.evidenceReference = "";
  const result = readFieldObservationPacket(JSON.stringify(packet));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.problems.join("\n"), /evidenceReference/);
});

test("TC-OPS-017 rejects duplicate IDs and unlinked corrections", () => {
  const packet = validPacket();
  packet.observations[2]!.observationId = "obs-002";
  packet.observations[2]!.relatedObservationId = "missing";
  const result = readFieldObservationPacket(JSON.stringify(packet));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.problems.join("\n"), /unique/);
    assert.match(result.problems.join("\n"), /relatedObservationId/);
  }
});

test("TC-OPS-017 keeps policy closure separate from raw observation capture", () => {
  const result = fieldObservationPacketSchema.safeParse(validPacket());
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal("disposition" in result.data, false);
  assert.equal("canonicalEffect" in result.data.observations[0]!, false);
});

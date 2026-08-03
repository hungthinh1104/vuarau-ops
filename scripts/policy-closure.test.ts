import { test } from "node:test";
import assert from "node:assert/strict";
import {
  M24_POLICY_IDS,
  assessPolicyClosure,
  policyClosurePacketSchema,
  readPolicyClosurePacket,
} from "./policy-closure.ts";

const validEntry = (policyId: (typeof M24_POLICY_IDS)[number]) => ({
  policyId,
  participants: [{ role: "owner", name: "Chủ vựa" }],
  depotContext: "Vựa thật, ca sáng",
  observedAt: "2026-08-03",
  releaseOrProcessBoundary: "Next-phase field policy interview",
  cases: [
    {
      kind: "normal" as const,
      description: "Ca bình thường",
      evidenceReference: "external://normal",
    },
    {
      kind: "partial_or_exception" as const,
      description: "Ca một phần",
      evidenceReference: "external://partial",
    },
    {
      kind: "correction" as const,
      description: "Ca sửa sai",
      evidenceReference: "external://correction",
    },
  ],
  participantWording: "Lời người vận hành được ghi nguyên văn.",
  decisionSummary: "Chưa chốt; cần thêm bằng chứng.",
  canonicalEffect: "Chưa thay đổi canonical fact.",
  correctionPath: "Giữ blocked và dừng workflow nếu gặp.",
  reconciliation: "Đối chiếu với sổ vận hành bên ngoài.",
  evidenceReference: "external://signed-worksheet",
  disposition: "needs_more_evidence" as const,
  evidenceState: "proposed" as const,
});

function packet(overrides: Record<string, unknown> = {}) {
  return {
    kind: "M24_POLICY_CLOSURE" as const,
    packetVersion: 1 as const,
    createdAt: "2026-08-03T10:00:00.000Z",
    releaseOrProcessBoundary: "Next-phase field policy interview",
    items: M24_POLICY_IDS.map(validEntry),
    ...overrides,
  };
}

test("requires all ten policy questions and keeps an unanswered packet unresolved", () => {
  const result = readPolicyClosurePacket(JSON.stringify(packet()));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(assessPolicyClosure(result.packet), {
    policyDecisionReady: false,
    fieldValidated: false,
    productionAccepted: false,
    unresolved: M24_POLICY_IDS.map((policyId) => `${policyId}: needs_more_evidence`),
  });
});

test("does not confuse policy decision with field validation or production acceptance", () => {
  const result = policyClosurePacketSchema.safeParse({
    ...packet(),
    items: M24_POLICY_IDS.map((policyId) => ({
      ...validEntry(policyId),
      disposition: "decided_for_release",
      evidenceState: "policy_decided",
    })),
  });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(assessPolicyClosure(result.data), {
    policyDecisionReady: true,
    fieldValidated: false,
    productionAccepted: false,
    unresolved: [],
  });
});

test("rejects duplicate or missing policy identifiers", () => {
  const items = M24_POLICY_IDS.map(validEntry);
  items[1] = validEntry(M24_POLICY_IDS[0]);
  const result = readPolicyClosurePacket(JSON.stringify(packet({ items })));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.problems.join("\n"), /exactly once|missing ASM-040/);
});

test("requires normal, exception and correction evidence for every item", () => {
  const items = M24_POLICY_IDS.map(validEntry);
  items[0] = {
    ...items[0]!,
    cases: items[0]!.cases.filter((observedCase) => observedCase.kind !== "correction"),
  };
  const result = readPolicyClosurePacket(JSON.stringify(packet({ items })));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.problems.join("\n"), /missing correction case/);
});

test("rejects a decided disposition with only proposed evidence", () => {
  const items = M24_POLICY_IDS.map(validEntry);
  const modifiedItems = [
    { ...items[0]!, disposition: "decided_for_release" as const },
    ...items.slice(1),
  ];
  const result = readPolicyClosurePacket(JSON.stringify(packet({ items: modifiedItems })));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.problems.join("\n"), /policy_decided/);
});

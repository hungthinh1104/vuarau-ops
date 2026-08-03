import { describe, expect, it } from "vitest";
import type {
  CancelSupplyCommitmentCommand,
  ConfirmSupplyCommitmentCommand,
  CreateSupplyCommitmentDraftCommand,
} from "@vuarau/domain-contracts";
import { supplyCommitmentIdSchema, supplyCommitmentLineIdSchema } from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  COMMAND_ID,
  IDEMPOTENCY_KEY,
  PRODUCT_CA_CHUA_ID,
  RECORDED_AT,
  SUPPLIER_ID,
  TRANSACTION_TIME,
  WORKSPACE_ID,
  vnd,
} from "@vuarau/test-fixtures";
import {
  decideCancelSupplyCommitment,
  decideConfirmSupplyCommitment,
  decideCreateSupplyCommitmentDraft,
} from "./index.ts";

const COMMITMENT_ID = supplyCommitmentIdSchema.parse("44444444-4444-4444-8444-444444444444");
const LINE_ID = supplyCommitmentLineIdSchema.parse("55555555-5555-4555-8555-555555555555");
const line = {
  lineId: LINE_ID,
  productId: PRODUCT_CA_CHUA_ID,
  qualityGradeId: null,
  productName: "Cà chua",
  quantity: { valueScaled: 12_500, unit: "kg" as const },
  agreedUnitPrice: vnd(12_000),
};

function createCommand(
  overrides: Partial<CreateSupplyCommitmentDraftCommand["payload"]> = {},
): CreateSupplyCommitmentDraftCommand {
  return {
    commandId: COMMAND_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: TRANSACTION_TIME,
    payload: {
      supplyCommitmentId: COMMITMENT_ID,
      supplierId: SUPPLIER_ID,
      currency: "VND",
      lines: [line],
      expectedArrivalAt: "2026-01-08T05:00:00.000Z",
      paymentTermsSnapshot: { label: "Net 7", dueAt: "2026-01-08T05:00:00.000Z" },
      note: null,
      evidenceReferences: [],
      replacesSupplyCommitmentId: null,
      ...overrides,
    },
  };
}

function versioned(expectedVersion: number): ConfirmSupplyCommitmentCommand {
  return {
    commandId: COMMAND_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: TRANSACTION_TIME,
    expectedVersion,
    payload: { supplyCommitmentId: COMMITMENT_ID },
  };
}

describe("BR-SUPPLY-COMMITMENT-001 / TC-SUPPLY-COMMITMENT-001", () => {
  it("TC-SUPPLY-COMMITMENT-001 keeps a commitment commercial-only and exact", () => {
    const result = decideCreateSupplyCommitmentDraft(
      createCommand({ lines: [{ ...line, agreedUnitPrice: null }] }),
      RECORDED_AT,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.aggregate.totalAmount).toBeNull();
    expect(result.value.accountEntries).toEqual([]);
    expect(result.value.aggregate.status).toBe("draft");
  });

  it("TC-SUPPLY-COMMITMENT-002 requires a catalogue product at confirmation", () => {
    const draft = decideCreateSupplyCommitmentDraft(
      createCommand({ lines: [{ ...line, productId: null }] }),
      RECORDED_AT,
    );
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const result = decideConfirmSupplyCommitment(
      draft.value.aggregate,
      versioned(draft.value.aggregate.version),
      RECORDED_AT,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SUPPLY_COMMITMENT_PRODUCT_REQUIRED");
  });

  it("TC-SUPPLY-COMMITMENT-003 confirms, cancels and never creates a financial effect", () => {
    const draft = decideCreateSupplyCommitmentDraft(createCommand(), RECORDED_AT);
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const confirmed = decideConfirmSupplyCommitment(
      draft.value.aggregate,
      versioned(draft.value.aggregate.version),
      RECORDED_AT,
    );
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.value.aggregate.totalAmount).toEqual(vnd(150_000));
    const cancelled = decideCancelSupplyCommitment(
      confirmed.value.aggregate,
      {
        ...versioned(confirmed.value.aggregate.version),
        payload: { supplyCommitmentId: COMMITMENT_ID, reason: "Nhà vườn đổi lịch" },
      } satisfies CancelSupplyCommitmentCommand,
      RECORDED_AT,
    );
    expect(cancelled.ok).toBe(true);
    if (cancelled.ok) expect(cancelled.value.accountEntries).toEqual([]);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTOR_ID,
  COMMAND_ID,
  FOREIGN_ACTOR_ID,
  IDEMPOTENCY_KEY,
  OTHER_IDEMPOTENCY_KEY,
  PRODUCT_CA_CHUA_ID,
  SECOND_COMMAND_ID,
  SUPPLIER_ID,
  THIRD_COMMAND_ID,
  TRANSACTION_TIME,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import { supplyCommitmentIdSchema } from "@vuarau/domain-contracts";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import {
  cancelSupplyCommitment,
  confirmSupplyCommitment,
  createSupplyCommitmentDraft,
} from "./supply-commitment.handlers.ts";
import { getSupplyCommitment, listSupplyCommitments } from "./supply-commitment.queries.ts";

let harness: Harness;
const COMMITMENT_ID = supplyCommitmentIdSchema.parse("44444444-4444-4444-8444-444444444444");
const LINE_ID = "55555555-5555-4555-8555-555555555555";

beforeEach(() => {
  harness = createHarness();
});

const createInput = (overrides: Record<string, unknown> = {}) => ({
  commandId: COMMAND_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: TRANSACTION_TIME,
  payload: {
    supplyCommitmentId: COMMITMENT_ID,
    supplierId: SUPPLIER_ID,
    currency: "VND",
    lines: [
      {
        lineId: LINE_ID,
        productId: PRODUCT_CA_CHUA_ID,
        qualityGradeId: null,
        productName: "Cà chua",
        quantity: { valueScaled: 12_500, unit: "kg" },
        agreedUnitPrice: { amountMinor: 12_000, currency: "VND" },
      },
    ],
    expectedArrivalAt: "2026-01-08T05:00:00.000Z",
    paymentTermsSnapshot: { label: "Net 7", dueAt: "2026-01-08T05:00:00.000Z" },
    note: null,
    evidenceReferences: [],
    replacesSupplyCommitmentId: null,
    ...overrides,
  },
});

const commandInput = (
  payload: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) => ({
  commandId: SECOND_COMMAND_ID,
  idempotencyKey: OTHER_IDEMPOTENCY_KEY,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: TRANSACTION_TIME,
  ...overrides,
  payload,
});

describe("BR-SUPPLY-COMMITMENT-005 / TC-SUPPLY-COMMITMENT-004", () => {
  it("TC-SUPPLY-COMMITMENT-004 replays a create and leaves customer and supplier ledgers untouched", async () => {
    const first = await createSupplyCommitmentDraft(harness.ctx, createInput());
    const retry = await createSupplyCommitmentDraft(harness.ctx, createInput());
    expect(first.ok).toBe(true);
    expect(retry).toEqual(first);
    expect(harness.db.accountEntries()).toHaveLength(0);
    expect(harness.db.supplierAccountEntries()).toHaveLength(0);
  });

  it("TC-SUPPLY-COMMITMENT-005 confirms, reads through the scoped list and cancels", async () => {
    await createSupplyCommitmentDraft(harness.ctx, createInput());
    const confirmed = await confirmSupplyCommitment(harness.ctx, {
      ...commandInput({ supplyCommitmentId: COMMITMENT_ID }, { expectedVersion: 1 }),
    });
    expect(confirmed.ok).toBe(true);
    expect(confirmed.ok && confirmed.value.status).toBe("confirmed");
    const listed = await listSupplyCommitments(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      supplierId: SUPPLIER_ID,
      status: "confirmed",
      cursor: null,
      limit: 20,
    });
    expect(listed.ok && listed.value.items.map((item) => item.id)).toContain(COMMITMENT_ID);
    const cancelled = await cancelSupplyCommitment(harness.ctx, {
      ...commandInput(
        { supplyCommitmentId: COMMITMENT_ID, reason: "Nhà vườn đổi lịch" },
        {
          expectedVersion: 2,
          commandId: THIRD_COMMAND_ID,
          idempotencyKey: "supply-commitment-cancel-0001",
        },
      ),
    });
    expect(cancelled.ok && cancelled.value.status).toBe("cancelled");
  });

  it("TC-SUPPLY-COMMITMENT-006 does not disclose a commitment to another workspace actor", async () => {
    const result = await createSupplyCommitmentDraft(harness.contextFor(FOREIGN_ACTOR_ID), {
      ...createInput(),
      actorId: FOREIGN_ACTOR_ID,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("WORKSPACE_ACCESS_DENIED");
    const read = await getSupplyCommitment(harness.ctx, {
      workspaceId: "00000000-0000-4000-8000-000000000002" as typeof WORKSPACE_ID,
      supplyCommitmentId: COMMITMENT_ID,
    });
    expect(read.ok).toBe(false);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import {
  cashAccountIdSchema,
  cashMovementIdSchema,
  defaultWorkspaceOperationalProfile,
  operationalCloseIdSchema,
  type ReconciliationObservationId,
} from "@vuarau/domain-contracts";
import { ACTOR_ID, activeCustomer, TRANSACTION_TIME, WORKSPACE_ID } from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { approveWorkspacePolicy, createWorkspacePolicyDraft } from "../policy/policy.handlers.ts";
import { recordReconciliationObservation } from "../evidence/evidence.handlers.ts";
import { createCashAccount } from "../cash/cash.handlers.ts";
import { recordCustomerPayment } from "../payment/record-payment.handler.ts";
import {
  recordOperationalClose,
  reopenOperationalClose,
  recordCashStatementMatch,
  reverseCashStatementMatch,
} from "./close.handlers.ts";
import { getOperationalClose, getCashStatementMatch } from "./close.queries.ts";

let harness: Harness;
let sequence = 0;
const bank = cashAccountIdSchema.parse("90000000-0000-4000-8000-000000000090");

const uuid = <T extends string>(): T => crypto.randomUUID() as T;
const envelope = (label: string) => ({
  commandId: uuid(),
  idempotencyKey: `close-${label}-${++sequence}`,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: TRANSACTION_TIME,
});

async function approvePolicy(
  policyKind: "operating_cycle_reconciliation" | "cash_custody_deposit",
  definition: Record<string, unknown>,
) {
  const policyVersionId = uuid();
  expect(
    await createWorkspacePolicyDraft(harness.ctx, {
      ...envelope("policy-draft"),
      payload: {
        policyVersionId,
        policyKind,
        version: 1,
        effectiveFrom: "2026-07-01T00:00:00.000Z",
        effectiveTo: null,
        definition,
        evidenceReferences: [],
        reason: "Thiết lập chính sách kiểm thử.",
      },
    }),
  ).toMatchObject({ ok: true });
  expect(
    await approveWorkspacePolicy(harness.ctx, {
      ...envelope("policy-approve"),
      payload: {
        policyVersionId,
        evidenceReferences: ["policy://close/approval"],
        reason: "Đã phê duyệt chính sách.",
      },
    }),
  ).toMatchObject({ ok: true });
  return policyVersionId;
}

async function recordObservation(
  kind: "cash_count" | "inventory_count",
): Promise<ReconciliationObservationId> {
  const id = uuid<ReconciliationObservationId>();
  const result = await recordReconciliationObservation(harness.ctx, {
    ...envelope(`observation-${kind}`),
    payload: {
      reconciliationObservationId: id,
      kind,
      caseKind: "normal",
      description: `Đối chiếu ${kind}.`,
      participantWording: "Đã kiểm tra và ghi nhận số liệu.",
      facts:
        kind === "cash_count"
          ? {
              expectedAmount: { amountMinor: 500_000, currency: "VND" },
              observedAmount: { amountMinor: 500_000, currency: "VND" },
              expectedQuantity: null,
              observedQuantity: null,
              itemCount: 1,
              productId: null,
              qualityGradeId: null,
              scopeReference: "cash://bank/090",
            }
          : {
              expectedAmount: null,
              observedAmount: null,
              expectedQuantity: { valueScaled: 10_000, unit: "kg" },
              observedQuantity: { valueScaled: 9_500, unit: "kg" },
              itemCount: 1,
              productId: null,
              qualityGradeId: null,
              scopeReference: "warehouse://main",
            },
      evidenceReferences: [`photo://close/${kind}`],
      relatedObservationId: null,
    },
  });
  expect(result).toMatchObject({ ok: true });
  return id;
}

beforeEach(() => {
  sequence = 0;
  harness = createHarness();
  harness.db.setOperationalProfile({
    ...defaultWorkspaceOperationalProfile(WORKSPACE_ID),
    cashbookMode: "accounts_ledger",
    version: 2,
  });
});

describe("operational close", () => {
  it("fails closed without an approved policy and requires the configured observations", async () => {
    const noPolicy = await recordOperationalClose(harness.ctx, {
      ...envelope("no-policy"),
      payload: {
        operationalCloseId: uuid(),
        businessDate: "2026-07-20",
        observationIds: [uuid(), uuid()],
        evidenceReferences: ["review://close/no-policy"],
        reason: "Thử đóng ca.",
      },
    });
    expect(noPolicy).toMatchObject({
      ok: false,
      error: { code: "OPERATIONAL_CLOSE_POLICY_UNAVAILABLE" },
    });

    await approvePolicy("operating_cycle_reconciliation", {
      contractVersion: 1,
      parameters: {
        strategy: "observation_signoff",
        requiredObservationKinds: ["cash_count", "inventory_count"],
        allowReopen: true,
      },
    });
    const cash = await recordObservation("cash_count");
    const invalid = await recordOperationalClose(harness.ctx, {
      ...envelope("missing-observation"),
      payload: {
        operationalCloseId: uuid(),
        businessDate: "2026-07-20",
        observationIds: [cash],
        evidenceReferences: ["review://close/missing"],
        reason: "Thiếu phạm vi tồn kho.",
      },
    });
    expect(invalid).toMatchObject({
      ok: false,
      error: { code: "OPERATIONAL_CLOSE_OBSERVATIONS_INVALID" },
    });
  });

  it("records one signoff per business date and reopens through an expected-version transition", async () => {
    const policyVersionId = await approvePolicy("operating_cycle_reconciliation", {
      contractVersion: 1,
      parameters: {
        strategy: "observation_signoff",
        requiredObservationKinds: ["cash_count", "inventory_count"],
        allowReopen: true,
      },
    });
    const observationIds = [
      await recordObservation("cash_count"),
      await recordObservation("inventory_count"),
    ];
    const operationalCloseId = operationalCloseIdSchema.parse(uuid());
    const command = {
      ...envelope("record"),
      payload: {
        operationalCloseId,
        businessDate: "2026-07-20",
        observationIds,
        evidenceReferences: ["review://close/001"],
        reason: "Đã đối chiếu cuối ngày.",
      },
    };
    const recorded = await recordOperationalClose(harness.ctx, command);
    expect(recorded).toMatchObject({
      ok: true,
      value: {
        id: operationalCloseId,
        state: "closed",
        version: 1,
        policyVersionId,
        period: { start: "2026-07-19T17:00:00.000Z", end: "2026-07-20T17:00:00.000Z" },
      },
    });
    const duplicateDate = await recordOperationalClose(harness.ctx, {
      ...envelope("duplicate-date"),
      payload: { ...command.payload, operationalCloseId: uuid() },
    });
    expect(duplicateDate).toMatchObject({
      ok: false,
      error: { code: "OPERATIONAL_CLOSE_ALREADY_EXISTS" },
    });

    const reopened = await reopenOperationalClose(harness.ctx, {
      ...envelope("reopen"),
      expectedVersion: 1,
      payload: {
        operationalCloseId,
        reopenId: uuid(),
        evidenceReferences: ["review://close/reopen"],
        reason: "Mở lại để xử lý chênh lệch.",
      },
    });
    expect(reopened).toMatchObject({ ok: true, value: { state: "reopened", version: 2 } });
    const stale = await reopenOperationalClose(harness.ctx, {
      ...envelope("stale-reopen"),
      expectedVersion: 1,
      payload: {
        operationalCloseId,
        reopenId: uuid(),
        evidenceReferences: ["review://close/stale"],
        reason: "Lệnh cũ.",
      },
    });
    expect(stale).toMatchObject({
      ok: false,
      error: { code: "OPERATIONAL_CLOSE_VERSION_CONFLICT" },
    });
    const read = await getOperationalClose(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      operationalCloseId,
    });
    expect(read).toMatchObject({ ok: true, value: { state: "reopened", version: 2 } });
  });
});

describe("cash statement matching", () => {
  it("matches exact cash movement identity, retries without a second effect, and reverses only the match", async () => {
    const policyVersionId = await approvePolicy("cash_custody_deposit", {
      contractVersion: 1,
      parameters: {
        strategy: "exact_cash_movement",
        allowedSourceTypes: ["customer_payment"],
        allowReverse: true,
      },
    });
    expect(
      await createCashAccount(harness.ctx, {
        ...envelope("account"),
        payload: {
          cashAccountId: bank,
          displayName: "Ngân hàng kiểm thử",
          kind: "bank",
          currency: "VND",
          custodianActorId: null,
          note: null,
        },
      }),
    ).toMatchObject({ ok: true });
    const payment = await recordCustomerPayment(harness.ctx, {
      ...envelope("payment"),
      payload: {
        paymentId: uuid(),
        customerId: activeCustomer.id,
        amount: { amountMinor: 500_000, currency: "VND" },
        method: "cash",
        cashAccountId: bank,
        payerName: null,
        note: "Tiền vào ngân hàng.",
      },
    });
    expect(payment).toMatchObject({ ok: true });
    if (!payment.ok) return;
    const balanceBefore = harness.db.cashBalanceFor(WORKSPACE_ID, bank)?.balance.amountMinor;
    const command = {
      ...envelope("match"),
      payload: {
        cashStatementMatchId: uuid(),
        cashAccountId: bank,
        cashMovementId:
          harness.db
            .cashMovementRecords()
            .find((movement) => movement.sourceId === payment.value.id)?.id ??
          cashMovementIdSchema.parse(uuid()),
        externalReference: "BANK-STATEMENT-001",
        statementAt: TRANSACTION_TIME,
        amount: { amountMinor: 500_000, currency: "VND" },
        evidenceReferences: ["bank-statement://001"],
      },
    };
    const matched = await recordCashStatementMatch(harness.ctx, command);
    expect(matched).toMatchObject({
      ok: true,
      value: { policyVersionId, version: 1, reversal: null },
    });
    const replay = await recordCashStatementMatch(harness.ctx, command);
    expect(replay).toEqual(matched);
    expect(harness.db.cashBalanceFor(WORKSPACE_ID, bank)?.balance.amountMinor).toBe(balanceBefore);

    if (!matched.ok) return;
    const reversed = await reverseCashStatementMatch(harness.ctx, {
      ...envelope("reverse"),
      expectedVersion: 1,
      payload: {
        cashStatementMatchId: matched.value.id,
        reversalId: uuid(),
        evidenceReferences: ["bank-statement://reversal-001"],
        reason: "Đối chiếu nhầm chứng từ.",
      },
    });
    expect(reversed).toMatchObject({
      ok: true,
      value: { version: 2, reversal: { reason: "Đối chiếu nhầm chứng từ." } },
    });
    expect(harness.db.cashBalanceFor(WORKSPACE_ID, bank)?.balance.amountMinor).toBe(balanceBefore);
    const read = await getCashStatementMatch(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      cashStatementMatchId: matched.value.id,
    });
    expect(read).toMatchObject({
      ok: true,
      value: { version: 2, reversal: { id: expect.any(String) } },
    });
  });
});

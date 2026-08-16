import { beforeEach, describe, expect, it } from "vitest";
import {
  cashAccountIdSchema,
  cashMovementIdSchema,
  defaultWorkspaceOperationalProfile,
  operationalCloseIdSchema,
  type DeliveryId,
  type DeliveryLineId,
  type FulfilmentRemainderCaseId,
  type ReconciliationObservationId,
  type SaleId,
  type SaleLineId,
} from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  activeCustomer,
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  TRANSACTION_TIME,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { approveWorkspacePolicy, createWorkspacePolicyDraft } from "../policy/policy.handlers.ts";
import { recordReconciliationObservation } from "../evidence/evidence.handlers.ts";
import { createSaleDraft } from "../sale/create-sale-draft.handler.ts";
import { postSale } from "../sale/post-sale.handler.ts";
import {
  createDeliveryDraft,
  dispatchDelivery,
  recordFulfilmentRemainderCase,
} from "../delivery/delivery.handlers.ts";
import { getOperationsBoard } from "../dashboard/dashboard.queries.ts";
import { createCashAccount } from "../cash/cash.handlers.ts";
import { recordCustomerPayment } from "../payment/record-payment.handler.ts";
import {
  recordOperationalClose,
  recordOperationalCloseExceptionAcknowledgement,
  reopenOperationalClose,
  recordCashStatementMatch,
  reverseCashStatementMatch,
} from "./close.handlers.ts";
import {
  getOperationalClose,
  getOperationalCloseReadiness,
  getCashStatementMatch,
} from "./close.queries.ts";

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

// TC-CLOSE-002 TC-CLOSE-003
describe("operational close", () => {
  it("TC-CLOSE-009 — persists a source-linked acknowledgement without clearing the unresolved exception", async () => {
    await approvePolicy("operating_cycle_reconciliation", {
      contractVersion: 1,
      parameters: {
        strategy: "observation_signoff",
        requiredObservationKinds: ["cash_count"],
        allowReopen: true,
      },
    });
    const saleId = uuid<SaleId>();
    const saleLineId = uuid<SaleLineId>();
    const deliveryId = uuid<DeliveryId>();
    const deliveryLineId = uuid<DeliveryLineId>();
    const openCaseId = uuid<FulfilmentRemainderCaseId>();
    expect(
      await createSaleDraft(harness.ctx, {
        ...envelope("ack-sale-draft"),
        payload: {
          saleId,
          customerId: activeCustomer.id,
          currency: "VND",
          lines: [
            {
              lineId: saleLineId,
              productId: PRODUCT_CA_CHUA_ID,
              productName: "Cà chua",
              qualityGradeId: QUALITY_GRADE_1_ID,
              qualityGradeName: "Loại 1",
              quantity: { valueScaled: 100_000, unit: "kg" },
              unitPrice: { amountMinor: 10_000, currency: "VND" },
            },
          ],
          note: null,
          evidenceReferences: [],
          dueAt: null,
          replacesSaleId: null,
        },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await postSale(harness.ctx, {
        ...envelope("ack-sale-post"),
        expectedVersion: 1,
        payload: { saleId },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await createDeliveryDraft(harness.ctx, {
        ...envelope("ack-delivery-draft"),
        payload: {
          deliveryId,
          saleId,
          lines: [
            {
              deliveryLineId,
              saleLineId,
              productId: PRODUCT_CA_CHUA_ID,
              qualityGradeId: QUALITY_GRADE_1_ID,
              quantity: { valueScaled: 60_000, unit: "kg" },
            },
          ],
          note: null,
          evidenceReferences: ["dispatch-sheet://close-ack/001"],
        },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await dispatchDelivery(harness.ctx, {
        ...envelope("ack-delivery-dispatch"),
        expectedVersion: 1,
        payload: { deliveryId },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await recordFulfilmentRemainderCase(harness.ctx, {
        ...envelope("ack-remainder-open"),
        payload: {
          fulfilmentRemainderCaseId: openCaseId,
          saleId,
          caseKind: "opened",
          outcome: null,
          reason: "Phần còn lại cần được quyết định tại chốt ngày.",
          relatedCaseId: null,
          evidenceReferences: ["review://close-ack/001"],
        },
      }),
    ).toMatchObject({ ok: true });

    const board = await getOperationsBoard(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      filter: "fulfilment_remainder_unresolved",
      sort: "updated_desc",
      search: "",
      cursor: null,
      limit: 20,
    });
    expect(board.ok).toBe(true);
    if (!board.ok) return;
    const exception = board.value.page.items[0]?.exceptions.find(
      (item) => item.kind === "fulfilment_remainder_unresolved",
    );
    expect(exception).toBeDefined();
    if (exception === undefined) return;

    const observationId = await recordObservation("cash_count");
    const before = await getOperationalCloseReadiness(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      businessDate: "2026-07-20",
    });
    expect(before).toMatchObject({
      ok: true,
      value: { state: "blocked", blockers: ["unacknowledged_exception"] },
    });
    expect(before.ok && before.value.exceptionSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "fulfilment_remainder_unresolved",
          nextAction: {
            label: "Mở Sale để quyết định phần còn lại.",
            href: "/operations-board?filter=fulfilment_remainder_unresolved",
          },
        }),
      ]),
    );

    const blockedWrite = await recordOperationalClose(harness.ctx, {
      ...envelope("ack-readiness-bypass-attempt"),
      payload: {
        operationalCloseId: uuid(),
        businessDate: "2026-07-20",
        observationIds: [observationId],
        evidenceReferences: ["review://close-ack/readiness-bypass"],
        reason: "Thử bỏ qua exception chưa được acknowledge bằng write-path.",
      },
    });
    expect(blockedWrite).toMatchObject({
      ok: false,
      error: {
        code: "OPERATIONAL_CLOSE_READINESS_BLOCKED",
        details: { blockers: ["unacknowledged_exception"] },
      },
    });

    const acknowledgementInput = {
      ...envelope("ack-remainder"),
      payload: {
        operationalCloseExceptionAcknowledgementId: uuid(),
        businessDate: "2026-07-20",
        exceptionKind: exception.kind,
        source: exception.source,
        evidenceReferences: ["review://close-ack/002"],
        reason: "Đã nhìn thấy phần còn lại và chấp nhận tiếp tục với việc chưa giải quyết.",
      },
    } as const;
    const acknowledged = await recordOperationalCloseExceptionAcknowledgement(
      harness.ctx,
      acknowledgementInput,
    );
    expect(acknowledged).toMatchObject({
      ok: true,
      value: {
        businessDate: "2026-07-20",
        exceptionKind: "fulfilment_remainder_unresolved",
        source: exception.source,
      },
    });
    expect(
      await recordOperationalCloseExceptionAcknowledgement(harness.ctx, acknowledgementInput),
    ).toEqual(acknowledged);
    const duplicateSource = await recordOperationalCloseExceptionAcknowledgement(harness.ctx, {
      ...acknowledgementInput,
      commandId: uuid(),
      idempotencyKey: "close-ack-remainder-different-command",
      payload: {
        ...acknowledgementInput.payload,
        operationalCloseExceptionAcknowledgementId: uuid(),
      },
    });
    expect(duplicateSource).toMatchObject({
      ok: false,
      error: { code: "OPERATIONAL_CLOSE_EXCEPTION_ACKNOWLEDGEMENT_ALREADY_RECORDED" },
    });

    const after = await getOperationalCloseReadiness(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      businessDate: "2026-07-20",
    });
    expect(after).toMatchObject({
      ok: true,
      value: {
        state: "ready",
        blockers: [],
        acknowledgements: [
          expect.objectContaining({ exceptionKind: "fulfilment_remainder_unresolved" }),
        ],
        exceptionSummary: [
          expect.objectContaining({
            kind: "fulfilment_remainder_unresolved",
            acknowledgedCount: 1,
          }),
        ],
      },
    });
    expect(after.ok && after.value.missingObservationKinds).toEqual([]);
    expect(
      await recordOperationalClose(harness.ctx, {
        ...envelope("ack-close"),
        payload: {
          operationalCloseId: uuid(),
          businessDate: "2026-07-20",
          observationIds: [observationId],
          evidenceReferences: ["review://close-ack/close"],
          reason: "Đóng ngày với phần còn lại đã được ghi nhận là chưa giải quyết.",
        },
      }),
    ).toMatchObject({ ok: true, value: { state: "closed" } });
    expect(
      await getOperationsBoard(harness.ctx, {
        workspaceId: WORKSPACE_ID,
        filter: "fulfilment_remainder_unresolved",
        sort: "updated_desc",
        search: "",
        cursor: null,
        limit: 20,
      }),
    ).toMatchObject({
      ok: true,
      value: { page: { items: [expect.objectContaining({ id: saleId })] } },
    });
    expect(harness.db.inventoryMovementRecords()).toHaveLength(1);
    expect(harness.db.entriesFor(WORKSPACE_ID, activeCustomer.id)).toHaveLength(1);
  });

  it("TC-CLOSE-008 — reports server-authored blockers before an operational close can be recorded", async () => {
    const noPolicy = await getOperationalCloseReadiness(harness.ctx, { workspaceId: WORKSPACE_ID });
    expect(noPolicy).toMatchObject({
      ok: true,
      value: { state: "blocked", blockers: ["policy_unavailable"] },
    });

    harness.clock.set("2026-07-20T12:00:00.000+07:00");
    await approvePolicy("operating_cycle_reconciliation", {
      contractVersion: 1,
      parameters: {
        strategy: "observation_signoff",
        requiredObservationKinds: ["cash_count", "inventory_count"],
        allowReopen: true,
      },
    });
    const noObservations = await getOperationalCloseReadiness(harness.ctx, {
      workspaceId: WORKSPACE_ID,
    });
    expect(noObservations).toMatchObject({
      ok: true,
      value: {
        state: "blocked",
        blockers: ["missing_observation"],
        controlException: {
          kind: "operational_close_blocked",
          sourceFacts: expect.arrayContaining([
            { key: "business_date", value: "2026-07-20" },
            { key: "blockers", value: "missing_observation" },
          ]),
        },
        missingObservationKinds: ["cash_count", "inventory_count"],
      },
    });
    const bypassAttempt = await recordOperationalClose(harness.ctx, {
      ...envelope("readiness-bypass-attempt"),
      payload: {
        operationalCloseId: uuid(),
        businessDate: "2026-07-20",
        observationIds: [uuid()],
        evidenceReferences: ["review://close/readiness-bypass"],
        reason: "Thử bỏ qua readiness bằng write-path.",
      },
    });
    expect(bypassAttempt).toMatchObject({
      ok: false,
      error: {
        code: "OPERATIONAL_CLOSE_READINESS_BLOCKED",
        details: {
          blockers: ["missing_observation"],
          missingObservationKinds: ["cash_count", "inventory_count"],
        },
      },
    });

    const cashObservationId = await recordObservation("cash_count");
    const missingInventory = await getOperationalCloseReadiness(harness.ctx, {
      workspaceId: WORKSPACE_ID,
    });
    expect(missingInventory).toMatchObject({
      ok: true,
      value: { state: "blocked", missingObservationKinds: ["inventory_count"] },
    });

    const inventoryObservationId = await recordObservation("inventory_count");
    const ready = await getOperationalCloseReadiness(harness.ctx, { workspaceId: WORKSPACE_ID });
    expect(ready).toMatchObject({
      ok: true,
      value: { state: "ready", blockers: [], missingObservationKinds: [] },
    });

    const closed = await recordOperationalClose(harness.ctx, {
      ...envelope("readiness-close"),
      payload: {
        operationalCloseId: uuid(),
        businessDate: "2026-07-20",
        observationIds: [cashObservationId, inventoryObservationId],
        evidenceReferences: ["review://close/readiness"],
        reason: "Đã đủ dữ liệu để chốt.",
      },
    });
    expect(closed.ok).toBe(true);
    const alreadyClosed = await getOperationalCloseReadiness(harness.ctx, {
      workspaceId: WORKSPACE_ID,
    });
    expect(alreadyClosed).toMatchObject({
      ok: true,
      value: { state: "blocked", blockers: ["already_closed"] },
    });
  });

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
      error: {
        code: "OPERATIONAL_CLOSE_READINESS_BLOCKED",
        details: {
          blockers: ["missing_observation"],
          missingObservationKinds: ["inventory_count"],
        },
      },
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
    const backdated = await recordCustomerPayment(harness.ctx, {
      ...envelope("backdated-after-close"),
      occurredAt: "2026-07-20T12:00:00.000+07:00",
      payload: {
        paymentId: uuid(),
        customerId: activeCustomer.id,
        amount: { amountMinor: 10_000, currency: "VND" },
        method: "cash",
        payerName: null,
        note: null,
      },
    });
    expect(backdated).toMatchObject({
      ok: false,
      error: { code: "OPERATIONAL_DAY_CLOSED", details: { businessDate: "2026-07-20" } },
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

    const revisedCloseId = operationalCloseIdSchema.parse(uuid());
    const revised = await recordOperationalClose(harness.ctx, {
      ...envelope("reclose"),
      payload: {
        ...command.payload,
        operationalCloseId: revisedCloseId,
        supersedesOperationalCloseId: operationalCloseId,
        reason: "Đóng lại sau khi xử lý chênh lệch.",
      },
    });
    expect(revised).toMatchObject({
      ok: true,
      value: {
        id: revisedCloseId,
        supersedesOperationalCloseId: operationalCloseId,
        state: "closed",
        version: 3,
      },
    });

    const duplicateRevision = await recordOperationalClose(harness.ctx, {
      ...envelope("duplicate-reclose"),
      payload: {
        ...command.payload,
        operationalCloseId: uuid(),
        supersedesOperationalCloseId: operationalCloseId,
      },
    });
    expect(duplicateRevision).toMatchObject({
      ok: false,
      error: { code: "OPERATIONAL_CLOSE_ALREADY_EXISTS" },
    });

    const revisedRead = await getOperationalClose(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      operationalCloseId: revisedCloseId,
    });
    expect(revisedRead).toMatchObject({
      ok: true,
      value: { state: "closed", version: 3, supersedesOperationalCloseId: operationalCloseId },
    });
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

    const rematched = await recordCashStatementMatch(harness.ctx, {
      ...envelope("rematch"),
      payload: {
        ...command.payload,
        cashStatementMatchId: uuid(),
        externalReference: "BANK-STATEMENT-002",
      },
    });
    expect(rematched).toMatchObject({ ok: true, value: { reversal: null, version: 1 } });
  });
});

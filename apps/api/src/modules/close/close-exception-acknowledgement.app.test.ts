import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultWorkspaceOperationalProfile,
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
import { recordReconciliationObservation } from "../evidence/evidence.handlers.ts";
import { createSaleDraft } from "../sale/create-sale-draft.handler.ts";
import { postSale } from "../sale/post-sale.handler.ts";
import { voidSale } from "../sale/void-sale.handler.ts";
import { getOperationsBoard } from "../dashboard/dashboard.queries.ts";
import { approveWorkspacePolicy, createWorkspacePolicyDraft } from "../policy/policy.handlers.ts";
import {
  recordOperationalClose,
  recordOperationalCloseExceptionAcknowledgement,
} from "./close.handlers.ts";
import { getOperationalCloseReadiness } from "./close.queries.ts";

let harness: Harness;
let sequence = 0;
const uuid = <T extends string>(): T => crypto.randomUUID() as T;
const envelope = (label: string) => ({
  commandId: uuid(),
  idempotencyKey: `close-ack-identity-${label}-${++sequence}`,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: TRANSACTION_TIME,
});

async function approveClosePolicy() {
  const policyVersionId = uuid();
  expect(
    await createWorkspacePolicyDraft(harness.ctx, {
      ...envelope("policy-draft"),
      payload: {
        policyVersionId,
        policyKind: "operating_cycle_reconciliation",
        version: 1,
        effectiveFrom: "2026-07-01T00:00:00.000Z",
        effectiveTo: null,
        definition: {
          contractVersion: 1,
          parameters: {
            strategy: "observation_signoff",
            requiredObservationKinds: ["cash_count"],
            allowReopen: true,
          },
        },
        evidenceReferences: [],
        reason: "Thiết lập chính sách kiểm thử acknowledgement identity.",
      },
    }),
  ).toMatchObject({ ok: true });
  expect(
    await approveWorkspacePolicy(harness.ctx, {
      ...envelope("policy-approve"),
      payload: {
        policyVersionId,
        evidenceReferences: ["policy://close/identity-approval"],
        reason: "Đã phê duyệt chính sách acknowledgement identity.",
      },
    }),
  ).toMatchObject({ ok: true });
}

async function recordCashObservation(): Promise<ReconciliationObservationId> {
  const reconciliationObservationId = uuid<ReconciliationObservationId>();
  expect(
    await recordReconciliationObservation(harness.ctx, {
      ...envelope("cash-observation"),
      payload: {
        reconciliationObservationId,
        kind: "cash_count",
        caseKind: "normal",
        description: "Đối chiếu tiền mặt.",
        participantWording: "Đã kiểm tra và ghi nhận số liệu.",
        facts: {
          expectedAmount: { amountMinor: 500_000, currency: "VND" },
          observedAmount: { amountMinor: 500_000, currency: "VND" },
          expectedQuantity: null,
          observedQuantity: null,
          itemCount: 1,
          productId: null,
          qualityGradeId: null,
          scopeReference: "cash://bank/090",
        },
        evidenceReferences: ["photo://close/identity-cash"],
        relatedObservationId: null,
      },
    }),
  ).toMatchObject({ ok: true });
  return reconciliationObservationId;
}

async function postOverdueSale(label: string): Promise<SaleId> {
  const saleId = uuid<SaleId>();
  expect(
    await createSaleDraft(harness.ctx, {
      ...envelope(`${label}-draft`),
      payload: {
        saleId,
        customerId: activeCustomer.id,
        currency: "VND",
        lines: [
          {
            lineId: uuid<SaleLineId>(),
            productId: PRODUCT_CA_CHUA_ID,
            productName: "Cà chua",
            qualityGradeId: QUALITY_GRADE_1_ID,
            qualityGradeName: "Loại 1",
            quantity: { valueScaled: 1_000, unit: "kg" },
            unitPrice: { amountMinor: 10_000, currency: "VND" },
          },
        ],
        note: null,
        evidenceReferences: [],
        dueAt: "2026-07-19T05:00:00.000Z",
        replacesSaleId: null,
      },
    }),
  ).toMatchObject({ ok: true });
  expect(
    await postSale(harness.ctx, {
      ...envelope(`${label}-post`),
      expectedVersion: 1,
      payload: { saleId },
    }),
  ).toMatchObject({ ok: true });
  return saleId;
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

describe("operational close acknowledgement", () => {
  it("TC-CLOSE-010 — acknowledgement follows the current source identity, not a same-kind count", async () => {
    await approveClosePolicy();
    const acknowledgedSaleId = await postOverdueSale("acknowledged-sale");
    const stillOpenSaleId = await postOverdueSale("still-open-sale");
    const board = await getOperationsBoard(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      filter: "overdue_receivable",
      sort: "updated_desc",
      search: "",
      cursor: null,
      limit: 20,
    });
    expect(board.ok).toBe(true);
    if (!board.ok) return;
    const acknowledgedException = board.value.page.items
      .find((item) => item.id === acknowledgedSaleId)
      ?.exceptions.find((exception) => exception.kind === "overdue_receivable");
    expect(acknowledgedException).toBeDefined();
    if (acknowledgedException === undefined || acknowledgedException.source.id === null) return;

    expect(
      await recordOperationalCloseExceptionAcknowledgement(harness.ctx, {
        ...envelope("acknowledge-a"),
        payload: {
          operationalCloseExceptionAcknowledgementId: uuid(),
          businessDate: "2026-07-20",
          exceptionKind: "overdue_receivable",
          source: { ...acknowledgedException.source, id: acknowledgedException.source.id },
          evidenceReferences: ["review://close-identity/a"],
          reason: "Đã đọc Sale A quá hạn trước khi thu tiền.",
        },
      }),
    ).toMatchObject({ ok: true });

    expect(
      await voidSale(harness.ctx, {
        ...envelope("resolve-a-void"),
        payload: {
          saleVoidId: uuid(),
          saleId: acknowledgedSaleId,
          reasonCode: "wrong_amount",
          reason: "Sale A được void sau acknowledgement để kiểm tra identity còn lại.",
          evidenceReferences: [],
        },
      }),
    ).toMatchObject({ ok: true });

    const observationId = await recordCashObservation();
    const readiness = await getOperationalCloseReadiness(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      businessDate: "2026-07-20",
    });
    expect(readiness).toMatchObject({
      ok: true,
      value: {
        state: "blocked",
        blockers: ["unacknowledged_exception"],
        exceptionSummary: expect.arrayContaining([
          expect.objectContaining({
            kind: "overdue_receivable",
            count: 1,
            acknowledgedCount: 0,
          }),
        ]),
      },
    });
    expect(
      await recordOperationalClose(harness.ctx, {
        ...envelope("close-bypass"),
        payload: {
          operationalCloseId: uuid(),
          businessDate: "2026-07-20",
          observationIds: [observationId],
          evidenceReferences: ["review://close-identity/close"],
          reason: `Acknowledgement Sale A không thể làm mất blocker Sale ${stillOpenSaleId}.`,
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "OPERATIONAL_CLOSE_READINESS_BLOCKED" },
    });
  });
});

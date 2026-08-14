import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type {
  DeliveryId,
  DeliveryLineId,
  FulfilmentRemainderCaseId,
  SaleId,
  SaleLineId,
} from "@vuarau/domain-contracts";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import {
  approveWorkspacePolicy,
  createWorkspacePolicyDraft,
} from "../../../modules/policy/policy.handlers.ts";
import { createSaleDraft } from "../../../modules/sale/create-sale-draft.handler.ts";
import { postSale } from "../../../modules/sale/post-sale.handler.ts";
import {
  createDeliveryDraft,
  dispatchDelivery,
  recordFulfilmentRemainderCase,
} from "../../../modules/delivery/delivery.handlers.ts";
import { getOperationsBoard } from "../../../modules/dashboard/dashboard.queries.ts";
import { getOperationalCloseReadiness } from "../../../modules/close/close.queries.ts";
import { recordOperationalCloseExceptionAcknowledgement } from "../../../modules/close/close.handlers.ts";

describe.skipIf(skipWithoutDatabase())("close exception acknowledgement against PostgreSQL", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;
  const context = (): CommandContext => ({
    deps,
    principal: { actorId: ctx.actorId, subject: ctx.subject },
  });
  const command = (key: string, occurredAt = "2026-07-29T12:00:00.000Z") => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: `${key}-${crypto.randomUUID()}`,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt,
  });

  beforeAll(async () => {
    ctx = await createDbTestContext(`close-exception-ack-${crypto.randomUUID()}`);
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => "2026-07-29T14:00:00.000Z" },
    };
    const policyVersionId = crypto.randomUUID();
    expect(
      await createWorkspacePolicyDraft(context(), {
        ...command("policy-draft", "2026-07-29T10:00:00.000Z"),
        payload: {
          policyVersionId,
          policyKind: "operating_cycle_reconciliation",
          version: 1,
          effectiveFrom: "2026-01-01T00:00:00.000Z",
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
          reason: "Policy cho kiểm thử acknowledgement PostgreSQL.",
        },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await approveWorkspacePolicy(context(), {
        ...command("policy-approve", "2026-07-29T10:01:00.000Z"),
        payload: {
          policyVersionId,
          evidenceReferences: ["policy://close-ack/db"],
          reason: "Đã duyệt policy acknowledgement.",
        },
      }),
    ).toMatchObject({ ok: true });
  });

  afterAll(() => ctx.close());

  it("TC-CLOSE-DB-003 — persists, reads and idempotently replays the acknowledgement while the Board stays unresolved", async () => {
    const saleId = crypto.randomUUID() as SaleId;
    const saleLineId = crypto.randomUUID() as SaleLineId;
    const deliveryId = crypto.randomUUID() as DeliveryId;
    const deliveryLineId = crypto.randomUUID() as DeliveryLineId;
    const caseId = crypto.randomUUID() as FulfilmentRemainderCaseId;
    const sale = await createSaleDraft(context(), {
      ...command("sale-draft"),
      payload: {
        saleId,
        customerId: ctx.customerId,
        currency: "VND",
        lines: [
          {
            lineId: saleLineId,
            productId: ctx.productIds[0],
            productName: "Cà chua",
            qualityGradeId: ctx.qualityGradeId,
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
    });
    expect(sale.ok).toBe(true);
    expect(
      await postSale(context(), {
        ...command("sale-post"),
        expectedVersion: 1,
        payload: { saleId },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await createDeliveryDraft(context(), {
        ...command("delivery-draft"),
        payload: {
          deliveryId,
          saleId,
          lines: [
            {
              deliveryLineId,
              saleLineId,
              productId: ctx.productIds[0],
              qualityGradeId: ctx.qualityGradeId,
              quantity: { valueScaled: 60_000, unit: "kg" },
            },
          ],
          note: null,
          evidenceReferences: ["dispatch-sheet://close-ack/db"],
        },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await dispatchDelivery(context(), {
        ...command("delivery-dispatch"),
        expectedVersion: 1,
        payload: { deliveryId },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await recordFulfilmentRemainderCase(context(), {
        ...command("remainder-open"),
        payload: {
          fulfilmentRemainderCaseId: caseId,
          saleId,
          caseKind: "opened",
          outcome: null,
          reason: "Phần còn lại chờ quyết định.",
          relatedCaseId: null,
          evidenceReferences: ["review://close-ack/db"],
        },
      }),
    ).toMatchObject({ ok: true });

    const board = await getOperationsBoard(context(), {
      workspaceId: ctx.workspaceId,
      filter: "fulfilment_remainder_unresolved",
      sort: "updated_desc",
      search: "",
      cursor: null,
      limit: 20,
    });
    expect(board.ok).toBe(true);
    if (!board.ok) return;
    const source = board.value.page.items[0]?.exceptions.find(
      (exception) => exception.kind === "fulfilment_remainder_unresolved",
    )?.source;
    expect(source).toBeDefined();
    if (source === undefined || source.id === null) return;

    const input = {
      ...command("acknowledge"),
      payload: {
        operationalCloseExceptionAcknowledgementId: crypto.randomUUID(),
        businessDate: "2026-07-29",
        exceptionKind: "fulfilment_remainder_unresolved" as const,
        source: { ...source, id: source.id },
        evidenceReferences: ["review://close-ack/db-ack"],
        reason: "Đã xác nhận phần còn lại vẫn chưa được giải quyết.",
      },
    };
    const acknowledged = await recordOperationalCloseExceptionAcknowledgement(context(), input);
    expect(acknowledged).toMatchObject({ ok: true, value: { businessDate: "2026-07-29" } });
    expect(await recordOperationalCloseExceptionAcknowledgement(context(), input)).toEqual(
      acknowledged,
    );
    const readiness = await getOperationalCloseReadiness(context(), {
      workspaceId: ctx.workspaceId,
      businessDate: "2026-07-29",
    });
    expect(readiness).toMatchObject({
      ok: true,
      value: {
        blockers: ["missing_observation"],
        acknowledgements: [
          expect.objectContaining({ exceptionKind: "fulfilment_remainder_unresolved" }),
        ],
      },
    });
    const stillUnresolved = await getOperationsBoard(context(), {
      workspaceId: ctx.workspaceId,
      filter: "fulfilment_remainder_unresolved",
      sort: "updated_desc",
      search: "",
      cursor: null,
      limit: 20,
    });
    expect(stillUnresolved.ok && stillUnresolved.value.page.items).toHaveLength(1);
  });
});

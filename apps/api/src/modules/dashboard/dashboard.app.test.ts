import {
  decodeCursor,
  defaultWorkspaceOperationalProfile,
  type OperationsBoardInput,
} from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import {
  OTHER_WORKSPACE_ID,
  WORKSPACE_ID,
  postedSale,
  voidedSale,
  vnd,
} from "@vuarau/test-fixtures";
import type { DeliveryId, DeliveryLineId, DeliveryReturnId } from "@vuarau/domain-contracts";
import { createHarness } from "../../testing/command-test-harness.ts";
import {
  createDeliveryDraft,
  dispatchDelivery,
  markDeliveryDelivered,
  recordDeliveryReturn,
} from "../delivery/delivery.handlers.ts";
import {
  getDashboardSeries,
  getDashboardSummary,
  getOperationsBoard,
} from "./dashboard.queries.ts";

const boardInput = (workspaceId: typeof WORKSPACE_ID): OperationsBoardInput => ({
  workspaceId,
  cursor: null,
  limit: 1,
  filter: "all",
  sort: "updated_desc",
  search: "",
});

describe("dashboard reads", () => {
  it("uses server-side void-adjusted totals and scopes them by workspace", async () => {
    const harness = createHarness();
    harness.db.seedSale(postedSale);
    harness.db.seedSale(voidedSale);
    harness.db.seedSale({ ...postedSale, workspaceId: OTHER_WORKSPACE_ID });

    const result = await getDashboardSummary(harness.ctx, WORKSPACE_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sales.amount).toEqual({ amountMinor: 875_000, currency: "VND" });
    expect(result.value.sales.count).toBe(1);
  });

  it("counts a valid posted zero-value sale without inventing amount", async () => {
    const harness = createHarness();
    harness.db.seedSale({
      ...postedSale,
      id: crypto.randomUUID() as typeof postedSale.id,
      totalAmount: vnd(0),
      lines: postedSale.lines.map((line) => ({
        ...line,
        unitPrice: vnd(0),
        lineTotal: vnd(0),
      })),
    });

    const result = await getDashboardSummary(harness.ctx, WORKSPACE_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sales).toMatchObject({
      count: 1,
      amount: { amountMinor: 0, currency: "VND" },
    });
  });

  it("returns a stable cursor for the next board page without repeating rows", async () => {
    const harness = createHarness();
    harness.db.seedSale(postedSale);
    harness.db.seedSale({ ...postedSale, id: voidedSale.id, voidRecord: null });

    const first = await getOperationsBoard(harness.ctx, boardInput(WORKSPACE_ID));
    expect(first.ok).toBe(true);
    if (!first.ok || first.value.page.nextCursor === null) return;

    const second = await getOperationsBoard(harness.ctx, {
      ...boardInput(WORKSPACE_ID),
      cursor: first.value.page.nextCursor,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.page.items).toHaveLength(1);
    expect(second.value.page.items[0]?.id).not.toBe(first.value.page.items[0]?.id);
    expect(decodeCursor(first.value.page.nextCursor)).not.toBeNull();
  });

  it("does not offer a next action for a voided sale", async () => {
    const harness = createHarness();
    harness.db.seedSale(voidedSale);

    const result = await getOperationsBoard(harness.ctx, {
      ...boardInput(WORKSPACE_ID),
      limit: 10,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.page.items).toContainEqual(
      expect.objectContaining({
        id: voidedSale.id,
        commercialState: "voided",
        financialState: "voided",
        nextAction: null,
      }),
    );
  });

  it("TC-OPS-023 — separates returned fulfilment from ordinary outstanding delivery", async () => {
    const harness = createHarness();
    const saleId = crypto.randomUUID() as typeof postedSale.id;
    const saleLine = postedSale.lines[0]!;
    const deliveryId = crypto.randomUUID() as DeliveryId;
    const deliveryLineId = crypto.randomUUID() as DeliveryLineId;
    const returnId = crypto.randomUUID() as DeliveryReturnId;
    harness.db.seedSale({ ...postedSale, id: saleId });

    const command = (label: string) => ({
      commandId: crypto.randomUUID(),
      idempotencyKey: `dashboard-return-${label}-${crypto.randomUUID()}`,
      workspaceId: WORKSPACE_ID,
      actorId: harness.ctx.principal.actorId,
      occurredAt: postedSale.recordedAt,
    });
    const created = await createDeliveryDraft(harness.ctx, {
      ...command("draft"),
      payload: {
        deliveryId,
        saleId,
        lines: [
          {
            deliveryLineId,
            saleLineId: saleLine.lineId,
            productId: saleLine.productId!,
            qualityGradeId: saleLine.qualityGradeId,
            quantity: { valueScaled: 10_000, unit: saleLine.quantity.unit },
          },
        ],
        note: null,
      },
    });
    expect(created.ok).toBe(true);
    expect(
      (
        await dispatchDelivery(harness.ctx, {
          ...command("dispatch"),
          expectedVersion: 1,
          payload: { deliveryId },
        })
      ).ok,
    ).toBe(true);

    const inFlight = await getOperationsBoard(harness.ctx, {
      ...boardInput(WORKSPACE_ID),
      filter: "in_delivery",
      limit: 10,
    });
    expect(inFlight.ok).toBe(true);
    if (!inFlight.ok) return;
    expect(inFlight.value.page.items).toContainEqual(
      expect.objectContaining({
        id: saleId,
        physicalState: "in_delivery",
        nextAction: "Theo dõi giao hàng",
      }),
    );

    expect(
      (
        await markDeliveryDelivered(harness.ctx, {
          ...command("delivered"),
          expectedVersion: 2,
          payload: { deliveryId },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await recordDeliveryReturn(harness.ctx, {
          ...command("return"),
          payload: {
            returnId,
            deliveryId,
            lines: [{ deliveryLineId, quantity: { valueScaled: 2_000, unit: "kg" } }],
            reason: "Hàng trả lại cần xử lý",
          },
        })
      ).ok,
    ).toBe(true);

    const board = await getOperationsBoard(harness.ctx, {
      ...boardInput(WORKSPACE_ID),
      filter: "returned_fulfilment",
      limit: 10,
    });
    expect(board.ok).toBe(true);
    if (!board.ok) return;
    expect(board.value.page.items).toContainEqual(
      expect.objectContaining({
        id: saleId,
        returnedFulfilment: true,
        nextAction: "Xử lý hàng trả",
      }),
    );

    const counts = await harness.ctx.deps.uow.transaction((repos) =>
      repos.dashboardReads.operationsBoardCounts({
        workspaceId: WORKSPACE_ID,
        filter: "all",
        search: "",
        now: harness.clock.now(),
      }),
    );
    expect(counts.counts.returnedFulfilment).toBe(1);
  });

  it("uses the workspace business-day start for dashboard series", async () => {
    const harness = createHarness();
    harness.clock.set("2026-07-23T09:00:00.000+07:00");
    harness.db.setOperationalProfile({
      ...defaultWorkspaceOperationalProfile(WORKSPACE_ID),
      businessDayStartMinute: 22 * 60,
    });
    harness.db.seedSale({
      ...postedSale,
      transactionTime: "2026-07-20T21:30:00.000+07:00",
      recordedAt: "2026-07-20T21:31:00.000+07:00",
      postedAt: "2026-07-20T21:31:00.000+07:00",
    });

    const result = await getDashboardSeries(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      days: 7,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.points.find((point) => point.date === "2026-07-19")?.sales).toEqual({
      amountMinor: postedSale.totalAmount.amountMinor,
      currency: "VND",
    });
    expect(result.value.points.find((point) => point.date === "2026-07-20")?.sales).toEqual({
      amountMinor: 0,
      currency: "VND",
    });
  });
});

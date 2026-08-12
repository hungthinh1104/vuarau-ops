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
import { createHarness } from "../../testing/command-test-harness.ts";
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

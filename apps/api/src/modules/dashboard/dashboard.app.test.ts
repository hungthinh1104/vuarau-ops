import { decodeCursor, type OperationsBoardInput } from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { OTHER_WORKSPACE_ID, WORKSPACE_ID, postedSale, voidedSale } from "@vuarau/test-fixtures";
import { createHarness } from "../../testing/command-test-harness.ts";
import { getDashboardSummary, getOperationsBoard } from "./dashboard.queries.ts";

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
    expect(result.value.sales.count).toBe(2);
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
});

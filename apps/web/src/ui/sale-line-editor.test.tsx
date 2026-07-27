import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { calculateLineTotal } from "@vuarau/domain-contracts";
import { SaleLineEditor, emptyLine, resolveLine } from "./patterns/sale-line-editor.tsx";
import { ACCEPTANCE_TARGETS, WORKFLOW_METRICS } from "../api/workflow-metrics.ts";

/**
 * TC-WEB-021 — a sale line resolves to integers, or says which field is wrong.
 *
 * The line total is the number a worker reads aloud to the customer before the
 * sale is posted. It comes from `calculateLineTotal` in `domain-contracts` — the
 * same implementation the server posts with (BR-SALE-004) — so the number said
 * and the number charged cannot differ.
 */
describe("TC-WEB-021 — resolving a sale line", () => {
  const line = (over: Partial<ReturnType<typeof emptyLine>> = {}) => ({
    ...emptyLine("line-1"),
    productName: "Cà chua",
    quantityText: "12,5",
    unit: "kg" as const,
    unitPriceText: "18.000",
    ...over,
  });

  it("uses the server's own arithmetic for the line total", () => {
    const resolved = resolveLine(line());
    expect(resolved.total).toEqual(
      calculateLineTotal(
        { valueScaled: 12_500, unit: "kg" },
        { amountMinor: 18_000, currency: "VND" },
      ),
    );
    expect(resolved.total?.amountMinor).toBe(225_000);
  });

  it("names the missing field rather than refusing the whole row", () => {
    expect(resolveLine(line({ productName: "  " })).issues.productName).toBe("Nhập tên mặt hàng.");
    expect(resolveLine(line({ quantityText: "" })).issues.quantity).toBe("Nhập số lượng.");
    expect(resolveLine(line({ unitPriceText: "" })).issues.unitPrice).toBe("Nhập đơn giá.");
  });

  it("refuses a zero quantity, naming the unit as entered", () => {
    // BR-SALE-003, and the message uses "bó" because that is what was chosen —
    // no conversion to kg is implied anywhere (ASM-011).
    expect(resolveLine(line({ quantityText: "0", unit: "bo" })).issues.quantity).toBe(
      "Số lượng phải lớn hơn 0 bó.",
    );
  });

  it("allows a zero price, because depots give things away", () => {
    const resolved = resolveLine(line({ unitPriceText: "0" }));
    expect(resolved.issues.unitPrice).toBeUndefined();
    expect(resolved.total?.amountMinor).toBe(0);
  });

  it("has no total while any field is unresolved", () => {
    expect(resolveLine(line({ quantityText: "mười hai" })).total).toBeNull();
  });
});

describe("TC-WEB-022 — the line editor", () => {
  const base = {
    line: {
      ...emptyLine("l1"),
      productName: "Cà chua",
      quantityText: "12,5",
      unitPriceText: "18.000",
    },
    index: 0,
    issues: {},
    canRemove: true,
  };

  it("shows the line total as the fields are filled", () => {
    render(<SaleLineEditor {...base} onChange={() => undefined} onRemove={() => undefined} />);
    expect(screen.getByText("225.000 ₫")).toBeInTheDocument();
  });

  it("attaches a server refusal to this row, as an alert", () => {
    render(
      <SaleLineEditor
        {...base}
        serverIssue="Máy chủ từ chối dòng này."
        onChange={() => undefined}
        onRemove={() => undefined}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Máy chủ từ chối dòng này.");
  });

  it("keeps what was typed while reporting an issue on the same row", async () => {
    render(
      <SaleLineEditor
        {...base}
        issues={{ quantity: "Số lượng phải lớn hơn 0 kg." }}
        onChange={() => undefined}
        onRemove={() => undefined}
      />,
    );
    expect(screen.getByLabelText(/Mặt hàng/)).toHaveValue("Cà chua");
    expect(screen.getByLabelText(/Đơn giá/)).toHaveValue("18.000");
    expect(screen.getByLabelText(/Số lượng/)).toHaveAccessibleDescription(
      "Số lượng phải lớn hơn 0 kg.",
    );
  });

  it("names the row in its remove control, so it is unambiguous by ear", async () => {
    const onRemove = vi.fn();
    render(<SaleLineEditor {...base} index={2} onChange={() => undefined} onRemove={onRemove} />);
    await userEvent.click(screen.getByRole("button", { name: "Xoá dòng 3" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("offers no way to remove the only line", () => {
    render(
      <SaleLineEditor
        {...base}
        canRemove={false}
        onChange={() => undefined}
        onRemove={() => undefined}
      />,
    );
    expect(screen.queryByRole("button", { name: /Xoá dòng/ })).toBeNull();
  });

  /**
   * Every control is `type="button"`. On a phone with a numeric keypad, an
   * implicit form submit is one mis-tap away from posting a sale.
   */
  it("has no control that could submit a form", () => {
    const { container } = render(
      <SaleLineEditor {...base} onChange={() => undefined} onRemove={() => undefined} />,
    );
    for (const button of container.querySelectorAll("button")) {
      expect(button.getAttribute("type")).toBe("button");
    }
    expect(container.querySelector("form")).toBeNull();
  });
});

/**
 * TC-WEB-023 — the metric vocabulary is closed, and carries no business data.
 *
 * A depot's book of who owes what is the most sensitive thing this product holds,
 * and analytics is where it would leak without anybody noticing — because nobody
 * reads the events, they read the charts. TC-E2E-020 asserts the same property
 * against a real rendered workflow.
 */
describe("TC-WEB-023 — workflow metrics", () => {
  it("names only workflow events, never business data or identifiers", () => {
    expect([...WORKFLOW_METRICS]).toEqual([
      "sale_line_count",
      "draft_started_at",
      "post_attempted_at",
      "post_confirmed_at",
      "validation_error_count",
      "line_edit_count",
      "command_retry_count",
      "unknown_outcome_count",
      "workflow_abandoned",
      "recent_customer_selected",
      "customer_selected_from_search",
      "customer_created_inline",
      "historical_product_selected",
      "historical_price_offered",
      "historical_price_applied",
      "historical_price_changed_after_apply",
      "price_cleared_after_unit_change",
      "sale_detail_viewed",
    ]);

    // Event names can say what interaction occurred; their payload cannot carry
    // the customer, product, unit, price, total, note or sale id.
    for (const metric of WORKFLOW_METRICS) {
      expect(metric).toMatch(/^[a-z_]+$/);
    }
  });

  it("records the pilot targets as targets, not as measurements", () => {
    // Written down before the pilot so a disappointing result cannot be
    // reinterpreted afterwards. Nothing in this suite measures them.
    expect(ACCEPTANCE_TARGETS.oneLineSaleSeconds).toBe(10);
    expect(ACCEPTANCE_TARGETS.threeLineSaleSeconds).toBe(25);
    expect(ACCEPTANCE_TARGETS.duplicateFinancialEffects).toBe(0);
    expect(ACCEPTANCE_TARGETS.lostEntriesAfterRecoverableFailure).toBe(0);
    // Speed alone was never the hypothesis: a sale entered in six seconds with the
    // wrong quantity is worse than no sale.
    expect(ACCEPTANCE_TARGETS.saleMatchesWorkersOwnRecord).toBe(1);
    expect(ACCEPTANCE_TARGETS.tasksRequiringTakeover).toBe(0);
  });

  it("sets no target for beating paper, because the pilot cannot measure it", () => {
    // H2 was reworded on 2026-07-27: "faster than the current paper/memory
    // process" is a comparison, and nothing in the session measures the process it
    // compares against. A target here would put the claim back, quietly, in code.
    for (const name of Object.keys(ACCEPTANCE_TARGETS)) {
      expect(name).not.toMatch(/faster|paper|notebook|baseline|versusPaper/i);
    }
  });
});

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PriceResolutionDto, PriceRuleDto } from "@vuarau/domain-contracts";
import { calculateLineTotal } from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures/ids";
import { RECORDED_AT } from "@vuarau/test-fixtures/time";
import { SaleLineEditor, emptyLine, resolveLine } from "./sale-line-editor.tsx";
import { ACCEPTANCE_TARGETS, WORKFLOW_METRICS } from "@/api/workflow-metrics.ts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";

/**
 * TC-WEB-024 — keyboard/focus sequence hardening for Quick Sale.
 */
describe("TC-WEB-024 — keyboard/focus sequence", () => {
  const readyLine = () => ({
    ...emptyLine("l1"),
    productId: PRODUCT_CA_CHUA_ID,
    productName: "Cà chua",
    qualityGradeId: QUALITY_GRADE_1_ID,
    qualityGradeName: "Loại 1",
    quantityText: "12,5",
    unit: "kg" as const,
    unitPriceText: "18.000",
  });

  const baseProps = {
    index: 0,
    issues: {},
    canRemove: false,
    qualityGradeOptions: [{ value: QUALITY_GRADE_1_ID, label: "Loại 1" }],
    onRemove: () => undefined,
  } as const;

  it("moves Product Enter to the required quality-grade control", async () => {
    const user = userEvent.setup();
    render(
      <SaleLineEditor
        {...baseProps}
        line={{ ...readyLine(), qualityGradeId: null, qualityGradeName: null }}
        onChange={() => undefined}
      />,
    );

    await user.click(screen.getByLabelText(/Mặt hàng/));
    await user.keyboard("[Enter]");

    expect(screen.getByLabelText(/Hạng hàng/)).toHaveFocus();
  });

  it("moves to quantity only after a quality grade is actually selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SaleLineEditor
        {...baseProps}
        line={{ ...readyLine(), qualityGradeId: null, qualityGradeName: null }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: /Hạng hàng/ }));
    await user.click(await screen.findByRole("option", { name: "Loại 1" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        qualityGradeId: QUALITY_GRADE_1_ID,
        qualityGradeName: "Loại 1",
      }),
      "qualityGrade",
    );
    expect(screen.getByLabelText(/Số lượng/)).toHaveFocus();
  });

  it("skips quality grade when the workspace disables quality grading", async () => {
    const user = userEvent.setup();
    const onAdvance = vi.fn();
    render(
      <SaleLineEditor
        {...baseProps}
        line={{ ...readyLine(), qualityGradeId: null, qualityGradeName: null }}
        qualityGradeRequired={false}
        onChange={() => undefined}
        onAdvance={onAdvance}
      />,
    );

    expect(screen.queryByLabelText(/Hạng hàng/)).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/Mặt hàng/));
    await user.keyboard("[Enter]");
    expect(screen.getByLabelText(/Số lượng/)).toHaveFocus();

    await user.click(screen.getByLabelText(/Đơn giá/));
    await user.keyboard("[Enter]");
    expect(onAdvance).toHaveBeenCalledOnce();
  });

  it("advances from price when the line is fully fulfilment-ready", async () => {
    const user = userEvent.setup();
    const onAdvance = vi.fn();
    render(
      <SaleLineEditor
        {...baseProps}
        line={readyLine()}
        onChange={() => undefined}
        onAdvance={onAdvance}
      />,
    );

    await user.click(screen.getByLabelText(/Đơn giá/));
    await user.keyboard("[Enter]");

    expect(onAdvance).toHaveBeenCalledOnce();
  });

  it.each([
    ["catalog product identity is missing", { productId: null }],
    ["quality grade is missing", { qualityGradeId: null, qualityGradeName: null }],
    ["quantity is invalid", { quantityText: "0" }],
    ["unit price is invalid", { unitPriceText: "-1" }],
  ])("does not advance when %s", async (_label, override) => {
    const user = userEvent.setup();
    const onAdvance = vi.fn();
    render(
      <SaleLineEditor
        {...baseProps}
        line={{ ...readyLine(), ...override }}
        onChange={() => undefined}
        onAdvance={onAdvance}
      />,
    );

    await user.click(screen.getByLabelText(/Đơn giá/));
    await user.keyboard("[Enter]");

    expect(onAdvance).not.toHaveBeenCalled();
  });
});

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

  it("shows the selected unit once when quantity and unit selector sit together", () => {
    render(<SaleLineEditor {...base} onChange={() => undefined} onRemove={() => undefined} />);
    expect(screen.getAllByText("kg")).toHaveLength(1);
  });

  it("attaches a server refusal to this row, as an alert", () => {
    render(
      <SaleLineEditor
        {...base}
        serverIssue="Máy chủ chưa nhận được dòng này."
        onChange={() => undefined}
        onRemove={() => undefined}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Máy chủ chưa nhận được dòng này.");
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

  it("does not visually preselect a grade before the worker chooses one", async () => {
    const onChange = vi.fn();
    render(
      <SaleLineEditor
        {...base}
        line={{ ...base.line, qualityGradeId: null, qualityGradeName: null }}
        qualityGradeOptions={[{ value: "grade-1", label: "Loại 1" }]}
        onChange={onChange}
        onRemove={() => undefined}
      />,
    );
    expect(screen.getByLabelText(/Hạng hàng/)).toHaveValue("");
    await userEvent.click(screen.getByRole("combobox", { name: /Hạng hàng/ }));
    await userEvent.click(await screen.findByRole("option", { name: "Loại 1" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        qualityGradeId: "grade-1",
        qualityGradeName: "Loại 1",
      }),
      "qualityGrade",
    );
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

describe("TC-WEB-025 — price rule resolution states", () => {
  const line = {
    ...emptyLine("l1"),
    productId: PRODUCT_CA_CHUA_ID,
    productName: "Cà chua",
    qualityGradeId: QUALITY_GRADE_1_ID,
    qualityGradeName: "Loại 1",
    quantityText: "12",
    unit: "kg" as const,
    unitPriceText: "18.000",
  };
  const selectedRule: PriceRuleDto = {
    id: "00000000-0000-4000-8000-0000000000aa" as PriceRuleDto["id"],
    workspaceId: WORKSPACE_ID,
    productId: PRODUCT_CA_CHUA_ID,
    qualityGradeId: QUALITY_GRADE_1_ID,
    customerId: null,
    unit: "kg",
    kind: "list",
    priority: 10,
    minimumQuantityScaled: 0,
    effectiveFrom: RECORDED_AT,
    effectiveTo: null,
    baseUnitPrice: { amountMinor: 18_000, currency: "VND" },
    discountPerUnit: { amountMinor: 0, currency: "VND" },
    feePerUnit: { amountMinor: 0, currency: "VND" },
    finalUnitPrice: { amountMinor: 18_000, currency: "VND" },
    reason: "Giá sỉ",
    actorId: ACTOR_ID,
    commandId: "00000000-0000-4000-8000-0000000000ab" as PriceRuleDto["commandId"],
    recordedAt: RECORDED_AT,
  };
  const query = (data: PriceResolutionDto): QueryLike<PriceResolutionDto> => ({
    isPending: false,
    isError: false,
    error: null,
    data,
  });
  const baseProps = {
    line,
    index: 0,
    issues: {},
    canRemove: false,
    qualityGradeOptions: [{ value: QUALITY_GRADE_1_ID, label: "Loại 1" }],
    onChange: () => undefined,
    onRemove: () => undefined,
  } as const;

  it("offers the selected rule without applying it automatically", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <SaleLineEditor
        {...baseProps}
        priceResolution={query({
          status: "selected",
          selected: selectedRule,
          candidates: [selectedRule],
        })}
        onApplyPriceRule={onApply}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("18.000 ₫");
    expect(screen.getByRole("button", { name: "Dùng giá này" })).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Dùng giá này" }));
    expect(onApply).toHaveBeenCalledOnce();
  });

  it("keeps manual pricing when no rule matches", () => {
    render(
      <SaleLineEditor
        {...baseProps}
        priceResolution={query({ status: "none", selected: null, candidates: [] })}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Chưa có quy tắc giá phù hợp");
    expect(screen.queryByRole("button", { name: "Dùng giá này" })).toBeNull();
  });

  it("does not choose between rules with equal precedence", () => {
    render(
      <SaleLineEditor
        {...baseProps}
        priceResolution={query({
          status: "ambiguous",
          selected: null,
          candidates: [
            selectedRule,
            { ...selectedRule, id: "00000000-0000-4000-8000-0000000000ac" as PriceRuleDto["id"] },
          ],
        })}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("không tự chọn");
    expect(screen.queryByRole("button", { name: "Dùng giá này" })).toBeNull();
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
      "product_created_inline",
      "historical_product_selected",
      "historical_price_offered",
      "historical_price_applied",
      "historical_price_changed_after_apply",
      "recalled_price_cleared_after_context_change",
      "price_rule_applied_in_sale",
      "price_rule_changed_after_apply",
      "price_rule_cleared_after_context_change",
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

import { render, screen } from "@testing-library/react";
import { REPORT_METRIC_DEFINITIONS_DTO, type OperationalReportDto } from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import {
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  QUALITY_GRADE_2_ID,
} from "@vuarau/test-fixtures/ids";
import { ReportsView } from "./reports-view.tsx";

const result: OperationalReportDto = {
  reportType: "inventory_by_product_unit",
  businessDate: null,
  timezone: "Asia/Ho_Chi_Minh",
  integrity: "healthy",
  diagnostics: [],
  totals: { amount: null, quantities: [{ unit: "kg", valueScaled: 100_000 }] },
  page: {
    items: [
      {
        id: `${PRODUCT_CA_CHUA_ID}:${QUALITY_GRADE_1_ID}:kg`,
        label: "Cà chua · Loại 1 · kg",
        productId: PRODUCT_CA_CHUA_ID,
        productName: "Cà chua",
        qualityGradeId: QUALITY_GRADE_1_ID,
        qualityGradeName: "Loại 1",
        sourceType: "inventory_balance",
        sourceId: PRODUCT_CA_CHUA_ID,
        documentHref: `/products/${PRODUCT_CA_CHUA_ID}/inventory`,
        transactionTime: null,
        amount: null,
        quantity: { valueScaled: 70_000, unit: "kg" },
        status: "positive",
      },
      {
        id: `${PRODUCT_CA_CHUA_ID}:${QUALITY_GRADE_2_ID}:kg`,
        label: "Cà chua · Loại 2 · kg",
        productId: PRODUCT_CA_CHUA_ID,
        productName: "Cà chua",
        qualityGradeId: QUALITY_GRADE_2_ID,
        qualityGradeName: "Loại 2",
        sourceType: "inventory_balance",
        sourceId: PRODUCT_CA_CHUA_ID,
        documentHref: `/products/${PRODUCT_CA_CHUA_ID}/inventory`,
        transactionTime: null,
        amount: null,
        quantity: { valueScaled: 30_000, unit: "kg" },
        status: "positive",
      },
    ],
    nextCursor: null,
  },
};

const ready = <T,>(data: T) => ({
  isPending: false,
  isError: false,
  error: null,
  data,
});

function renderView(overrides: Partial<React.ComponentProps<typeof ReportsView>> = {}) {
  return render(
    <ReportsView
      canRead
      reportType="inventory_by_product_unit"
      businessDate=""
      state="ready"
      result={result}
      metrics={ready(REPORT_METRIC_DEFINITIONS_DTO)}
      exporting={false}
      onReportTypeChange={() => undefined}
      onBusinessDateChange={() => undefined}
      onExport={() => undefined}
      onRetry={() => undefined}
      onMetricsRetry={() => undefined}
      onNextPage={() => undefined}
      {...overrides}
    />,
  );
}

describe("ReportsView", () => {
  it("keeps same Product/unit grades visibly separate", () => {
    renderView();
    expect(screen.getByText("Loại 1")).toBeInTheDocument();
    expect(screen.getByText("Loại 2")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Cà chua/ })).toHaveLength(2);
  });

  it("labels cross-grade quantity totals as informational aggregation", () => {
    renderView();
    expect(screen.getByText("Tổng tất cả phẩm cấp · kg")).toBeInTheDocument();
  });

  it("surfaces blocked management metrics with their next evidence", () => {
    renderView();
    expect(screen.getByRole("heading", { name: "Metric quản trị" })).toBeInTheDocument();
    const cogsCard = screen.getByRole("heading", { name: "COGS" }).closest("li");
    expect(cogsCard).not.toBeNull();
    expect(cogsCard).toHaveTextContent("Gate: ASM-039, ASM-040");
    expect(cogsCard).toHaveTextContent("Evidence tiếp theo:");
    expect(screen.queryByText("0 ₫")).not.toBeInTheDocument();
  });

  it("fails visibly instead of rendering stale totals when the report read fails", () => {
    renderView({ state: "error", result: null });
    expect(screen.getByRole("alert")).toHaveTextContent("Không hiển thị tổng cũ");
  });

  it("shows a projection integrity block instead of an empty successful report", () => {
    renderView({
      result: {
        ...result,
        integrity: "attention",
        diagnostics: ["workspace_integrity_attention", "report_projection_unavailable"],
        totals: { amount: null, quantities: [] },
        page: { items: [], nextCursor: null },
      },
    });
    expect(screen.getByText("Đang khóa số liệu")).toBeInTheDocument();
    expect(screen.getByText(/Báo cáo đang khóa vì projection chưa đối chiếu/)).toBeInTheDocument();
    expect(screen.queryByText("Không có dòng phù hợp")).not.toBeInTheDocument();
  });
});

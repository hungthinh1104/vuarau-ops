import { render, screen } from "@testing-library/react";
import type { OperationalReportDto } from "@vuarau/domain-contracts";
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

function renderView(overrides: Partial<React.ComponentProps<typeof ReportsView>> = {}) {
  return render(
    <ReportsView
      canRead
      reportType="inventory_by_product_unit"
      businessDate=""
      state="ready"
      result={result}
      exporting={false}
      onReportTypeChange={() => undefined}
      onBusinessDateChange={() => undefined}
      onExport={() => undefined}
      onRetry={() => undefined}
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

import { render, screen } from "@testing-library/react";
import {
  REPORT_METRIC_DEFINITIONS_DTO,
  type DashboardOrderStatusCountsDto,
  type DashboardSeriesDto,
  type DashboardSummaryDto,
  type DashboardTopProductsDto,
  type ManagementIntelligenceDto,
  type OperationalReportDto,
} from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import {
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  QUALITY_GRADE_2_ID,
  testUuid,
  WORKSPACE_ID,
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

const intelligence: ManagementIntelligenceDto = {
  workspaceId: WORKSPACE_ID,
  asOf: "2026-08-04T00:00:00.000Z",
  businessDate: null,
  status: "available",
  policyVersionId: testUuid("7", 2) as ManagementIntelligenceDto["policyVersionId"],
  policyVersion: 1,
  strategy: "operational_report_snapshot",
  calculationVersion: "management-intelligence-v1",
  diagnostics: [],
  sourceReportTypes: ["inventory_by_product_unit"],
  indicators: [
    {
      reportType: "inventory_by_product_unit",
      businessDate: null,
      integrity: "healthy",
      totals: { amount: null, quantities: [{ unit: "kg", valueScaled: 100_000 }] },
      sourceReportType: "inventory_by_product_unit",
      diagnostics: [],
    },
  ],
};

const dashboardSummary: DashboardSummaryDto = {
  workspaceId: WORKSPACE_ID,
  asOf: "2026-08-04T00:00:00.000Z",
  sales: {
    availability: { state: "available", diagnostics: [], updatedAt: null },
    amount: { amountMinor: 875_000, currency: "VND" },
    count: 1,
  },
  purchases: {
    availability: { state: "available", diagnostics: [], updatedAt: null },
    amount: { amountMinor: 0, currency: "VND" },
    count: 0,
  },
  received: {
    availability: { state: "available", diagnostics: [], updatedAt: null },
    quantities: [],
    count: 0,
  },
  stock: {
    availability: {
      state: "unavailable",
      diagnostics: ["projection_unavailable"],
      updatedAt: null,
    },
    quantities: [],
    count: 0,
  },
  outstandingDelivery: {
    availability: { state: "available", diagnostics: [], updatedAt: null },
    quantities: [],
    count: 0,
  },
  receivables: {
    availability: { state: "available", diagnostics: [], updatedAt: null },
    amount: { amountMinor: 0, currency: "VND" },
    count: 0,
  },
  payables: {
    availability: { state: "available", diagnostics: [], updatedAt: null },
    amount: { amountMinor: 0, currency: "VND" },
    count: 0,
  },
  cash: {
    availability: { state: "available", diagnostics: [], updatedAt: null },
    amount: { amountMinor: 0, currency: "VND" },
    count: 0,
  },
};
const dashboardSeries: DashboardSeriesDto = {
  workspaceId: WORKSPACE_ID,
  asOf: dashboardSummary.asOf,
  points: [],
};
const dashboardStatusCounts: DashboardOrderStatusCountsDto = {
  workspaceId: WORKSPACE_ID,
  asOf: dashboardSummary.asOf,
  commercial: [],
  physical: [],
  financial: [],
};
const dashboardTopProducts: DashboardTopProductsDto = {
  workspaceId: WORKSPACE_ID,
  asOf: dashboardSummary.asOf,
  products: [],
};

function renderView(overrides: Partial<React.ComponentProps<typeof ReportsView>> = {}) {
  return render(
    <ReportsView
      canRead
      reportType="inventory_by_product_unit"
      businessDate=""
      state="ready"
      result={result}
      metrics={ready(REPORT_METRIC_DEFINITIONS_DTO)}
      intelligence={ready(intelligence)}
      exporting={false}
      onReportTypeChange={() => undefined}
      onBusinessDateChange={() => undefined}
      onExport={() => undefined}
      onRetry={() => undefined}
      onMetricsRetry={() => undefined}
      onIntelligenceRetry={() => undefined}
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
    expect(screen.getByText("Tổng tất cả hạng hàng · kg")).toBeInTheDocument();
  });

  it("surfaces blocked management metrics with their next evidence", () => {
    renderView();
    expect(screen.getByRole("heading", { name: "Chỉ số quản lý" })).toBeInTheDocument();
    const cogsCard = screen.getByRole("heading", { name: "Giá vốn hàng bán" }).closest("li");
    expect(cogsCard).not.toBeNull();
    expect(cogsCard).toHaveTextContent("Điều kiện:");
    expect(cogsCard).toHaveTextContent("Bước tiếp theo:");
    expect(screen.queryByText("0 ₫")).not.toBeInTheDocument();
  });

  it("renders management snapshot lineage without turning it into a new KPI", () => {
    renderView();
    expect(screen.getByRole("heading", { name: "Ảnh chụp vận hành" })).toBeInTheDocument();
    expect(
      screen.getAllByText("Tồn kho theo mặt hàng, hạng hàng và đơn vị").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/COGS|profit|forecast/i)).not.toBeInTheDocument();
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

  it("renders a server aggregate and keeps an unavailable widget local", () => {
    renderView({
      overview: {
        summary: ready(dashboardSummary),
        series: ready(dashboardSeries),
        statusCounts: ready(dashboardStatusCounts),
        topProducts: ready(dashboardTopProducts),
        onRetry: () => undefined,
      },
    });
    expect(screen.getByRole("heading", { name: "Doanh số đã chốt" })).toBeInTheDocument();
    expect(screen.getByText("875.000 ₫")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Tồn kho hiện tại" }).closest("article"),
    ).toHaveTextContent("N/A");
    expect(screen.queryByText(/trong phạm vi tải hiện tại/)).not.toBeInTheDocument();
  });
});

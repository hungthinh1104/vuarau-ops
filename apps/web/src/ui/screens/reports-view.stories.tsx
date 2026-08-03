import type { Meta, StoryObj } from "@storybook/react-vite";
import { REPORT_METRIC_DEFINITIONS_DTO, type OperationalReportDto } from "@vuarau/domain-contracts";
import {
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  QUALITY_GRADE_2_ID,
} from "@vuarau/test-fixtures/ids";
import { ReportsView } from "./reports-view.tsx";

const inventoryReport: OperationalReportDto = {
  reportType: "inventory_by_product_unit",
  businessDate: null,
  timezone: "Asia/Ho_Chi_Minh",
  integrity: "healthy",
  diagnostics: [],
  totals: {
    amount: null,
    quantities: [{ unit: "kg", valueScaled: 100_000 }],
  },
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
        quantity: { valueScaled: 25_000, unit: "kg" },
        status: "positive",
      },
      {
        id: `${PRODUCT_CA_CHUA_ID}:legacy:kg`,
        label: "Cà chua · Chưa phân hạng · kg",
        productId: PRODUCT_CA_CHUA_ID,
        productName: "Cà chua",
        qualityGradeId: null,
        qualityGradeName: null,
        sourceType: "inventory_balance",
        sourceId: PRODUCT_CA_CHUA_ID,
        documentHref: `/products/${PRODUCT_CA_CHUA_ID}/inventory`,
        transactionTime: null,
        amount: null,
        quantity: { valueScaled: 5_000, unit: "kg" },
        status: "positive",
      },
    ],
    nextCursor: null,
  },
};

const baseArgs = {
  canRead: true,
  reportType: "inventory_by_product_unit" as const,
  businessDate: "",
  state: "ready" as const,
  result: inventoryReport,
  metrics: {
    isPending: false,
    isError: false,
    error: null,
    data: REPORT_METRIC_DEFINITIONS_DTO,
  },
  exporting: false,
  onReportTypeChange: () => undefined,
  onBusinessDateChange: () => undefined,
  onExport: () => undefined,
  onRetry: () => undefined,
  onMetricsRetry: () => undefined,
  onNextPage: () => undefined,
};

const meta = {
  title: "Screens/Reports/Operational",
  component: ReportsView,
  args: baseArgs,
} satisfies Meta<typeof ReportsView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const GradeAwareInventory: Story = {};
export const MobileGradeAwareInventory: Story = {
  globals: { viewport: { value: "mobile" } },
};
export const IntegrityAttention: Story = {
  args: {
    result: {
      ...inventoryReport,
      integrity: "attention",
      diagnostics: ["Inventory projection differs from canonical movements for one grade."],
    },
  },
};
export const ProjectionBlocked: Story = {
  args: {
    result: {
      ...inventoryReport,
      integrity: "attention",
      diagnostics: ["workspace_integrity_attention", "report_projection_unavailable"],
      totals: { amount: null, quantities: [] },
      page: { items: [], nextCursor: null },
    },
  },
};
export const EmptyReport: Story = {
  args: {
    result: {
      ...inventoryReport,
      totals: { amount: null, quantities: [] },
      page: { items: [], nextCursor: null },
    },
  },
};
export const Loading: Story = { args: { state: "loading", result: null } };
export const NetworkFailure: Story = { args: { state: "error", result: null } };
export const PermissionDenied: Story = { args: { canRead: false, result: null } };

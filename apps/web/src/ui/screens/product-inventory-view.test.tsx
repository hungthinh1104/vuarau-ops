import { render, screen } from "@testing-library/react";
import type {
  InventoryValuationResult,
  ProductDto,
  StockPlanningDto,
  WorkspacePolicyVersionId,
} from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { PRODUCT_CA_CHUA_ID, WORKSPACE_ID, testUuid } from "@vuarau/test-fixtures/ids";
import { RECORDED_AT, TRANSACTION_TIME } from "@vuarau/test-fixtures/time";
import { ProductInventoryView, type ProductInventoryViewProps } from "./product-inventory-view.tsx";

const product: ProductDto = {
  id: PRODUCT_CA_CHUA_ID,
  workspaceId: WORKSPACE_ID,
  displayName: "Cà chua",
  aliases: [],
  preferredUnit: "kg",
  isActive: true,
  version: 1,
  createdAt: RECORDED_AT,
  updatedAt: RECORDED_AT,
};

const ready = <T,>(data: T) => ({
  isPending: false,
  isError: false,
  error: null,
  data,
});

const baseProps = (valuation: InventoryValuationResult): ProductInventoryViewProps => ({
  productId: PRODUCT_CA_CHUA_ID,
  productQuery: ready(product),
  balancesQuery: ready([]),
  valuationQuery: ready(valuation),
  planningQuery: ready({
    status: "unavailable",
    workspaceId: WORKSPACE_ID,
    asOf: TRANSACTION_TIME,
    policyVersionId: null,
    strategy: null,
    calculationVersion: "stock-planning-v1",
    calculatedAt: RECORDED_AT,
    diagnostics: ["no_effective_stock_planning_policy"],
    rows: [],
  } satisfies StockPlanningDto),
  timelineQuery: { ...ready({}), isFetching: false },
  balances: [],
  grades: [],
  movements: [],
  gradeFilter: undefined,
  unitFilter: null,
  hasMore: false,
  onGradeFilterChange: () => undefined,
  onUnitFilterChange: () => undefined,
  onLoadMore: () => undefined,
  onRetryProduct: () => undefined,
  onRetryBalances: () => undefined,
  onRetryTimeline: () => undefined,
});

describe("BR-VALUATION-003 / TC-VALUATION-004", () => {
  it("renders an explicit unavailable state without inventing money", () => {
    const unavailable: InventoryValuationResult = {
      status: "unavailable",
      workspaceId: WORKSPACE_ID,
      productId: PRODUCT_CA_CHUA_ID,
      asOf: TRANSACTION_TIME,
      policyVersionId: null,
      calculationVersion: "inventory-valuation-v1",
      calculatedAt: RECORDED_AT,
      integrity: "attention",
      diagnostics: ["no_effective_inventory_valuation_policy"],
      inputReferences: [],
      currency: null,
    };

    render(<ProductInventoryView {...baseProps(unavailable)} />);

    expect(screen.getByRole("heading", { name: "Định giá tồn kho" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Không hiển thị số tiền ước đoán");
    expect(screen.queryByText(/₫/)).toBeNull();
  });

  it("renders server-calculated inventory value when the result is healthy", () => {
    const available: InventoryValuationResult = {
      status: "available",
      workspaceId: WORKSPACE_ID,
      productId: PRODUCT_CA_CHUA_ID,
      asOf: TRANSACTION_TIME,
      policyVersionId: testUuid("7", 1) as WorkspacePolicyVersionId,
      strategy: "fifo",
      calculationVersion: "inventory-valuation-v1",
      calculatedAt: RECORDED_AT,
      integrity: "healthy",
      diagnostics: [],
      inputReferences: [],
      rows: [
        {
          qualityGradeId: null,
          unit: "kg",
          quantityScaled: 1_000,
          inventoryValue: { amountMinor: 100, currency: "VND" },
          cogs: { amountMinor: 50, currency: "VND" },
          classifiedLossCost: null,
          averageUnitCost: { amountMinor: 100, currency: "VND" },
        },
      ],
      currency: "VND",
    };

    render(<ProductInventoryView {...baseProps(available)} />);

    expect(screen.getByText(/Tồn:\s*100 ₫/)).toBeInTheDocument();
    expect(screen.getByText(/Giá vốn:\s*50 ₫/)).toBeInTheDocument();
  });
});

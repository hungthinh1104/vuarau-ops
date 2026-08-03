import { render, screen } from "@testing-library/react";
import type {
  Page,
  SupplierAccountEntryDto,
  SupplierDto,
  SupplierPriceHistoryRowDto,
  SupplierPerformanceDto,
  SupplierReconciliationDto,
} from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { PRODUCT_CA_CHUA_ID, WORKSPACE_ID, testUuid } from "@vuarau/test-fixtures/ids";
import { RECORDED_AT } from "@vuarau/test-fixtures/time";
import { SupplierDetailView } from "./supplier-detail-view.tsx";

const supplierId = testUuid("e", 1) as SupplierDto["id"];
const purchaseId = testUuid("e", 2) as SupplierPriceHistoryRowDto["purchaseId"];
const purchaseLineId = testUuid("e", 3) as SupplierPriceHistoryRowDto["purchaseLineId"];

const supplier: SupplierDto = {
  id: supplierId,
  workspaceId: WORKSPACE_ID,
  displayName: "Vựa nguồn Ánh Dương",
  phone: "0909000111",
  note: null,
  isActive: true,
  version: 1,
  createdAt: RECORDED_AT,
  updatedAt: RECORDED_AT,
};

const priceHistoryRow: SupplierPriceHistoryRowDto = {
  workspaceId: WORKSPACE_ID,
  supplierId,
  purchaseId,
  purchaseLineId,
  productId: PRODUCT_CA_CHUA_ID,
  productName: "Cà chua",
  quantity: { valueScaled: 10_000, unit: "kg" },
  unitPrice: { amountMinor: 12_000, currency: "VND" },
  lineTotal: { amountMinor: 120_000, currency: "VND" },
  transactionTime: RECORDED_AT,
  recordedAt: RECORDED_AT,
  confirmedAt: RECORDED_AT,
};

const performance: SupplierPerformanceDto = {
  workspaceId: WORKSPACE_ID,
  supplierId,
  asOf: RECORDED_AT,
  windowStart: RECORDED_AT,
  status: "unavailable",
  policyVersionId: null,
  policyVersion: null,
  strategy: null,
  calculationVersion: "supplier-performance-v1",
  diagnostics: ["no_effective_supplier_evaluation_policy"],
  observationCount: 0,
  measurementObservationCount: 0,
  sourceObservationIds: [],
  quantityMetrics: [],
  timing: null,
};

const ready = <T,>(data: T) => ({
  isPending: false,
  isError: false,
  error: null,
  data,
});

function renderView(
  priceHistory: Page<SupplierPriceHistoryRowDto> = {
    items: [priceHistoryRow],
    nextCursor: null,
  },
) {
  return render(
    <SupplierDetailView
      query={ready(supplier)}
      balance={ready(null)}
      reconciliation={ready({
        status: "not_found",
        supplierId,
        projected: null,
        canonical: null,
        diagnostics: [],
      } satisfies SupplierReconciliationDto)}
      performance={ready(performance)}
      timeline={ready({ items: [], nextCursor: null } satisfies Page<SupplierAccountEntryDto>)}
      entries={[]}
      nextCursor={null}
      timelineFetching={false}
      priceHistory={ready(priceHistory)}
      priceHistoryItems={priceHistory.items}
      priceHistoryNextCursor={priceHistory.nextCursor}
      priceHistoryFetching={false}
      canUpdate={false}
      canCreatePurchase={false}
      canReadAccount={false}
      moneyActions={() => null}
      onRetry={() => undefined}
      onBalanceRetry={() => undefined}
      onReconciliationRetry={() => undefined}
      onPerformanceRetry={() => undefined}
      onTimelineRetry={() => undefined}
      onPriceHistoryRetry={() => undefined}
      onLoadMore={() => undefined}
      onPriceHistoryLoadMore={() => undefined}
    />,
  );
}

describe("SupplierDetailView price history", () => {
  it("shows confirmed source observations and links back to the Purchase", () => {
    renderView();

    expect(screen.getByRole("table", { name: "Lịch sử giá mua đã chốt" })).toBeInTheDocument();
    expect(screen.getByText("12.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("10 kg")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cà chua" })).toHaveAttribute(
      "href",
      `/purchases/${purchaseId}`,
    );
    expect(screen.getByText(/không phải giá đề xuất/)).toBeInTheDocument();
  });

  it("does not turn an empty source set into a numeric or recommendation state", () => {
    renderView({ items: [], nextCursor: null });

    expect(screen.getByText("Chưa có dòng mua đã chốt.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

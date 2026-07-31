import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { customerDetail, customerInactive } from "@/fixtures/customer.fixtures.ts";
import { CustomerDetailView } from "./customer-detail-view.tsx";

function renderView(overrides: Partial<React.ComponentProps<typeof CustomerDetailView>> = {}) {
  return render(
    <CustomerDetailView
      detail={customerDetail}
      timelineEntries={[]}
      timelineState="ready"
      timelineHasMore={false}
      timelineFetching={false}
      recentSales={[]}
      recentPayments={[]}
      canCreateSale
      canRecordPayment
      canAdjustDebt
      customerCommandLocked={false}
      onDeactivate={() => undefined}
      onReactivate={() => undefined}
      onLoadMore={() => undefined}
      onRetryTimeline={() => undefined}
      {...overrides}
    />,
  );
}

describe("CustomerDetailView", () => {
  it("keeps payment available for an inactive customer but hides a new Sale", () => {
    renderView({
      detail: {
        ...customerDetail,
        customer: {
          ...customerDetail.customer,
          id: customerInactive.id,
          displayName: customerInactive.displayName,
          isActive: false,
          version: customerInactive.version,
        },
        balance: customerInactive.balance,
        classification: customerInactive.classification,
        capabilities: customerInactive.capabilities,
      },
    });
    expect(screen.queryByRole("link", { name: "Tạo đơn mới" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ghi nhận thanh toán" })).toBeInTheDocument();
  });

  it("locks customer lifecycle mutation while command outcome is unresolved", () => {
    renderView({ customerCommandLocked: true });
    expect(screen.getByRole("button", { name: "Ngưng khách hàng" })).toBeDisabled();
  });

  it("does not infer an account value when timeline retrieval fails", () => {
    renderView({ timelineState: "error" });
    expect(screen.getByRole("alert")).toHaveTextContent("Không suy ra số dư từ dữ liệu thiếu");
  });
});

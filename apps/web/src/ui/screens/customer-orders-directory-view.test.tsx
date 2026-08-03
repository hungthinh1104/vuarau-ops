import { render, screen } from "@testing-library/react";
import type { CustomerOrderDto, Page } from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { CustomerOrdersDirectoryView } from "./customer-orders-directory-view.tsx";

const order: CustomerOrderDto = {
  id: "00000000-0000-4000-8000-000000000901" as CustomerOrderDto["id"],
  workspaceId: "00000000-0000-4000-8000-000000000902" as CustomerOrderDto["workspaceId"],
  customerId: "00000000-0000-4000-8000-000000000903" as CustomerOrderDto["customerId"],
  channel: "account_customer",
  status: "draft",
  currency: "VND",
  lines: [
    {
      lineId: "00000000-0000-4000-8000-000000000904" as CustomerOrderDto["lines"][number]["lineId"],
      productId: null,
      productName: "Cải ngọt",
      quantity: { valueScaled: 2_500, unit: "kg" },
      agreedUnitPrice: null,
      lineTotal: null,
    },
  ],
  totalAmount: null,
  note: "Khách gọi trước",
  paymentTermsSnapshot: null,
  evidenceReferences: [],
  version: 1,
  transactionTime: "2026-08-03T08:00:00.000Z",
  recordedAt: "2026-08-03T08:00:00.000Z",
  confirmedAt: null,
  cancelledAt: null,
  cancellationReason: null,
  replacesCustomerOrderId: null,
  capabilities: {
    edit: { allowed: true },
    confirm: { allowed: true },
    cancel: { allowed: true },
  },
};

const ready = <T,>(data: T) => ({ isPending: false, isError: false, error: null, data });

describe("CustomerOrdersDirectoryView", () => {
  it("TC-WEB-CUSTOMER-ORDER-001 shows unpriced commercial facts and a semantic detail link", () => {
    const page: Page<CustomerOrderDto> = { items: [order], nextCursor: null };
    render(
      <CustomerOrdersDirectoryView
        query={ready(page)}
        rows={[order]}
        nextCursor={null}
        isFetching={false}
        canCreate
        onRetry={() => undefined}
        onLoadMore={() => undefined}
      />,
    );

    expect(screen.getAllByText("Cải ngọt").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Chưa chốt giá").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Cải ngọt" })[0]).toHaveAttribute(
      "href",
      `/customer-orders/${order.id}`,
    );
  });
});

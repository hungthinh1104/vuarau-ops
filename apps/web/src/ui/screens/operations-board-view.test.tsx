import { render, screen, within } from "@testing-library/react";
import type { OperationsBoardRow } from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { OperationsBoardView } from "./operations-board-view.tsx";

const row: OperationsBoardRow = {
  id: "sale-1",
  kind: "sale",
  reference: "SALE-1",
  counterparty: "Khách lẻ",
  amount: { amountMinor: 875_000, currency: "VND" },
  commercialState: "posted",
  physicalState: "needs_delivery",
  financialState: "awaiting_payment",
  ageSeconds: 7_200,
  nextAction: "Giao hàng",
  updatedAt: "2026-08-04T00:00:00.000Z",
  href: "/sales/sale-1",
  deliveryId: null,
};

const query = {
  isPending: false,
  isError: false,
  error: null,
  data: {
    counts: {
      all: 1,
      needsReceiving: 0,
      needsDelivery: 1,
      inDelivery: 0,
      awaitingPayment: 1,
      overdue: 0,
      attention: 0,
    },
    page: { items: [row], nextCursor: null },
  },
  isFetchingNextPage: false,
  hasNextPage: false,
};

describe("OperationsBoardView", () => {
  it("keeps order, goods and payment states visible in one row", () => {
    render(
      <OperationsBoardView
        query={query}
        rows={[row]}
        filter="all"
        sort="updated_desc"
        search=""
        onFilterChange={() => undefined}
        onSortChange={() => undefined}
        onSearchChange={() => undefined}
        onRetry={() => undefined}
        onLoadMore={() => undefined}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Đơn hàng" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Hàng hóa" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Thanh toán" })).toBeInTheDocument();
    const dataRow = screen.getByRole("row", { name: /SALE-1/ });
    expect(within(dataRow).getByText("Đã chốt")).toBeInTheDocument();
    expect(screen.getAllByText("Cần giao").length).toBeGreaterThanOrEqual(2);
    expect(within(dataRow).getByText("Chờ thanh toán")).toBeInTheDocument();
  });
});

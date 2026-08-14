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
  returnedFulfilment: false,
  unallocatedPayment: false,
  unallocatedPaymentAmount: null,
  ageSeconds: 7_200,
  nextAction: "Giao hàng",
  exceptions: [],
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
      returnedFulfilment: 0,
      unallocatedPayment: 0,
      awaitingPayment: 1,
      overdue: 0,
      attention: 0,
      fulfilmentRemainderUnresolved: 0,
      returnSettlementUnresolved: 0,
      reconciliationVariance: 0,
      exceptionCounts: {
        unallocated_payment: 0,
        fulfilment_remainder_unresolved: 0,
        return_settlement_unresolved: 0,
        reconciliation_variance: 0,
      },
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

  it("keeps returned fulfilment visible on desktop and mobile", () => {
    const returnedRow = {
      ...row,
      returnedFulfilment: true,
      nextAction: "Xử lý hàng trả",
      exceptions: [
        {
          kind: "return_settlement_unresolved" as const,
          severity: "high" as const,
          closeImpact: "acknowledgeable" as const,
          source: { kind: "sale" as const, reference: "SALE-1", id: "sale-1" },
          sourceFacts: [{ key: "return_id", value: "return-1" }],
          explanation: "Hàng đã trả nhưng hệ quả chưa được quyết định.",
          unknown: "Hàng trả sẽ được xử lý thế nào.",
          resolutionOptions: [{ code: "goods_only", label: "Xác nhận chỉ nhận lại hàng" }],
          nextAction: {
            label: "Mở phiếu trả để ghi nhận quyết định xử lý.",
            href: "/sales/sale-1",
          },
          resolutionCondition: "Fact goods_only append-only xác nhận không phát sinh money effect.",
        },
      ],
    };
    render(
      <OperationsBoardView
        query={{
          ...query,
          data: {
            ...query.data,
            counts: { ...query.data.counts, returnedFulfilment: 1 },
            page: { items: [returnedRow], nextCursor: null },
          },
        }}
        rows={[returnedRow]}
        filter="returned_fulfilment"
        sort="updated_desc"
        search=""
        onFilterChange={() => undefined}
        onSortChange={() => undefined}
        onSearchChange={() => undefined}
        onRetry={() => undefined}
        onLoadMore={() => undefined}
      />,
    );
    expect(screen.getAllByText("Hàng trả cần xử lý").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Xử lý hàng trả").length).toBeGreaterThanOrEqual(2);
  });

  it("keeps unallocated customer money visible with its exact amount", () => {
    const unallocatedRow = {
      ...row,
      unallocatedPayment: true,
      unallocatedPaymentAmount: { amountMinor: 300_000, currency: "VND" as const },
      nextAction: "Mở khoản thanh toán để phân bổ hoặc ghi nhận tín dụng.",
    };
    render(
      <OperationsBoardView
        query={{
          ...query,
          data: {
            ...query.data,
            counts: { ...query.data.counts, unallocatedPayment: 1 },
            page: { items: [unallocatedRow], nextCursor: null },
          },
        }}
        rows={[unallocatedRow]}
        filter="unallocated_payment"
        sort="updated_desc"
        search=""
        onFilterChange={() => undefined}
        onSortChange={() => undefined}
        onSearchChange={() => undefined}
        onRetry={() => undefined}
        onLoadMore={() => undefined}
      />,
    );
    expect(screen.getAllByText("Tiền chưa phân bổ: 300.000 ₫").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getAllByText("Mở khoản thanh toán để phân bổ hoặc ghi nhận tín dụng.").length,
    ).toBeGreaterThanOrEqual(2);
  });
});

import { fireEvent, render, screen, within } from "@testing-library/react";
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
  fulfilmentRemainderOutcome: null,
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
      outstandingDelivery: 1,
      incompleteReceiving: 0,
      needsReceiving: 0,
      needsDelivery: 1,
      inDelivery: 0,
      returnedFulfilment: 0,
      unallocatedPayment: 0,
      overdueReceivable: 0,
      awaitingPayment: 1,
      overdue: 0,
      attention: 0,
      fulfilmentRemainderUnresolved: 0,
      returnSettlementUnresolved: 0,
      reconciliationVariance: 0,
      exceptionCounts: {
        outstanding_delivery: 0,
        incomplete_receiving: 0,
        unallocated_payment: 0,
        overdue_receivable: 0,
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
          category: "uncertainty" as const,
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

  it("exposes the server-authored explanation, unknown consequence, options and source facts", () => {
    const unresolvedRow = {
      ...row,
      exceptions: [
        {
          kind: "unallocated_payment" as const,
          category: "uncertainty" as const,
          severity: "critical" as const,
          closeImpact: "blocking" as const,
          source: { kind: "sale" as const, reference: "SALE-1", id: "sale-1" },
          sourceFacts: [
            { key: "reference", value: "SALE-1" },
            { key: "unallocated_payment_amount_minor", value: "300000" },
          ],
          explanation: "Đã nhận tiền nhưng chưa biết khoản tiền thuộc Sale hay tín dụng nào.",
          unknown: "Khoản tiền này sẽ được phân bổ vào Sale nào hoặc giữ thành tín dụng.",
          resolutionOptions: [
            { code: "allocate_to_sale", label: "Phân bổ vào Sale" },
            { code: "retain_customer_credit", label: "Ghi nhận tín dụng khách hàng" },
          ],
          nextAction: {
            label: "Mở khoản thanh toán để phân bổ hoặc ghi nhận tín dụng.",
            href: "/sales/sale-1",
          },
          resolutionCondition:
            "Số tiền chưa phân bổ bằng không hoặc được ghi nhận thành credit hợp lệ.",
        },
      ],
    };
    render(
      <OperationsBoardView
        query={{
          ...query,
          data: { ...query.data, page: { items: [unresolvedRow], nextCursor: null } },
        }}
        rows={[unresolvedRow]}
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

    const disclosures = screen.getAllByText("Vì sao cần xử lý?");
    expect(disclosures.length).toBeGreaterThanOrEqual(2);
    const details = disclosures.map((disclosure) => disclosure.closest("details"));
    expect(details.every((detail) => detail?.open === false)).toBe(true);
    fireEvent.click(disclosures[0]!);
    expect(details[0]?.open).toBe(true);
    expect(screen.getAllByText("Điều chưa biết").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Phân bổ vào Sale").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Ghi nhận tín dụng khách hàng").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText("Tiền chưa phân bổ (đơn vị nhỏ nhất)").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("300000").length).toBeGreaterThanOrEqual(1);
    const actionLink = within(details[0] as HTMLElement).getByRole("link", {
      name: "Mở bước xử lý",
    });
    expect(actionLink).toHaveAttribute("href", "/sales/sale-1");
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

  it("does not invent a destination when the exception contract has no href", () => {
    const noDestinationRow = {
      ...row,
      exceptions: [
        {
          kind: "reconciliation_variance" as const,
          category: "integrity" as const,
          severity: "critical" as const,
          closeImpact: "blocking" as const,
          source: { kind: "sale" as const, reference: "SALE-1", id: "sale-1" },
          sourceFacts: [{ key: "reconciliation_status", value: "variance" }],
          explanation: "Nguồn quan sát và sổ chuẩn đang khác nhau.",
          unknown: "Chưa biết nguồn nào là sai.",
          resolutionOptions: [{ code: "policy_blocked", label: "Chờ chính sách correction" }],
          nextAction: {
            label: "Chờ chính sách reconciliation được phê duyệt.",
            href: null,
          },
          resolutionCondition: "Giữ exception cho đến khi có policy và command.",
        },
      ],
    };
    render(
      <OperationsBoardView
        query={{
          ...query,
          data: { ...query.data, page: { items: [noDestinationRow], nextCursor: null } },
        }}
        rows={[noDestinationRow]}
        filter="reconciliation_variance"
        sort="updated_desc"
        search=""
        onFilterChange={() => undefined}
        onSortChange={() => undefined}
        onSearchChange={() => undefined}
        onRetry={() => undefined}
        onLoadMore={() => undefined}
      />,
    );

    const disclosure = screen.getAllByText("Vì sao cần xử lý?")[0]!;
    fireEvent.click(disclosure);
    const details = disclosure.closest("details") as HTMLElement;
    expect(within(details).queryByRole("link", { name: "Mở bước xử lý" })).not.toBeInTheDocument();
    expect(
      within(details).getByText(
        "Contract chưa cung cấp đường dẫn thao tác; không tự suy đoán đích đến.",
      ),
    ).toBeInTheDocument();
  });

  it("canonicalizes effective next action uniformly between desktop and mobile when row.nextAction is null", () => {
    const exceptionOnlyRow = {
      ...row,
      nextAction: null,
      exceptions: [
        {
          kind: "return_settlement_unresolved" as const,
          category: "uncertainty" as const,
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
          resolutionCondition: "Fact goods_only append-only.",
        },
      ],
    };
    render(
      <OperationsBoardView
        query={{
          ...query,
          data: { ...query.data, page: { items: [exceptionOnlyRow], nextCursor: null } },
        }}
        rows={[exceptionOnlyRow]}
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

    // Both desktop row and mobile card should show the exception's next action label
    const desktopRow = screen.getByRole("row", { name: /SALE-1/ });
    expect(
      within(desktopRow).getAllByText("Mở phiếu trả để ghi nhận quyết định xử lý.").length,
    ).toBeGreaterThanOrEqual(1);

    const mobileList = screen.getByRole("list", { name: "Việc cần xử lý" });
    expect(
      within(mobileList).getAllByText("Mở phiếu trả để ghi nhận quyết định xử lý.").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("renders unknown state fallback as Trạng thái chưa xác định instead of Cần kiểm tra", () => {
    const unknownStateRow = {
      ...row,
      commercialState:
        "unknown_custom_future_state" as unknown as OperationsBoardRow["commercialState"],
    };
    render(
      <OperationsBoardView
        query={{
          ...query,
          data: { ...query.data, page: { items: [unknownStateRow], nextCursor: null } },
        }}
        rows={[unknownStateRow]}
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

    expect(screen.getAllByText("Trạng thái chưa xác định").length).toBeGreaterThanOrEqual(1);
  });
});

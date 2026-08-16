import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TodayAction } from "@/ui/domain/today-actions.ts";
import { TodayView } from "./today-view.tsx";

const actions: readonly TodayAction[] = [
  {
    label: "Bán hàng nhanh",
    description: "Tạo đơn và thu tiền trực tiếp",
    href: "/sales/new",
    permission: "sale.create",
    area: "primary",
  },
  {
    label: "Đơn mua",
    description: "Nhập hàng từ nhà cung cấp",
    href: "/purchases",
    permission: "purchase.read",
    area: "work",
  },
  {
    label: "Báo cáo",
    description: "Tổng hợp số liệu",
    href: "/reports",
    permission: "report.read",
    area: "more",
  },
];

describe("TodayView", () => {
  it("renders quick actions, open work queues and role-based tasks in prioritized sections", () => {
    render(
      <TodayView
        actions={actions}
        deliveryQueuesVisible
        purchaseQueueVisible
        draftDeliveries={{
          loading: false,
          error: false,
          items: [
            {
              id: "del-1",
              href: "/deliveries/del-1",
              primary: "Giao cho Khách A",
              secondary: "30 kg · Đang chuẩn bị",
            },
          ],
        }}
        dispatchedDeliveries={{
          loading: false,
          error: false,
          items: [],
        }}
        openPurchases={{
          loading: false,
          error: false,
          items: [],
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Hôm nay" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Làm nhanh" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Bán hàng nhanh/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Công việc đang mở" })).toBeInTheDocument();
    expect(screen.getByText("Giao cho Khách A")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Công việc" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Đơn mua/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Thêm" })).toBeInTheDocument();
  });
});

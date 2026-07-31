import type { Permission } from "@vuarau/domain-contracts";

export type TodayAction = {
  readonly label: string;
  readonly description: string;
  readonly href: string;
  readonly permission: Permission;
  readonly area: "primary" | "work" | "more";
};

const ACTIONS: readonly TodayAction[] = [
  {
    label: "Ghi đơn nhanh",
    description: "Chọn khách, ghi hàng và chốt đơn.",
    href: "/sales/new",
    permission: "sale.create",
    area: "primary",
  },
  {
    label: "Đơn hàng",
    description: "Mở các đơn đã ghi trong vựa.",
    href: "/sales",
    permission: "sale.read",
    area: "work",
  },
  {
    label: "Nhận hàng",
    description: "Mở đơn mua để ghi nhận hàng về.",
    href: "/purchases",
    permission: "receiving.read",
    area: "work",
  },
  {
    label: "Giao hàng",
    description: "Xem phiếu giao đang cần xử lý.",
    href: "/deliveries",
    permission: "delivery.read",
    area: "work",
  },
  {
    label: "Thanh toán và công nợ",
    description: "Tìm khách trước khi ghi tiền hoặc kiểm tra tài khoản.",
    href: "/customers",
    permission: "payment.read",
    area: "work",
  },
  {
    label: "Kiểm tra vận hành",
    description: "Mở các kiểm tra integrity và khôi phục dành cho chủ vựa.",
    href: "/workspace/operations",
    permission: "workspace.manage",
    area: "more",
  },
  {
    label: "Báo cáo",
    description: "Đọc báo cáo dựng từ nguồn nghiệp vụ hiện có.",
    href: "/reports",
    permission: "report.read",
    area: "more",
  },
];

export function todayActionsFor(permissions: readonly Permission[]): readonly TodayAction[] {
  const allowed = new Set(permissions);
  return ACTIONS.filter((action) => allowed.has(action.permission));
}

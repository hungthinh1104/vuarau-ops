import type { Permission, WorkspaceRole } from "@vuarau/domain-contracts";

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
    description: "Kiểm tra dữ liệu vận hành và khôi phục khi cần.",
    href: "/workspace/operations",
    permission: "workspace.manage",
    area: "more",
  },
  {
    label: "Báo cáo",
    description: "Xem số liệu và mở chứng từ tạo ra từng con số.",
    href: "/reports",
    permission: "report.read",
    area: "more",
  },
  {
    label: "Bảng giá",
    description: "Xem và ghi các quy tắc giá chính xác đã được vựa thống nhất.",
    href: "/pricing",
    permission: "pricing.read",
    area: "more",
  },
];

const PRIMARY_BY_ROLE: Readonly<Record<WorkspaceRole, string>> = {
  owner: "/workspace/operations",
  accountant: "/customers",
  sales: "/sales/new",
  warehouse: "/purchases",
  delivery: "/deliveries",
};

export function todayActionsFor(
  permissions: readonly Permission[],
  role?: WorkspaceRole,
): readonly TodayAction[] {
  const allowed = new Set(permissions);
  const available = ACTIONS.filter((action) => allowed.has(action.permission));
  if (role === undefined) return available;
  const primaryHref = PRIMARY_BY_ROLE[role];
  return available.map((action) => {
    if (action.href === primaryHref) return { ...action, area: "primary" };
    if (action.area === "primary") return { ...action, area: "work" };
    return action;
  });
}

import type { Permission } from "@vuarau/domain-contracts";

export type NavigationItem = {
  readonly label: string;
  readonly href: string;
  readonly permission?: Permission;
};

export type NavigationGroup = {
  readonly label: string;
  readonly items: readonly NavigationItem[];
};

const DESKTOP_NAVIGATION: readonly NavigationGroup[] = [
  { label: "Hôm nay", items: [{ label: "Hôm nay", href: "/today" }] },
  {
    label: "Vận hành",
    items: [
      { label: "Đơn hàng", href: "/sales", permission: "sale.read" },
      { label: "Nhận hàng", href: "/purchases", permission: "receiving.read" },
      { label: "Tồn kho", href: "/products", permission: "inventory.read" },
      { label: "Giao hàng", href: "/deliveries", permission: "delivery.read" },
    ],
  },
  {
    label: "Tài chính",
    items: [
      { label: "Công nợ", href: "/customers", permission: "debt.read" },
      { label: "Thanh toán", href: "/customers", permission: "payment.read" },
      {
        label: "Đối soát",
        href: "/workspace/operations",
        permission: "workspace.manage",
      },
    ],
  },
  {
    label: "Quan hệ",
    items: [
      { label: "Khách hàng", href: "/customers", permission: "customer.read" },
      { label: "Nhà cung cấp", href: "/suppliers", permission: "supplier.read" },
    ],
  },
  {
    label: "Báo cáo",
    items: [{ label: "Báo cáo", href: "/reports", permission: "report.read" }],
  },
  {
    label: "Hệ thống",
    items: [{ label: "Thành viên", href: "/workspace", permission: "workspace.manage" }],
  },
];

export function navigationFor(permissions: readonly Permission[]): readonly NavigationGroup[] {
  const allowed = new Set(permissions);
  return DESKTOP_NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => item.permission === undefined || allowed.has(item.permission),
    ),
  })).filter((group) => group.items.length > 0);
}

export function navigationItemIsActive(pathname: string, href: string): boolean {
  if (href === "/today") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

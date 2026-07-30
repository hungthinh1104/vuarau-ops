import type { Permission } from "@vuarau/domain-contracts";

export type NavigationItem = {
  readonly label: string;
  readonly href: string;
  readonly activeMode: "exact" | "section";
  readonly permission?: Permission;
};

export type NavigationGroup = {
  readonly label: string;
  readonly items: readonly NavigationItem[];
};

const DESKTOP_NAVIGATION: readonly NavigationGroup[] = [
  {
    label: "Hôm nay",
    items: [{ label: "Hôm nay", href: "/today", activeMode: "exact" }],
  },
  {
    label: "Vận hành",
    items: [
      {
        label: "Ghi đơn nhanh",
        href: "/sales/new",
        activeMode: "exact",
        permission: "sale.create",
      },
      { label: "Đơn hàng", href: "/sales", activeMode: "section", permission: "sale.read" },
      {
        label: "Nhận hàng",
        href: "/purchases",
        activeMode: "section",
        permission: "receiving.read",
      },
      { label: "Tồn kho", href: "/products", activeMode: "section", permission: "inventory.read" },
      {
        label: "Phân hạng",
        href: "/quality-grades",
        activeMode: "section",
        permission: "quality.read",
      },
      {
        label: "Giao hàng",
        href: "/deliveries",
        activeMode: "section",
        permission: "delivery.read",
      },
    ],
  },
  {
    label: "Quan hệ",
    items: [
      {
        label: "Khách hàng",
        href: "/customers",
        activeMode: "section",
        permission: "customer.read",
      },
      {
        label: "Nhà cung cấp",
        href: "/suppliers",
        activeMode: "section",
        permission: "supplier.read",
      },
    ],
  },
  {
    label: "Báo cáo",
    items: [
      { label: "Báo cáo", href: "/reports", activeMode: "section", permission: "report.read" },
    ],
  },
  {
    label: "Hệ thống",
    items: [
      {
        label: "Vận hành",
        href: "/workspace/operations",
        activeMode: "section",
        permission: "workspace.manage",
      },
      {
        label: "Thành viên",
        href: "/workspace",
        activeMode: "section",
        permission: "workspace.manage",
      },
    ],
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

function pathMatchesNavigationItem(pathname: string, item: NavigationItem): boolean {
  if (item.activeMode === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function activeNavigationHref(pathname: string): string | null {
  const candidates = DESKTOP_NAVIGATION.flatMap((group) => group.items)
    .filter((item) => pathMatchesNavigationItem(pathname, item))
    .sort((left, right) => right.href.length - left.href.length);
  return candidates[0]?.href ?? null;
}

export function navigationItemIsActive(pathname: string, item: NavigationItem): boolean {
  return activeNavigationHref(pathname) === item.href;
}

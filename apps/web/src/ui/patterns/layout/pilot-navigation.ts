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

export const NAVIGATION_REGISTRY: readonly NavigationItem[] = [
  { label: "Hôm nay", href: "/today", activeMode: "exact" },
  { label: "Ghi đơn nhanh", href: "/sales/new", activeMode: "exact", permission: "sale.create" },
  { label: "Đơn hàng", href: "/sales", activeMode: "section", permission: "sale.read" },
  { label: "Đơn mua", href: "/purchases", activeMode: "section", permission: "receiving.read" },
  { label: "Hàng đến", href: "/intake", activeMode: "section", permission: "intake.read" },
  { label: "Tồn kho", href: "/products", activeMode: "section", permission: "inventory.read" },
  {
    label: "Phẩm cấp",
    href: "/quality-grades",
    activeMode: "section",
    permission: "quality.read",
  },
  {
    label: "Lỗi chất lượng",
    href: "/quality-issues",
    activeMode: "section",
    permission: "quality.issue.manage",
  },
  { label: "Giao hàng", href: "/deliveries", activeMode: "section", permission: "delivery.read" },
  { label: "Khách hàng", href: "/customers", activeMode: "section", permission: "customer.read" },
  { label: "Nhà cung cấp", href: "/suppliers", activeMode: "section", permission: "supplier.read" },
  { label: "Báo cáo", href: "/reports", activeMode: "section", permission: "report.read" },
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
];

export function hasPermissionFor(href: string, permissions: readonly Permission[]): boolean {
  const item = NAVIGATION_REGISTRY.find((i) => i.href === href);
  if (!item) return true; // If not in registry, assume no explicit permission required
  if (item.permission === undefined) return true;
  return permissions.includes(item.permission);
}

const DESKTOP_STRUCTURE = [
  { label: "Hôm nay", refs: ["/today"] },
  {
    label: "Vận hành",
    refs: [
      "/sales/new",
      "/sales",
      "/purchases",
      "/intake",
      "/products",
      "/quality-grades",
      "/quality-issues",
      "/deliveries",
    ],
  },
  { label: "Quan hệ", refs: ["/customers", "/suppliers"] },
  { label: "Báo cáo", refs: ["/reports"] },
  { label: "Hệ thống", refs: ["/workspace/operations", "/workspace"] },
];

export function navigationFor(permissions: readonly Permission[]): readonly NavigationGroup[] {
  const allowed = new Set(permissions);
  return DESKTOP_STRUCTURE.map((group) => {
    const items = group.refs
      .map((href) => NAVIGATION_REGISTRY.find((i) => i.href === href)!)
      .filter((item) => item.permission === undefined || allowed.has(item.permission));
    return { label: group.label, items };
  }).filter((group) => group.items.length > 0);
}

function pathMatchesNavigationItem(pathname: string, item: NavigationItem): boolean {
  if (item.activeMode === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function activeNavigationHref(pathname: string): string | null {
  const candidates = NAVIGATION_REGISTRY.filter((item) =>
    pathMatchesNavigationItem(pathname, item),
  ).sort((left, right) => right.href.length - left.href.length);
  return candidates[0]?.href ?? null;
}

export function navigationItemIsActive(pathname: string, item: NavigationItem): boolean {
  return activeNavigationHref(pathname) === item.href;
}

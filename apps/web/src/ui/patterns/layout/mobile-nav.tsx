"use client";

import {
  Ellipsis,
  House,
  PackageCheck,
  ReceiptText,
  Settings2,
  ShoppingCart,
  Truck,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Permission, WorkspaceRole } from "@vuarau/domain-contracts";
import { todayActionsFor } from "@/ui/patterns/today-actions.ts";
import { activeNavigationHref, hasPermissionFor } from "./pilot-navigation.ts";

const ITEMS = [
  { label: "Hôm nay", href: "/today", activeHref: "/today", icon: House },
  { label: "Đơn hàng", href: "/sales", activeHref: "/sales", icon: ReceiptText },
  { label: "Khách hàng", href: "/customers", activeHref: "/customers", icon: Users },
] as const;

const ROLE_WORK: Readonly<Record<WorkspaceRole, { label: string; icon: LucideIcon }>> = {
  owner: { label: "Cảnh báo", icon: Settings2 },
  accountant: { label: "Thanh toán", icon: WalletCards },
  sales: { label: "Ghi đơn", icon: ShoppingCart },
  warehouse: { label: "Nhận / Soạn", icon: PackageCheck },
  delivery: { label: "Chuyến giao", icon: Truck },
};

export function MobileNav({
  permissions,
  role,
}: {
  readonly permissions: readonly Permission[];
  readonly role: WorkspaceRole;
}) {
  return <MobileNavView permissions={permissions} role={role} pathname={usePathname() ?? ""} />;
}

export function MobileNavView({
  permissions,
  role,
  pathname,
}: {
  readonly permissions: readonly Permission[];
  readonly role: WorkspaceRole;
  readonly pathname: string;
}) {
  const activeHref = activeNavigationHref(pathname);
  const baseItems = ITEMS.filter((item) => hasPermissionFor(item.href, permissions));
  const todayActions = todayActionsFor(permissions, role);
  const hasWork = todayActions.some((action) => action.area === "work");
  const hasMore = todayActions.some((action) => action.area === "more");
  const roleWork = ROLE_WORK[role];
  const workItem = {
    label: roleWork.label,
    href: "/today#work",
    activeHref: null,
    icon: roleWork.icon,
  } as const;
  const moreItem = {
    label: "Thêm",
    href: "/today#more",
    activeHref: null,
    icon: Ellipsis,
  } as const;
  const visibleItems = [
    ...baseItems,
    ...(hasWork ? [workItem] : []),
    ...(hasMore ? [moreItem] : []),
  ].slice(0, 5);

  return (
    <nav
      aria-label="Điều hướng di động"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex max-w-xl">
        {visibleItems.map((item) => {
          const active = item.activeHref !== null && activeHref === item.activeHref;
          const Icon = item.icon;
          return (
            <li key={`${item.label}:${item.href}`} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "touch-target relative flex min-h-16 w-full flex-col items-center justify-center gap-1 px-1 text-center text-caption font-medium transition-colors",
                  active ? "text-leaf" : "text-ink-muted hover:text-ink",
                ].join(" ")}
              >
                <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={active ? 2.2 : 1.8} />
                <span>{item.label}</span>
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-1 h-1 w-5 rounded-pill bg-leaf"
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

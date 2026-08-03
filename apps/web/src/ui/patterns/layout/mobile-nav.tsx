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
import { todayActionsFor } from "@/ui/domain/today-actions.ts";
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
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-2 right-2 sm:left-4 sm:right-4 z-40 lg:hidden pointer-events-none"
    >
      <div className="mx-auto max-w-[420px] pointer-events-auto p-1.5 rounded-[24px] sm:rounded-3xl border border-border bg-surface/70 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_8px_30px_rgb(0,0,0,0.08)] ring-1 ring-ink/5">
        <ul className="flex items-center justify-between gap-1">
          {visibleItems.map((item) => {
            const active = item.activeHref !== null && activeHref === item.activeHref;
            const Icon = item.icon;
            return (
              <li key={`${item.label}:${item.href}`} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "touch-target relative flex min-h-[60px] w-full flex-col items-center justify-center gap-1 rounded-[18px] sm:rounded-[20px] transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    active ? "bg-surface shadow-sm ring-1 ring-ink/5" : "hover:bg-surface/50",
                  ].join(" ")}
                >
                  <Icon
                    aria-hidden="true"
                    className={[
                      "h-[20px] w-[20px] sm:h-[22px] sm:w-[22px] transition-colors duration-200",
                      active ? "text-primary" : "text-ink-muted/60",
                    ].join(" ")}
                    strokeWidth={active ? 2.2 : 1.8}
                  />
                  <span
                    className={[
                      "text-[9px] sm:text-[10px] font-bold transition-colors duration-200 tracking-tight whitespace-nowrap",
                      active ? "text-primary" : "text-ink-muted/80",
                    ].join(" ")}
                  >
                    {item.label}
                  </span>
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute -top-[5px] h-1.5 w-5 sm:w-6 rounded-full bg-primary shadow-[0_2px_8px_rgba(59,166,241,0.6)]"
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

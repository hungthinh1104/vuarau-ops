"use client";

import {
  Ellipsis,
  House,
  PackageCheck,
  ReceiptText,
  ShoppingBasket,
  ShoppingCart,
  Boxes,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Permission, WorkspaceRole } from "@vuarau/domain-contracts";
import { todayActionsFor } from "@/ui/domain/today-actions.ts";
import { activeNavigationHref, hasPermissionFor } from "./pilot-navigation.ts";
import { useWorkspaceChrome } from "./workspace-chrome.tsx";

const ITEMS = [
  { label: "Hôm nay", href: "/today", activeHrefs: ["/today"], icon: House },
  {
    label: "Mua",
    href: "/purchases",
    activeHrefs: ["/purchases", "/intake"],
    icon: ShoppingBasket,
  },
  {
    label: "Bán",
    href: "/sales",
    activeHrefs: ["/sales", "/sales/new", "/customer-orders", "/deliveries"],
    icon: ReceiptText,
  },
  { label: "Kho", href: "/products", activeHrefs: ["/products", "/pricing"], icon: Boxes },
] as const;

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
  const workItem = {
    label: "Việc hôm nay",
    href: "/today#work",
    activeHref: null,
    icon: role === "warehouse" ? PackageCheck : ShoppingCart,
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
  const chrome = useWorkspaceChrome();

  if (chrome?.actionDockCount !== undefined && chrome.actionDockCount > 0) return null;

  return (
    <nav
      aria-label="Điều hướng di động"
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-2 right-2 sm:left-4 sm:right-4 z-40 lg:hidden pointer-events-none"
    >
      <div className="mx-auto max-w-[420px] pointer-events-auto rounded-card border border-border bg-surface p-1.5">
        <ul className="flex items-center justify-between gap-1">
          {visibleItems.map((item) => {
            const activeHrefs =
              "activeHrefs" in item ? (item.activeHrefs as readonly string[]) : [];
            const active = activeHrefs.includes(activeHref ?? "");
            const Icon = item.icon;
            return (
              <li key={`${item.label}:${item.href}`} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "touch-target relative flex min-h-[60px] w-full flex-col items-center justify-center gap-1 rounded-input transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    active ? "bg-brand-soft" : "hover:bg-surface-muted",
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
                      "text-caption font-semibold transition-colors whitespace-nowrap",
                      active ? "text-primary" : "text-ink-muted/80",
                    ].join(" ")}
                  >
                    {item.label}
                  </span>
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute -top-[5px] h-1.5 w-6 rounded-pill bg-primary"
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

"use client";

import { ClipboardCheck, Ellipsis, House, ReceiptText, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeNavigationHref, hasPermissionFor } from "./pilot-navigation.ts";
import { todayActionsFor } from "@/ui/patterns/today-actions.ts";
import type { Permission } from "@vuarau/domain-contracts";

const ITEMS = [
  { label: "Hôm nay", href: "/today", activeHref: "/today", icon: House },
  { label: "Đơn hàng", href: "/sales", activeHref: "/sales", icon: ReceiptText },
  { label: "Khách hàng", href: "/customers", activeHref: "/customers", icon: Users },
] as const;

export function MobileNav({ permissions }: { readonly permissions: readonly Permission[] }) {
  return <MobileNavView permissions={permissions} pathname={usePathname() ?? ""} />;
}

export function MobileNavView({
  permissions,
  pathname,
}: {
  readonly permissions: readonly Permission[];
  readonly pathname: string;
}) {
  const activeHref = activeNavigationHref(pathname);
  const baseItems = ITEMS.filter((item) => hasPermissionFor(item.href, permissions));
  const todayActions = todayActionsFor(permissions);
  const hasWork = todayActions.some((action) => action.area === "work");
  const hasMore = todayActions.some((action) => action.area === "more");
  const workItem = {
    label: "Công việc",
    href: "/today#work",
    activeHref: null,
    icon: ClipboardCheck,
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
  ];

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
            <li key={item.label} className="flex-1">
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

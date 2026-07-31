"use client";

import { ClipboardCheck, Ellipsis, House, ReceiptText, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeNavigationHref, hasPermissionFor } from "./pilot-navigation.ts";
import type { Permission } from "@vuarau/domain-contracts";

const ITEMS = [
  { label: "Hôm nay", href: "/today", activeHref: "/today", icon: House },
  { label: "Đơn hàng", href: "/sales", activeHref: "/sales", icon: ReceiptText },
  { label: "Khách hàng", href: "/customers", activeHref: "/customers", icon: Users },
  { label: "Công việc", href: "/today#work", activeHref: null, icon: ClipboardCheck },
  { label: "Thêm", href: "/today#more", activeHref: null, icon: Ellipsis },
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
  const visibleItems = ITEMS.filter(
    (item) => item.href.includes("#") || hasPermissionFor(item.href, permissions),
  );

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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeNavigationHref, hasPermissionFor } from "./pilot-navigation.ts";
import type { Permission } from "@vuarau/domain-contracts";

const ITEMS = [
  { label: "Hôm nay", href: "/today", activeHref: "/today" },
  { label: "Đơn hàng", href: "/sales", activeHref: "/sales" },
  { label: "Khách hàng", href: "/customers", activeHref: "/customers" },
  { label: "Công việc", href: "/today#work", activeHref: null },
  { label: "Thêm", href: "/today#more", activeHref: null },
] as const;

export function MobileNav({ permissions }: { readonly permissions: readonly Permission[] }) {
  const pathname = usePathname() ?? "";
  const activeHref = activeNavigationHref(pathname);

  const visibleItems = ITEMS.filter(
    (item) =>
      // "#" hrefs like /today#more are UI anchors, assume they don't require specific permissions
      // actual routes check against registry
      item.href.includes("#") || hasPermissionFor(item.href, permissions),
  );

  return (
    <nav
      aria-label="Điều hướng di động"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface lg:hidden"
    >
      <ul className="mx-auto flex justify-around max-w-xl">
        {visibleItems.map((item) => {
          const active = item.activeHref !== null && activeHref === item.activeHref;
          return (
            <li key={item.label} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex min-h-16 items-center justify-center px-1 text-center text-caption font-medium w-full",
                  active ? "bg-leaf-soft text-leaf" : "text-ink-muted",
                ].join(" ")}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

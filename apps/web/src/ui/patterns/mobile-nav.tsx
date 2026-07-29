"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { label: "Hôm nay", href: "/today", matches: ["/today"] },
  { label: "Đơn hàng", href: "/sales", matches: ["/sales"] },
  { label: "Khách hàng", href: "/customers", matches: ["/customers"] },
  { label: "Công việc", href: "/today#work", matches: [] },
  { label: "Thêm", href: "/today#more", matches: [] },
] as const;

export function MobileNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="Điều hướng di động"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface lg:hidden"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {ITEMS.map((item) => {
          const active = item.matches.some(
            (path) => pathname === path || pathname.startsWith(`${path}/`),
          );
          return (
            <li key={item.label}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex min-h-16 items-center justify-center px-1 text-center text-caption font-medium",
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

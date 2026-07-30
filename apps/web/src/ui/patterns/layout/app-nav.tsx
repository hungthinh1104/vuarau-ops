"use client";

import type { Permission } from "@vuarau/domain-contracts";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigationFor, navigationItemIsActive } from "./pilot-navigation.ts";

export function AppNav({ permissions }: { readonly permissions: readonly Permission[] }) {
  const pathname = usePathname() ?? "";
  const groups = navigationFor(permissions);

  return (
    <nav aria-label="Điều hướng chính" className="hidden w-56 shrink-0 py-5 lg:block">
      <div className="sticky top-4 grid gap-5">
        {groups.map((group) => (
          <section key={group.label} aria-labelledby={`nav-${group.label}`}>
            <h2
              id={`nav-${group.label}`}
              className="mb-1 px-3 text-caption font-semibold uppercase tracking-wide text-ink-muted"
            >
              {group.label}
            </h2>
            <ul className="grid gap-1">
              {group.items.map((item) => {
                const active = navigationItemIsActive(pathname, item);
                return (
                  <li key={`${group.label}:${item.label}`}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={[
                        "flex min-h-10 items-center rounded-button px-3 text-body-sm font-medium",
                        active ? "bg-leaf-soft text-leaf" : "text-ink hover:bg-surface-muted",
                      ].join(" ")}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  );
}

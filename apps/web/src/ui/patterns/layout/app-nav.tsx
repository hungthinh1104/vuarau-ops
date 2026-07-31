"use client";

import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  ClipboardList,
  FileBarChart,
  House,
  PackageCheck,
  Settings2,
  ShoppingCart,
  SlidersHorizontal,
  Truck,
  UserRoundCog,
  Users,
  Warehouse,
} from "lucide-react";
import type { Permission } from "@vuarau/domain-contracts";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigationFor, navigationItemIsActive } from "./pilot-navigation.ts";

const ICONS: Readonly<Record<string, LucideIcon>> = {
  "/today": House,
  "/sales/new": ShoppingCart,
  "/sales": ClipboardList,
  "/purchases": PackageCheck,
  "/products": Boxes,
  "/quality-grades": SlidersHorizontal,
  "/deliveries": Truck,
  "/customers": Users,
  "/suppliers": Warehouse,
  "/reports": FileBarChart,
  "/workspace/operations": Settings2,
  "/workspace": UserRoundCog,
};

export function AppNav({ permissions }: { readonly permissions: readonly Permission[] }) {
  return <AppNavView permissions={permissions} pathname={usePathname() ?? ""} />;
}

export function AppNavView({
  permissions,
  pathname,
}: {
  readonly permissions: readonly Permission[];
  readonly pathname: string;
}) {
  const groups = navigationFor(permissions);

  return (
    <nav aria-label="Điều hướng chính" className="hidden w-64 shrink-0 py-6 lg:block">
      <div className="sticky top-4 grid gap-6">
        {groups.map((group) => (
          <section key={group.label} aria-labelledby={`nav-${group.label}`}>
            <h2
              id={`nav-${group.label}`}
              className="mb-2 px-3 text-caption font-semibold uppercase tracking-[0.08em] text-ink-muted"
            >
              {group.label}
            </h2>
            <ul className="grid gap-1">
              {group.items.map((item) => {
                const active = navigationItemIsActive(pathname, item);
                const Icon = ICONS[item.href] ?? House;
                return (
                  <li key={`${group.label}:${item.label}`}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={[
                        "relative flex min-h-11 items-center gap-3 rounded-button px-3 text-body-sm font-medium transition-colors",
                        active
                          ? "bg-leaf-soft text-leaf"
                          : "text-ink hover:bg-surface-muted hover:text-ink",
                      ].join(" ")}
                    >
                      {active ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-2 left-0 w-0.5 rounded-r bg-leaf"
                        />
                      ) : null}
                      <Icon
                        aria-hidden="true"
                        className="h-[18px] w-[18px] shrink-0"
                        strokeWidth={1.8}
                      />
                      <span>{item.label}</span>
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

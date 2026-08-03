"use client";

import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  ClipboardList,
  FileBarChart,
  House,
  PackageCheck,
  Tags,
  Settings2,
  ShoppingCart,
  SlidersHorizontal,
  Truck,
  UserRoundCog,
  Users,
  Warehouse,
  FileCheck,
  AlertTriangle,
  PackageOpen,
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
  "/intake": PackageOpen,
  "/evidence": FileCheck,
  "/products": Boxes,
  "/pricing": Tags,
  "/quality-grades": SlidersHorizontal,
  "/quality-issues": AlertTriangle,
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
    <nav aria-label="Điều hướng chính" className="hidden w-[220px] xl:w-[260px] shrink-0 lg:block">
      <div className="sticky top-[6.5rem] flex max-h-[calc(100dvh-8rem)] flex-col gap-6 overflow-y-auto rounded-3xl border border-border bg-surface/40 p-4 xl:p-5 shadow-sm ring-1 ring-ink/5 backdrop-blur-xl [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {groups.map((group) => {
          const groupId = `nav-${group.label
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")}`;
          return (
            <section key={group.label} aria-labelledby={groupId}>
              <h2
                id={groupId}
                className="mb-1.5 xl:mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted/50"
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
                          "group relative flex min-h-10 items-center gap-2 xl:gap-3 rounded-2xl px-2 xl:px-3 text-[13px] font-semibold transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary",
                          active
                            ? "bg-surface text-primary shadow-sm ring-1 ring-ink/5"
                            : "text-ink-muted/80 hover:bg-surface/60 hover:text-ink hover:shadow-sm",
                        ].join(" ")}
                      >
                        <div
                          className={[
                            "flex h-[26px] w-[26px] items-center justify-center rounded-[8px] transition-all duration-200",
                            active ? "bg-primary/10" : "bg-transparent",
                          ].join(" ")}
                        >
                          <Icon
                            aria-hidden="true"
                            className={[
                              "h-[16px] w-[16px] shrink-0 transition-colors duration-200",
                              active
                                ? "text-primary"
                                : "text-ink-muted/60 group-hover:text-ink-muted",
                            ].join(" ")}
                            strokeWidth={active ? 2.2 : 1.8}
                          />
                        </div>
                        <span className="truncate">{item.label}</span>
                        {active ? (
                          <span
                            aria-hidden="true"
                            className="absolute right-3 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_8px_rgba(59,166,241,0.6)]"
                          />
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </nav>
  );
}

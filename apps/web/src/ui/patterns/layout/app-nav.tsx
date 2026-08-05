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
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { Permission } from "@vuarau/domain-contracts";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { navigationFor, navigationItemIsActive } from "./pilot-navigation.ts";
import { Button } from "@/ui/primitives/button.tsx";
import { IconButton } from "@/ui/primitives/icon-button.tsx";

const ICONS: Readonly<Record<string, LucideIcon>> = {
  "/today": House,
  "/sales/new": ShoppingCart,
  "/sales": ClipboardList,
  "/customer-orders": ClipboardList,
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
  "/operations-board": FileBarChart,
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
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    () => new Set(["Cấu hình", "Quản trị"]),
  );

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("vuarau:nav-collapsed") === "true");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem("vuarau:nav-collapsed", String(next));
      return next;
    });
  };

  const toggleGroup = (label: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  return (
    <nav
      aria-label="Điều hướng chính"
      className={["hidden shrink-0 lg:block", collapsed ? "w-[72px]" : "w-[240px]"].join(" ")}
    >
      <div className="sticky top-[5rem] flex max-h-[calc(100dvh-6rem)] flex-col gap-4 overflow-y-auto rounded-card border border-border bg-surface p-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className={collapsed ? "flex justify-center" : "flex justify-end"}>
          <IconButton
            label={collapsed ? "Mở rộng điều hướng" : "Thu gọn điều hướng"}
            onClick={toggleCollapsed}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </IconButton>
        </div>
        {groups.map((group) => {
          const groupId = `nav-${group.label
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")}`;
          const groupCollapsed = collapsedGroups.has(group.label);
          return (
            <section key={group.label} aria-labelledby={groupId}>
              {collapsed ? (
                <h2 id={groupId} className="sr-only">
                  {group.label}
                </h2>
              ) : (
                <Button
                  tone="link"
                  type="button"
                  aria-expanded={!groupCollapsed}
                  aria-controls={`${groupId}-items`}
                  onClick={() => toggleGroup(group.label)}
                  className="mb-1 flex min-h-8 w-full items-center justify-between gap-2 rounded-input px-3 text-caption font-semibold text-ink-muted hover:bg-surface-muted hover:text-ink"
                >
                  <span id={groupId}>{group.label}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className={[
                      "h-4 w-4 transition-transform",
                      groupCollapsed ? "-rotate-90" : "",
                    ].join(" ")}
                  />
                </Button>
              )}
              <ul
                id={`${groupId}-items`}
                className={["grid gap-1", !collapsed && groupCollapsed ? "hidden" : ""].join(" ")}
              >
                {group.items.map((item) => {
                  const active = navigationItemIsActive(pathname, item);
                  const Icon = ICONS[item.href] ?? House;
                  return (
                    <li key={`${group.label}:${item.label}`}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        aria-label={collapsed ? item.label : undefined}
                        title={collapsed ? item.label : undefined}
                        className={[
                          "group relative flex min-h-10 items-center gap-3 rounded-input px-3 text-label font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary",
                          collapsed ? "justify-center px-0" : "",
                          active
                            ? "bg-brand-soft text-primary"
                            : "text-ink-muted hover:bg-surface-muted hover:text-ink",
                        ].join(" ")}
                      >
                        <div
                          className={[
                            "flex h-7 w-7 items-center justify-center rounded-input transition-colors",
                            active ? "bg-surface" : "bg-transparent",
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
                        <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
                        {active ? (
                          <span
                            aria-hidden="true"
                            className="absolute right-3 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-pill bg-primary"
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

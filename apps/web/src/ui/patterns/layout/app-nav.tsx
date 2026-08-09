"use client";

import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Boxes,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  CircleGauge,
  ClipboardList,
  FileBarChart,
  FileCheck,
  Handshake,
  House,
  PackageCheck,
  PackageOpen,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Settings2,
  ShoppingBasket,
  ShoppingCart,
  SlidersHorizontal,
  Tags,
  Truck,
  UserRoundCog,
  Users,
  Warehouse,
} from "lucide-react";
import type { Permission } from "@vuarau/domain-contracts";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type FocusEvent } from "react";
import { navigationFor, navigationItemIsActive, type NavigationGroup } from "./pilot-navigation.ts";
import { Button } from "@/ui/primitives/button.tsx";
import { IconButton } from "@/ui/primitives/icon-button.tsx";

const ITEM_ICONS: Readonly<Record<string, LucideIcon>> = {
  "/today": House,
  "/sales/new": ShoppingCart,
  "/sales": ReceiptText,
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
  "/operations-board": CircleGauge,
  "/workspace/operations": Settings2,
  "/workspace": UserRoundCog,
};

const GROUP_ICONS: Readonly<Record<string, LucideIcon>> = {
  "Hôm nay": House,
  "Mua & nhập hàng": ShoppingBasket,
  "Bán & giao hàng": ReceiptText,
  "Kho & giá": Boxes,
  "Quan hệ": Handshake,
  "Báo cáo": ChartNoAxesCombined,
  "Cấu hình": SlidersHorizontal,
  "Quản trị": Settings2,
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
  const groups = useMemo(() => navigationFor(permissions), [permissions]);
  const [collapsed, setCollapsed] = useState(false);
  const [openRailGroup, setOpenRailGroup] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    () => new Set(["Cấu hình", "Quản trị"]),
  );

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("vuarau:nav-collapsed") === "true");
  }, []);

  useEffect(() => {
    setOpenRailGroup(null);
    const activeGroup = groups.find((group) =>
      group.items.some((item) => navigationItemIsActive(pathname, item)),
    );
    if (activeGroup !== undefined) {
      setCollapsedGroups((current) => {
        if (!current.has(activeGroup.label)) return current;
        const next = new Set(current);
        next.delete(activeGroup.label);
        return next;
      });
    }
  }, [groups, pathname]);

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem("vuarau:nav-collapsed", String(next));
      if (!next) setOpenRailGroup(null);
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
      className={[
        "hidden shrink-0 transition-[width] duration-150 lg:block",
        collapsed ? "w-[72px]" : "w-[248px]",
      ].join(" ")}
    >
      <div className="sticky top-[5rem] flex h-[calc(100dvh-6rem)] flex-col border-r border-border pr-3">
        <div
          className={[
            "min-h-0 flex-1 py-1",
            collapsed
              ? "overflow-visible"
              : "overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
          ].join(" ")}
        >
          {collapsed ? (
            <CollapsedNavigation
              groups={groups}
              pathname={pathname}
              openGroup={openRailGroup}
              onOpenGroup={setOpenRailGroup}
            />
          ) : (
            <ExpandedNavigation
              groups={groups}
              pathname={pathname}
              collapsedGroups={collapsedGroups}
              onToggleGroup={toggleGroup}
            />
          )}
        </div>
        <div
          className={
            collapsed
              ? "flex justify-center border-t border-border py-3"
              : "flex items-center justify-between border-t border-border py-3"
          }
        >
          {collapsed ? null : <span className="text-caption text-ink-muted">Điều hướng</span>}
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
      </div>
    </nav>
  );
}

function ExpandedNavigation({
  groups,
  pathname,
  collapsedGroups,
  onToggleGroup,
}: {
  readonly groups: readonly NavigationGroup[];
  readonly pathname: string;
  readonly collapsedGroups: ReadonlySet<string>;
  readonly onToggleGroup: (label: string) => void;
}) {
  return (
    <div className="grid gap-3">
      {groups.map((group) => {
        const groupId = groupDomId(group.label);
        const groupCollapsed = collapsedGroups.has(group.label);
        const onlyItem = group.items.length === 1 ? group.items[0] : undefined;
        if (onlyItem?.label === group.label) {
          return (
            <ul key={group.label} className="grid gap-0.5">
              <NavigationLeaf item={onlyItem} pathname={pathname} />
            </ul>
          );
        }
        return (
          <section key={group.label} aria-labelledby={groupId}>
            <Button
              tone="link"
              type="button"
              aria-expanded={!groupCollapsed}
              aria-controls={`${groupId}-items`}
              onClick={() => onToggleGroup(group.label)}
              className="mb-1 flex min-h-8 w-full items-center justify-between gap-2 px-2 text-caption font-semibold text-ink-muted no-underline hover:text-ink hover:no-underline"
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
            <ul id={`${groupId}-items`} className={groupCollapsed ? "hidden" : "grid gap-0.5"}>
              {group.items.map((item) => (
                <NavigationLeaf key={item.href} item={item} pathname={pathname} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function CollapsedNavigation({
  groups,
  pathname,
  openGroup,
  onOpenGroup,
}: {
  readonly groups: readonly NavigationGroup[];
  readonly pathname: string;
  readonly openGroup: string | null;
  readonly onOpenGroup: (label: string | null) => void;
}) {
  return (
    <ul className="grid gap-1.5">
      {groups.map((group) => {
        const active = group.items.some((item) => navigationItemIsActive(pathname, item));
        const Icon = GROUP_ICONS[group.label] ?? Boxes;
        const onlyItem = group.items.length === 1 ? group.items[0] : undefined;
        const open = openGroup === group.label;
        const handleBlur = (event: FocusEvent<HTMLLIElement>) => {
          if (!event.currentTarget.contains(event.relatedTarget)) onOpenGroup(null);
        };
        return (
          <li key={group.label} className="group/rail relative" onBlur={handleBlur}>
            {onlyItem === undefined ? (
              <Button
                tone="link"
                type="button"
                aria-label={`Mở nhóm ${group.label}`}
                aria-expanded={open}
                aria-controls={`${groupDomId(group.label)}-rail-menu`}
                onClick={() => onOpenGroup(open ? null : group.label)}
                className={railLauncherClass(active)}
              >
                <Icon aria-hidden="true" className="h-5 w-5" />
                <ChevronRight aria-hidden="true" className="absolute bottom-2 right-1 h-3 w-3" />
              </Button>
            ) : (
              <Link
                href={onlyItem.href}
                aria-current={active ? "page" : undefined}
                aria-label={onlyItem.label}
                className={railLauncherClass(active)}
              >
                <Icon aria-hidden="true" className="h-5 w-5" />
              </Link>
            )}
            <span
              className={[
                "pointer-events-none absolute left-[calc(100%+0.5rem)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-input border border-border bg-surface px-2 py-1.5 text-caption font-semibold text-ink",
                open ? "hidden" : "hidden group-hover/rail:block group-focus-within/rail:block",
              ].join(" ")}
            >
              {group.label}
            </span>
            {onlyItem === undefined && open ? (
              <div
                id={`${groupDomId(group.label)}-rail-menu`}
                className="absolute left-[calc(100%+0.75rem)] top-0 z-[60] w-64 rounded-card border border-border bg-surface p-2"
              >
                <p className="px-3 py-2 text-caption font-semibold text-ink-muted">{group.label}</p>
                <ul className="grid gap-0.5">
                  {group.items.map((item) => (
                    <NavigationLeaf key={item.href} item={item} pathname={pathname} />
                  ))}
                </ul>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function NavigationLeaf({
  item,
  pathname,
}: {
  readonly item: NavigationGroup["items"][number];
  readonly pathname: string;
}) {
  const active = navigationItemIsActive(pathname, item);
  const Icon = ITEM_ICONS[item.href] ?? House;
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={[
          "flex min-h-10 items-center gap-3 border-l-2 px-3 text-label font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
          active
            ? "border-primary bg-brand-soft text-primary"
            : "border-transparent text-ink-muted hover:bg-surface-muted hover:text-ink",
        ].join(" ")}
      >
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={active ? 2.2 : 1.8} />
        <span className="truncate">{item.label}</span>
      </Link>
    </li>
  );
}

function railLauncherClass(active: boolean): string {
  return [
    "relative flex h-12 min-h-12 w-full items-center justify-center border-l-2 text-ink-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
    active
      ? "border-primary bg-brand-soft text-primary"
      : "border-transparent hover:bg-surface-muted hover:text-ink",
  ].join(" ");
}

function groupDomId(label: string): string {
  return `nav-${label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}`;
}

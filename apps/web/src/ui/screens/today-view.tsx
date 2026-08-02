"use client";

import {
  ArrowRight,
  BarChart3,
  ClipboardList,
  PackageCheck,
  Settings2,
  ShoppingCart,
  Truck,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import type { TodayAction } from "@/ui/patterns/today-actions.ts";

const ACTION_ICONS: Readonly<Record<string, LucideIcon>> = {
  "/sales/new": ShoppingCart,
  "/sales": ClipboardList,
  "/purchases": PackageCheck,
  "/deliveries": Truck,
  "/customers": WalletCards,
  "/workspace/operations": Settings2,
  "/reports": BarChart3,
};

export type TodayQueueItem = {
  readonly id: string;
  readonly href: string;
  readonly primary: string;
  readonly secondary: string;
};

export type TodayQueueState = {
  readonly loading: boolean;
  readonly error: boolean;
  readonly items: readonly TodayQueueItem[];
};

export type TodayViewProps = {
  readonly actions: readonly TodayAction[];
  readonly deliveryQueuesVisible: boolean;
  readonly purchaseQueueVisible: boolean;
  readonly draftDeliveries: TodayQueueState;
  readonly dispatchedDeliveries: TodayQueueState;
  readonly openPurchases: TodayQueueState;
};

export function TodayView({
  actions,
  deliveryQueuesVisible,
  purchaseQueueVisible,
  draftDeliveries,
  dispatchedDeliveries,
  openPurchases,
}: TodayViewProps) {
  const primary = actions.filter((action) => action.area === "primary");
  const work = actions.filter((action) => action.area === "work");
  const more = actions.filter((action) => action.area === "more");

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Hôm nay"
        description="Việc cần làm, lối vào nhanh và trạng thái vận hành của ca hiện tại."
      />

      {primary.length > 0 ? (
        <section aria-labelledby="quick-actions-title">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 id="quick-actions-title" className="text-label font-semibold text-ink-muted">
              Làm nhanh
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {primary.map((action) => (
              <QuickAction key={action.label} action={action} primary />
            ))}
          </div>
        </section>
      ) : null}

      {deliveryQueuesVisible || purchaseQueueVisible ? (
        <section aria-labelledby="attention-title" className="grid gap-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-caption font-semibold uppercase tracking-wide text-warning">
                Cần xử lý
              </p>
              <h2 id="attention-title" className="text-heading font-bold text-ink">
                Công việc đang mở
              </h2>
            </div>
            <p className="hidden text-body-sm text-ink-muted md:block">
              Mở thẳng vào nghiệp vụ thay vì tìm lại trong menu.
            </p>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            {deliveryQueuesVisible ? (
              <>
                <WorkQueue title="Phiếu cần xuất hàng" href="/deliveries" state={draftDeliveries} />
                <WorkQueue
                  title="Phiếu đang giao"
                  href="/deliveries"
                  state={dispatchedDeliveries}
                />
              </>
            ) : null}
            {purchaseQueueVisible ? (
              <WorkQueue title="Đơn mua đã xác nhận" href="/purchases" state={openPurchases} />
            ) : null}
          </div>
        </section>
      ) : null}

      {work.length > 0 ? (
        <section id="work" aria-labelledby="work-title" className="grid gap-3">
          <div>
            <p className="text-caption font-semibold uppercase tracking-wide text-ink-muted">
              Theo vai trò
            </p>
            <h2 id="work-title" className="text-subheading font-semibold">
              Công việc
            </h2>
          </div>
          <ActionGrid actions={work} />
        </section>
      ) : null}

      {more.length > 0 ? (
        <section
          id="more"
          aria-labelledby="more-title"
          className="grid gap-3 border-t border-border pt-5"
        >
          <h2 id="more-title" className="text-subheading font-semibold">
            Thêm
          </h2>
          <ActionGrid actions={more} />
        </section>
      ) : null}
    </div>
  );
}

function QuickAction({ action, primary = false }: { action: TodayAction; primary?: boolean }) {
  const Icon = ACTION_ICONS[action.href] ?? UsersRound;
  return (
    <Link
      href={action.href}
      className={[
        "group flex min-h-24 items-center gap-4 rounded-panel border p-4 transition-colors",
        primary
          ? "border-brand/25 bg-brand text-white hover:bg-brand-hover"
          : "border-border bg-surface hover:border-border-strong",
      ].join(" ")}
    >
      <span
        className={[
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-card",
          primary ? "bg-white/15 text-white" : "bg-surface-muted text-ink",
        ].join(" ")}
      >
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-subheading font-semibold">{action.label}</span>
        <span className={primary ? "text-body-sm text-white/80" : "text-body-sm text-ink-muted"}>
          {action.description}
        </span>
      </span>
      <ArrowRight
        aria-hidden="true"
        className="h-5 w-5 shrink-0 opacity-70 transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

function WorkQueue({
  title,
  href,
  state,
}: {
  title: string;
  href: string;
  state: TodayQueueState;
}) {
  return (
    <section className="border-t border-border pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-subheading font-semibold">{title}</h3>
      </div>
      <div className="mt-3">
        {state.loading ? (
          <p className="text-body-sm text-ink-muted">Đang tải…</p>
        ) : state.error ? (
          <p role="alert" className="text-body-sm text-warning">
            Chưa tải được dữ liệu.
          </p>
        ) : state.items.length === 0 ? (
          <p className="text-body-sm text-ink-muted">Không có việc trong trang hiện tại.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {state.items.slice(0, 3).map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="touch-target group flex items-center gap-2 py-2 text-body-sm"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink group-hover:text-leaf">
                      {item.primary}
                    </span>
                    <span className="block text-caption text-ink-muted">{item.secondary}</span>
                  </span>
                  <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-muted" />
                </Link>
              </li>
            ))}
            {state.items.length > 3 ? (
              <li className="pt-2 text-body-sm text-ink-muted">Còn thêm trong danh sách.</li>
            ) : null}
          </ul>
        )}
      </div>
      <Link
        href={href}
        className="mt-3 inline-flex min-h-10 items-center gap-1 text-body-sm font-semibold text-info hover:underline"
      >
        Mở danh sách <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </section>
  );
}

function ActionGrid({ actions }: { readonly actions: readonly TodayAction[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {actions.map((action) => (
        <li key={action.label}>
          <QuickAction action={action} />
        </li>
      ))}
    </ul>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { LinkButton, PageHeader, Section } from "@/ui/patterns/layout/page-layout.tsx";
import { todayActionsFor } from "@/ui/patterns/today-actions.ts";

export default function TodayPage() {
  const { session, workspaceId } = useSession();
  const trpc = useTRPC();
  const actions = todayActionsFor(session.permissions);
  const primary = actions.filter((action) => action.area === "primary");
  const work = actions.filter((action) => action.area === "work");
  const more = actions.filter((action) => action.area === "more");
  const mayReadDeliveries = session.permissions.includes("delivery.read");
  const mayReadPurchases = session.permissions.includes("purchase.read");
  const draftDeliveries = useQuery({
    ...trpc.delivery.list.queryOptions({
      workspaceId,
      saleId: null,
      status: "draft",
      cursor: null,
      limit: 8,
    }),
    enabled: mayReadDeliveries,
  });
  const dispatchedDeliveries = useQuery({
    ...trpc.delivery.list.queryOptions({
      workspaceId,
      saleId: null,
      status: "dispatched",
      cursor: null,
      limit: 8,
    }),
    enabled: mayReadDeliveries,
  });
  const openPurchases = useQuery({
    ...trpc.purchase.list.queryOptions({
      workspaceId,
      supplierId: null,
      status: "confirmed",
      cursor: null,
      limit: 8,
    }),
    enabled: mayReadPurchases,
  });

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Hôm nay"
        description="Bắt đầu từ công việc vai trò hiện tại được phép thực hiện."
      />

      {primary.length > 0 && (
        <div className="grid gap-3">
          {primary.map((action) => (
            <Section key={action.label} title={action.label} description={action.description}>
              <LinkButton href={action.href}>Bắt đầu</LinkButton>
            </Section>
          ))}
        </div>
      )}

      {(mayReadDeliveries || mayReadPurchases) && (
        <div className="grid gap-3 lg:grid-cols-3">
          {mayReadDeliveries && (
            <>
              <WorkQueue
                title="Phiếu cần xuất hàng"
                href="/deliveries"
                loading={draftDeliveries.isLoading}
                error={draftDeliveries.isError}
                labels={
                  draftDeliveries.data?.items.map(
                    (delivery) => `Phiếu ${delivery.id.slice(0, 8).toUpperCase()}`,
                  ) ?? []
                }
              />
              <WorkQueue
                title="Phiếu đang giao"
                href="/deliveries"
                loading={dispatchedDeliveries.isLoading}
                error={dispatchedDeliveries.isError}
                labels={
                  dispatchedDeliveries.data?.items.map(
                    (delivery) => `Phiếu ${delivery.id.slice(0, 8).toUpperCase()}`,
                  ) ?? []
                }
              />
            </>
          )}
          {mayReadPurchases && (
            <WorkQueue
              title="Đơn mua đã xác nhận"
              href="/purchases"
              loading={openPurchases.isLoading}
              error={openPurchases.isError}
              labels={
                openPurchases.data?.items.map(
                  (purchase) => `Đơn ${purchase.id.slice(0, 8).toUpperCase()}`,
                ) ?? []
              }
            />
          )}
        </div>
      )}

      {work.length > 0 && (
        <Section
          id="work"
          title="Công việc"
          description="Các lối vào dưới đây đến từ quyền server trả cho phiên hiện tại."
        >
          <ActionGrid actions={work} />
        </Section>
      )}

      {more.length > 0 && (
        <Section id="more" title="Thêm">
          <ActionGrid actions={more} />
        </Section>
      )}
    </div>
  );
}

function WorkQueue(props: {
  title: string;
  href: string;
  loading: boolean;
  error: boolean;
  labels: readonly string[];
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-subheading font-semibold">{props.title}</h3>
        <strong className="tabular text-heading">
          {props.loading || props.error ? "—" : props.labels.length}
        </strong>
      </div>
      <div className="mt-3">
        {props.loading ? (
          <p className="text-body-sm text-ink-muted">Đang tải…</p>
        ) : props.error ? (
          <p role="alert" className="text-body-sm text-warning">
            Chưa tải được dữ liệu.
          </p>
        ) : props.labels.length === 0 ? (
          <p className="text-body-sm text-ink-muted">Không có phiếu trong trang hiện tại.</p>
        ) : (
          <ul className="text-body-sm flex flex-col gap-1">
            {props.labels.slice(0, 3).map((label) => (
              <li key={label}>{label}</li>
            ))}
            {props.labels.length > 3 && (
              <li className="text-ink-muted">+{props.labels.length - 3} phiếu nữa</li>
            )}
          </ul>
        )}
      </div>
      <div className="mt-4">
        <LinkButton href={props.href} secondary>
          Mở danh sách
        </LinkButton>
      </div>
    </section>
  );
}

function ActionGrid({ actions }: { readonly actions: ReturnType<typeof todayActionsFor> }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {actions.map((action) => (
        <li key={action.label} className="rounded-card border border-border p-3">
          <h3 className="font-semibold">{action.label}</h3>
          <p className="mt-1 text-body-sm text-ink-muted">{action.description}</p>
          <div className="mt-3">
            <LinkButton href={action.href} secondary>
              Mở
            </LinkButton>
          </div>
        </li>
      ))}
    </ul>
  );
}

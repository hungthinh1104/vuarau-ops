"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSession } from "../../../api/session-gate.tsx";
import { useTRPC } from "../../../api/providers.tsx";
import { LinkButton, PageHeader, Section } from "../../../ui/patterns/page-layout.tsx";
import { todayActionsFor } from "../../../ui/patterns/today-actions.ts";

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
        description="Bắt đầu từ công việc vai trò hiện tại được phép thực hiện. Không có số liệu ước đoán trên màn hình này."
      />

      {primary.map((action) => (
        <Section key={action.label} title={action.label} description={action.description}>
          <LinkButton href={action.href}>Bắt đầu</LinkButton>
        </Section>
      ))}

      {(mayReadDeliveries || mayReadPurchases) && (
        <Section
          id="queue"
          title="Việc đang chờ"
          description="Danh sách dưới đây đọc trực tiếp từ phiếu nghiệp vụ; số hiển thị chỉ là số dòng đã tải, không phải KPI ước tính."
        >
          <div className="grid gap-3 lg:grid-cols-3">
            {mayReadDeliveries ? (
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
            ) : null}
            {mayReadPurchases ? (
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
            ) : null}
          </div>
        </Section>
      )}

      <Section
        id="work"
        title="Công việc"
        description="Các lối vào dưới đây đến từ quyền server trả cho phiên hiện tại."
      >
        <ActionGrid actions={work} />
      </Section>

      <Section id="more" title="Thêm">
        <ActionGrid actions={more} />
      </Section>
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
    <section className="rounded-card border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{props.title}</h3>
        <strong className="tabular">
          {props.loading || props.error ? "—" : props.labels.length}
        </strong>
      </div>
      {props.loading ? (
        <p className="text-body-sm text-ink-muted">Đang tải…</p>
      ) : props.error ? (
        <p role="alert" className="text-body-sm text-warning">
          Chưa tải được dữ liệu.
        </p>
      ) : props.labels.length === 0 ? (
        <p className="text-body-sm text-ink-muted">Không có phiếu trong trang hiện tại.</p>
      ) : (
        <ul className="mt-2 text-body-sm">
          {props.labels.slice(0, 3).map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      )}
      <Link href={props.href} className="mt-2 inline-block text-info underline">
        Mở danh sách nguồn
      </Link>
    </section>
  );
}

function ActionGrid({ actions }: { readonly actions: ReturnType<typeof todayActionsFor> }) {
  if (actions.length === 0) {
    return (
      <p className="text-body-sm text-ink-muted">Không có công việc phù hợp với vai trò này.</p>
    );
  }
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

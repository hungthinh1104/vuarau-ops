"use client";

import type { Cursor, DeliverySummaryDto, Page } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DELIVERY_STATUS_COPY } from "@/ui/copy.ts";
import { formatInstant } from "@/ui/format.ts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import {
  DirectoryToolbar,
  MobileRecordCard,
  PageFrame,
  PageHeader,
} from "@/ui/patterns/layout/page-layout.tsx";
import { LoadMoreFooter } from "@/ui/patterns/list/load-more-footer.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { SearchInput } from "@/ui/primitives/search-input.tsx";

export type DeliveriesDirectoryViewProps = {
  readonly query: QueryLike<Page<DeliverySummaryDto>>;
  readonly rows: readonly DeliverySummaryDto[];
  readonly nextCursor: Cursor | null;
  readonly isFetching: boolean;
  readonly onRetry: () => void;
  readonly onLoadMore: () => void;
  readonly queryText: string;
  readonly onQueryChange: (value: string) => void;
  readonly onClearQuery: () => void;
};

function deliveryTone(
  status: DeliverySummaryDto["status"],
): "info" | "warning" | "positive" | "neutral" {
  if (status === "dispatched") return "info";
  if (status === "cancelled") return "warning";
  if (status === "delivered") return "positive";
  return "neutral";
}

export function DeliveriesDirectoryView({
  query,
  rows,
  nextCursor,
  isFetching,
  onRetry,
  onLoadMore,
  queryText,
  onQueryChange,
  onClearQuery,
}: DeliveriesDirectoryViewProps) {
  const [tab, setTab] = useState<"waiting" | "in_progress" | "delivered">("waiting");
  const visibleRows = useMemo(
    () =>
      rows.filter((delivery) =>
        tab === "waiting"
          ? delivery.status === "draft"
          : tab === "in_progress"
            ? delivery.status === "dispatched"
            : delivery.status === "delivered",
      ),
    [rows, tab],
  );
  return (
    <PageFrame size="wide">
      <div className="grid gap-6">
        <PageHeader
          title="Giao hàng"
          description="Các phiếu giao hiện có cùng trạng thái và hàng cần giao."
        />
        <DirectoryToolbar
          search={
            <SearchInput
              label="Tìm phiếu giao"
              placeholder="Mã phiếu hoặc mặt hàng"
              value={queryText}
              onChange={(event) => onQueryChange(event.target.value)}
              onClear={onClearQuery}
            />
          }
          filters={
            <div className="flex flex-wrap gap-2" role="group" aria-label="Trạng thái giao hàng">
              {(
                [
                  ["waiting", "Chờ giao"],
                  ["in_progress", "Đang giao"],
                  ["delivered", "Đã giao"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  tone={tab === value ? "primary" : "secondary"}
                  aria-pressed={tab === value}
                  onClick={() => setTab(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          }
        />
        <QueryStates query={query} loadingLabel="Đang tải phiếu giao" onRetry={onRetry}>
          {() =>
            visibleRows.length === 0 ? (
              <EmptyState
                title={tab === "waiting" ? "Chưa có đơn chờ giao" : "Chưa có đơn ở trạng thái này"}
                description="Các đơn sẽ xuất hiện ở đây khi chuyển sang trạng thái tương ứng."
              />
            ) : (
              <>
                <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface lg:hidden">
                  {visibleRows.map((delivery) => (
                    <li key={delivery.id}>
                      <MobileRecordCard href={`/deliveries/${delivery.id}`}>
                        <span>
                          <strong>{delivery.displayReference}</strong>
                          <span className="block text-caption text-ink-muted">
                            {delivery.primaryProductName ?? "Phiếu chưa có dòng hàng"} ·{" "}
                            {formatInstant(delivery.transactionTime)}
                          </span>
                        </span>
                        <Badge tone={deliveryTone(delivery.status)}>
                          {DELIVERY_STATUS_COPY[delivery.status]}
                        </Badge>
                      </MobileRecordCard>
                    </li>
                  ))}
                </ul>
                <div className="hidden overflow-x-auto rounded-card border border-border bg-surface lg:block">
                  <table className="data-table w-full min-w-[840px] text-left text-body-sm">
                    <colgroup>
                      <col className="w-[32%]" />
                      <col className="w-[16%]" />
                      <col className="w-[20%]" />
                      <col className="w-[10%]" />
                      <col className="w-[12%]" />
                      <col className="w-[10%]" />
                    </colgroup>
                    <thead className="sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2">Hàng giao</th>
                        <th className="px-3 py-2">Đơn bán</th>
                        <th className="px-3 py-2">Thời điểm</th>
                        <th className="px-3 py-2">Số dòng</th>
                        <th className="px-3 py-2">Trạng thái</th>
                        <th className="px-3 py-2 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {visibleRows.map((delivery) => (
                        <tr key={delivery.id} className="hover:bg-surface-muted">
                          <td className="px-3 py-2 font-medium">
                            {delivery.primaryProductName ?? "Chưa có dòng hàng"}
                            {delivery.lineCount > 1 ? ` · +${delivery.lineCount - 1}` : ""}
                          </td>
                          <td className="px-3 py-2">
                            <Link
                              href={`/sales/${delivery.saleId}`}
                              className="font-semibold text-info underline-offset-4 hover:underline"
                            >
                              {delivery.saleDisplayReference}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {formatInstant(delivery.transactionTime)}
                          </td>
                          <td className="px-3 py-2">{delivery.lineCount}</td>
                          <td className="px-3 py-2">{DELIVERY_STATUS_COPY[delivery.status]}</td>
                          <td className="px-3 py-2 text-right">
                            <Link
                              href={`/deliveries/${delivery.id}`}
                              className="font-semibold text-info underline-offset-4 hover:underline"
                            >
                              Mở phiếu
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          }
        </QueryStates>
        {nextCursor !== null ? (
          <LoadMoreFooter
            visibleCount={rows.length}
            noun="phiếu giao"
            loading={isFetching}
            onLoadMore={onLoadMore}
          />
        ) : null}
      </div>
    </PageFrame>
  );
}

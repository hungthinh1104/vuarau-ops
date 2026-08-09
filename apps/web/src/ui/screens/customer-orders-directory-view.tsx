"use client";

import type { Cursor, CustomerOrderSummaryDto, Page } from "@vuarau/domain-contracts";
import Link from "next/link";
import { formatDate, formatMoney, formatQuantity } from "@/ui/format.ts";
import { CUSTOMER_ORDER_CHANNEL_COPY, CUSTOMER_ORDER_STATUS_COPY } from "@/ui/copy.ts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import {
  DirectoryToolbar,
  MobileRecordCard,
  PageFrame,
  PageHeader,
} from "@/ui/patterns/layout/page-layout.tsx";
import { LinkButton } from "@/ui/primitives/link-button.tsx";
import { LoadMoreFooter } from "@/ui/patterns/list/load-more-footer.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { SearchInput } from "@/ui/primitives/search-input.tsx";

function badgeTone(status: CustomerOrderSummaryDto["status"]) {
  return status === "confirmed" ? "positive" : status === "cancelled" ? "warning" : "neutral";
}

export function CustomerOrdersDirectoryView(props: {
  readonly query: QueryLike<Page<CustomerOrderSummaryDto>>;
  readonly rows: readonly CustomerOrderSummaryDto[];
  readonly nextCursor: Cursor | null;
  readonly isFetching: boolean;
  readonly canCreate: boolean;
  readonly onRetry: () => void;
  readonly onLoadMore: () => void;
  readonly queryText: string;
  readonly onQueryChange: (value: string) => void;
  readonly onClearQuery: () => void;
}) {
  return (
    <PageFrame size="wide">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Đơn đặt hàng"
          description="Ghi nhận nhu cầu thương mại trước khi phát sinh đơn bán, công nợ hoặc hàng hoá."
          actions={
            props.canCreate ? (
              <LinkButton href="/customer-orders/new">Tạo đơn đặt hàng</LinkButton>
            ) : null
          }
        />
        <DirectoryToolbar
          search={
            <SearchInput
              label="Tìm đơn đặt hàng"
              placeholder="Mã đơn, khách hoặc mặt hàng"
              value={props.queryText}
              onChange={(event) => props.onQueryChange(event.target.value)}
              onClear={props.onClearQuery}
            />
          }
        />
        <QueryStates
          query={props.query}
          loadingLabel="Đang tải đơn đặt hàng"
          onRetry={props.onRetry}
        >
          {() =>
            props.rows.length === 0 ? (
              <EmptyState
                title="Chưa có đơn đặt hàng"
                description="Tạo bản ghi đầu tiên khi khách chốt nhu cầu nhưng chưa cần ghi nhận đơn bán."
              />
            ) : (
              <>
                <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface lg:hidden">
                  {props.rows.map((order) => (
                    <li key={order.id}>
                      <MobileRecordCard href={`/customer-orders/${order.id}`}>
                        <span className="min-w-0">
                          <strong className="block truncate">{order.displayReference}</strong>
                          <span className="block text-caption text-ink-muted">
                            {order.customerDisplayName ?? "Chưa gắn khách"} ·{" "}
                            {formatDate(order.transactionTime)} · {order.lineCount} dòng
                          </span>
                        </span>
                        <Badge tone={badgeTone(order.status)}>
                          {CUSTOMER_ORDER_STATUS_COPY[order.status]}
                        </Badge>
                      </MobileRecordCard>
                    </li>
                  ))}
                </ul>
                <div className="hidden overflow-x-auto rounded-card border border-border bg-surface lg:block">
                  <table className="data-table w-full min-w-[940px] table-fixed text-left text-body-sm">
                    <colgroup>
                      <col className="w-[22%]" />
                      <col className="w-[18%]" />
                      <col className="w-[20%]" />
                      <col className="w-[12%]" />
                      <col className="w-[16%]" />
                      <col className="w-[12%]" />
                    </colgroup>
                    <thead className="sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2">Mặt hàng</th>
                        <th className="px-3 py-2">Kênh</th>
                        <th className="px-3 py-2">Khách hàng</th>
                        <th className="px-3 py-2">Số lượng</th>
                        <th className="px-3 py-2 text-right">Tổng tiền</th>
                        <th className="px-3 py-2">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {props.rows.map((order) => (
                        <tr key={order.id} className="hover:bg-surface-muted">
                          <td className="data-table-primary px-3 py-2">
                            <Link
                              href={`/customer-orders/${order.id}`}
                              className="font-semibold text-info hover:underline"
                            >
                              {order.primaryProductName ?? "Chưa có mặt hàng"}
                            </Link>
                            {order.lineCount > 1 ? ` · +${order.lineCount - 1}` : ""}
                          </td>
                          <td className="px-3 py-2">
                            {CUSTOMER_ORDER_CHANNEL_COPY[order.channel]}
                          </td>
                          <td className="data-table-primary px-3 py-2">
                            {order.customerDisplayName ?? "Chưa gắn khách"}
                          </td>
                          <td className="px-3 py-2">
                            {formatQuantity(
                              order.primaryQuantity ?? { valueScaled: 0, unit: "kg" },
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">
                            {order.totalAmount === null
                              ? "Chưa chốt giá"
                              : formatMoney(order.totalAmount)}
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={badgeTone(order.status)}>
                              {CUSTOMER_ORDER_STATUS_COPY[order.status]}
                            </Badge>
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
        {props.nextCursor !== null ? (
          <LoadMoreFooter
            visibleCount={props.rows.length}
            noun="đơn đặt hàng"
            loading={props.isFetching}
            onLoadMore={props.onLoadMore}
          />
        ) : null}
      </div>
    </PageFrame>
  );
}

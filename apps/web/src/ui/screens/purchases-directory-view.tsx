"use client";

import type { Cursor, Page, PurchaseSummaryDto } from "@vuarau/domain-contracts";
import Link from "next/link";
import { PURCHASE_STATUS_COPY } from "@/ui/copy.ts";
import { formatDate, formatMoney } from "@/ui/format.ts";
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

export type PurchasesDirectoryViewProps = {
  readonly query: QueryLike<Page<PurchaseSummaryDto>>;
  readonly rows: readonly PurchaseSummaryDto[];
  readonly nextCursor: Cursor | null;
  readonly isFetching: boolean;
  readonly onRetry: () => void;
  readonly onLoadMore: () => void;
  readonly canCreate: boolean;
  readonly queryText: string;
  readonly onQueryChange: (value: string) => void;
  readonly onClearQuery: () => void;
};

export function PurchasesDirectoryView({
  query,
  rows,
  nextCursor,
  isFetching,
  onRetry,
  onLoadMore,
  canCreate,
  queryText,
  onQueryChange,
  onClearQuery,
}: PurchasesDirectoryViewProps) {
  return (
    <PageFrame size="wide">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Đơn mua"
          actions={canCreate ? <LinkButton href="/purchases/new">Tạo đơn mua</LinkButton> : null}
        />
        <DirectoryToolbar
          search={
            <SearchInput
              label="Tìm đơn mua"
              placeholder="Mã đơn, nhà cung cấp hoặc mặt hàng"
              value={queryText}
              onChange={(event) => onQueryChange(event.target.value)}
              onClear={onClearQuery}
            />
          }
        />
        <QueryStates query={query} loadingLabel="Đang tải đơn mua" onRetry={onRetry}>
          {() =>
            rows.length === 0 ? (
              <EmptyState
                title="Chưa có đơn mua"
                description="Tạo đơn mua đầu tiên khi cần ghi hàng nhập từ nhà cung cấp."
              />
            ) : (
              <>
                <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface lg:hidden">
                  {rows.map((purchase) => (
                    <li key={purchase.id}>
                      <MobileRecordCard href={`/purchases/${purchase.id}`}>
                        <span>
                          <strong>{purchase.displayReference}</strong>
                          <span className="block text-caption text-ink-muted">
                            {purchase.supplierDisplayName} · {formatDate(purchase.transactionTime)}
                          </span>
                        </span>
                        <Badge
                          tone={
                            purchase.voidRecord !== null
                              ? "warning"
                              : purchase.status === "confirmed"
                                ? "positive"
                                : "neutral"
                          }
                        >
                          {purchase.voidRecord !== null
                            ? "Đã hoàn tác"
                            : PURCHASE_STATUS_COPY[purchase.status]}
                        </Badge>
                      </MobileRecordCard>
                    </li>
                  ))}
                </ul>
                <div className="hidden overflow-x-auto rounded-card border border-border bg-surface lg:block">
                  <table className="data-table w-full min-w-[840px] text-left text-body-sm">
                    <colgroup>
                      <col className="w-[16%]" />
                      <col className="w-[34%]" />
                      <col className="w-[10%]" />
                      <col className="w-[18%]" />
                      <col className="w-[12%]" />
                      <col className="w-[10%]" />
                    </colgroup>
                    <thead className="sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2">Ngày</th>
                        <th className="px-3 py-2">Mặt hàng</th>
                        <th className="px-3 py-2">Số dòng</th>
                        <th className="px-3 py-2 text-right">Tổng mua</th>
                        <th className="px-3 py-2">Trạng thái</th>
                        <th className="px-3 py-2 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((purchase) => (
                        <tr key={purchase.id} className="hover:bg-surface-muted">
                          <td className="px-3 py-2">{formatDate(purchase.transactionTime)}</td>
                          <td className="px-3 py-2">
                            {purchase.primaryProductName ?? "Chưa có hàng"}
                            {purchase.lineCount > 1 ? ` · +${purchase.lineCount - 1}` : ""}
                          </td>
                          <td className="px-3 py-2">{purchase.lineCount}</td>
                          <td className="px-3 py-2 text-right font-semibold">
                            {formatMoney(purchase.totalAmount)}
                          </td>
                          <td className="px-3 py-2">
                            {purchase.voidRecord !== null
                              ? "Đã hoàn tác"
                              : PURCHASE_STATUS_COPY[purchase.status]}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Link
                              href={`/purchases/${purchase.id}`}
                              className="font-semibold text-info underline-offset-4 hover:underline"
                            >
                              Mở chi tiết
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
            noun="đơn mua"
            loading={isFetching}
            onLoadMore={onLoadMore}
          />
        ) : null}
      </div>
    </PageFrame>
  );
}

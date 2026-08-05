"use client";

import type { Cursor, Page, PurchaseDto } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PURCHASE_STATUS_COPY } from "@/ui/copy.ts";
import { formatDate, formatMoney } from "@/ui/format.ts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import {
  DirectoryToolbar,
  MobileRecordCard,
  PageHeader,
} from "@/ui/patterns/layout/page-layout.tsx";
import { LinkButton } from "@/ui/primitives/link-button.tsx";
import { LoadMoreFooter } from "@/ui/patterns/list/load-more-footer.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { SearchInput } from "@/ui/primitives/search-input.tsx";

export type PurchasesDirectoryViewProps = {
  readonly query: QueryLike<Page<PurchaseDto>>;
  readonly rows: readonly PurchaseDto[];
  readonly nextCursor: Cursor | null;
  readonly isFetching: boolean;
  readonly onRetry: () => void;
  readonly onLoadMore: () => void;
  readonly canCreate: boolean;
};

export function PurchasesDirectoryView({
  query,
  rows,
  nextCursor,
  isFetching,
  onRetry,
  onLoadMore,
  canCreate,
}: PurchasesDirectoryViewProps) {
  const [queryText, setQueryText] = useState("");
  const visibleRows = useMemo(() => {
    const normalized = queryText.trim().toLocaleLowerCase("vi-VN");
    if (normalized.length === 0) return rows;
    return rows.filter((purchase) =>
      [
        purchase.id,
        purchase.lines.map((line) => line.productName).join(" "),
        formatDate(purchase.transactionTime),
      ]
        .join(" ")
        .toLocaleLowerCase("vi-VN")
        .includes(normalized),
    );
  }, [queryText, rows]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Đơn mua"
        actions={canCreate ? <LinkButton href="/purchases/new">Tạo đơn mua</LinkButton> : null}
      />
      <DirectoryToolbar
        search={
          <SearchInput
            label="Tìm đơn mua"
            placeholder="Mã đơn hoặc mặt hàng"
            value={queryText}
            onChange={(event) => setQueryText(event.target.value)}
            onClear={() => setQueryText("")}
          />
        }
      />
      <QueryStates query={query} loadingLabel="Đang tải đơn mua" onRetry={onRetry}>
        {() =>
          visibleRows.length === 0 ? (
            <EmptyState
              title="Chưa có đơn mua"
              description="Tạo đơn mua đầu tiên khi cần ghi hàng nhập từ nhà cung cấp."
            />
          ) : (
            <>
              <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface lg:hidden">
                {visibleRows.map((purchase) => (
                  <li key={purchase.id}>
                    <MobileRecordCard href={`/purchases/${purchase.id}`}>
                      <span>
                        <strong>{formatMoney(purchase.totalAmount)}</strong>
                        <span className="block text-caption text-ink-muted">
                          {formatDate(purchase.transactionTime)} · {purchase.lines.length} dòng
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
                    {visibleRows.map((purchase) => (
                      <tr key={purchase.id} className="hover:bg-surface-muted">
                        <td className="px-3 py-2">{formatDate(purchase.transactionTime)}</td>
                        <td className="px-3 py-2">
                          {purchase.lines[0]?.productName ?? "Chưa có hàng"}
                          {purchase.lines.length > 1 ? ` · +${purchase.lines.length - 1}` : ""}
                        </td>
                        <td className="px-3 py-2">{purchase.lines.length}</td>
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
          visibleCount={visibleRows.length}
          noun="đơn mua"
          loading={isFetching}
          onLoadMore={onLoadMore}
        />
      ) : null}
    </div>
  );
}

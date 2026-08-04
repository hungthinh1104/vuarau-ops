"use client";

import type { Cursor, Page, SupplierDto } from "@vuarau/domain-contracts";
import Link from "next/link";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { LinkButton } from "@/ui/primitives/link-button.tsx";
import { LoadMoreFooter } from "@/ui/patterns/list/load-more-footer.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { SearchInput } from "@/ui/primitives/search-input.tsx";

export type SuppliersDirectoryViewProps = {
  readonly queryText: string;
  readonly onQueryChange: (value: string) => void;
  readonly onClearQuery: () => void;
  readonly search: QueryLike<Page<SupplierDto>>;
  readonly suppliers: readonly SupplierDto[];
  readonly nextCursor: Cursor | null;
  readonly isFetching: boolean;
  readonly onRetry: () => void;
  readonly onLoadMore: () => void;
  readonly canCreate: boolean;
};

export function SuppliersDirectoryView({
  queryText,
  onQueryChange,
  onClearQuery,
  search,
  suppliers,
  nextCursor,
  isFetching,
  onRetry,
  onLoadMore,
  canCreate,
}: SuppliersDirectoryViewProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Nhà cung cấp"
        actions={
          canCreate ? <LinkButton href="/suppliers/new">Thêm nhà cung cấp</LinkButton> : null
        }
      />
      <div className="border-y border-border py-4 sm:max-w-xl">
        <SearchInput
          label="Tìm nhà cung cấp"
          placeholder="Tên hoặc số điện thoại"
          value={queryText}
          onChange={(event) => onQueryChange(event.target.value)}
          onClear={onClearQuery}
        />
      </div>
      <QueryStates query={search} loadingLabel="Đang tải nhà cung cấp" onRetry={onRetry}>
        {() =>
          suppliers.length === 0 ? (
            <EmptyState
              title={
                queryText.trim().length === 0
                  ? "Chưa có nhà cung cấp"
                  : "Không tìm thấy nhà cung cấp"
              }
              description={
                queryText.trim().length === 0
                  ? "Thêm nhà cung cấp đầu tiên để bắt đầu ghi đơn mua."
                  : "Thử tên ngắn hơn hoặc số điện thoại."
              }
            />
          ) : (
            <>
              <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface lg:hidden">
                {suppliers.map((supplier) => (
                  <li key={supplier.id}>
                    <Link
                      href={`/suppliers/${supplier.id}`}
                      className="flex min-h-[64px] justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-muted"
                    >
                      <span>
                        <strong>{supplier.displayName}</strong>
                        <span className="block text-caption text-ink-muted">
                          {supplier.phone ?? "Không có số điện thoại"}
                        </span>
                      </span>
                      {supplier.isActive ? null : <Badge tone="neutral">Đã ngưng</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto rounded-card border border-border bg-surface shadow-sm lg:block">
                <table className="data-table w-full min-w-[650px] text-left text-body-sm">
                  <colgroup>
                    <col className="w-[40%]" />
                    <col className="w-[25%]" />
                    <col className="w-[20%]" />
                    <col className="w-[15%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2">Nhà cung cấp</th>
                      <th className="px-3 py-2">Điện thoại</th>
                      <th className="px-3 py-2">Trạng thái</th>
                      <th className="px-3 py-2 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {suppliers.map((supplier) => (
                      <tr key={supplier.id} className="hover:bg-surface-muted">
                        <td className="px-3 py-2 font-medium">{supplier.displayName}</td>
                        <td className="px-3 py-2">{supplier.phone ?? "—"}</td>
                        <td className="px-3 py-2">
                          {supplier.isActive ? "Đang hoạt động" : "Đã ngưng"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Link
                            href={`/suppliers/${supplier.id}`}
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
          visibleCount={suppliers.length}
          noun="nhà cung cấp"
          loading={isFetching}
          onLoadMore={onLoadMore}
        />
      ) : null}
    </div>
  );
}

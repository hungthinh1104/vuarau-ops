"use client";

import type { Cursor, Page, ProductDto } from "@vuarau/domain-contracts";
import Link from "next/link";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { FilterChipGroup } from "@/ui/patterns/list/filter-chip-group.tsx";
import { LoadMoreFooter } from "@/ui/patterns/list/load-more-footer.tsx";
import {
  DirectoryToolbar,
  MobileRecordCard,
  PageActions,
  PageHeader,
} from "@/ui/patterns/layout/page-layout.tsx";
import { LinkButton } from "@/ui/primitives/link-button.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { SearchInput } from "@/ui/primitives/search-input.tsx";

export type ProductsDirectoryViewProps = {
  readonly queryText: string;
  readonly onQueryChange: (value: string) => void;
  readonly onClearQuery: () => void;
  readonly activeFilter: boolean | null;
  readonly onFilterChange: (value: boolean | null) => void;
  readonly search: QueryLike<Page<ProductDto>>;
  readonly products: readonly ProductDto[];
  readonly nextCursor: Cursor | null;
  readonly isFetching: boolean;
  readonly onRetry: () => void;
  readonly onLoadMore: () => void;
  readonly canReadQuality: boolean;
  readonly canCreate: boolean;
};

export function ProductsDirectoryView({
  queryText,
  onQueryChange,
  onClearQuery,
  activeFilter,
  onFilterChange,
  search,
  products,
  nextCursor,
  isFetching,
  onRetry,
  onLoadMore,
  canCreate,
}: ProductsDirectoryViewProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Danh mục mặt hàng"
        actions={
          <PageActions>
            {canCreate ? <LinkButton href="/products/new">Thêm mặt hàng</LinkButton> : null}
          </PageActions>
        }
      />
      <DirectoryToolbar
        search={
          <SearchInput
            label="Tìm mặt hàng"
            placeholder="Tên hoặc tên gọi khác"
            value={queryText}
            onChange={(event) => onQueryChange(event.target.value)}
            onClear={onClearQuery}
          />
        }
        filters={
          <FilterChipGroup
            label="Lọc trạng thái mặt hàng"
            value={activeFilter === null ? "all" : activeFilter ? "active" : "inactive"}
            options={[
              { value: "all", label: "Tất cả" },
              { value: "active", label: "Đang dùng" },
              { value: "inactive", label: "Đã ngưng" },
            ]}
            onChange={(value) => onFilterChange(value === "all" ? null : value === "active")}
          />
        }
      />
      <QueryStates query={search} loadingLabel="Đang tải mặt hàng" onRetry={onRetry}>
        {() =>
          products.length === 0 ? (
            <EmptyState
              title={queryText.trim().length === 0 ? "Chưa có mặt hàng" : "Không tìm thấy mặt hàng"}
              description={
                queryText.trim().length === 0
                  ? "Thêm mặt hàng đầu tiên để bắt đầu ghi đơn và theo dõi tồn kho."
                  : "Thử tên ngắn hơn hoặc một tên gọi khác."
              }
            />
          ) : (
            <>
              <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface lg:hidden">
                {products.map((product) => (
                  <li key={product.id}>
                    <MobileRecordCard href={`/products/${product.id}`}>
                      <span>
                        <strong>{product.displayName}</strong>
                        <span className="block text-caption text-ink-muted">
                          {product.aliases.join(", ") || "Không có tên gọi khác"} ·{" "}
                          {product.preferredUnit ?? "chưa chọn đơn vị"}
                        </span>
                      </span>
                      {product.isActive ? null : <Badge tone="neutral">Đã ngưng</Badge>}
                    </MobileRecordCard>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto rounded-card border border-border bg-surface lg:block">
                <table className="data-table w-full min-w-[780px] table-fixed text-left text-body-sm">
                  <colgroup>
                    <col className="w-[24%]" />
                    <col className="w-[32%]" />
                    <col className="w-[15%]" />
                    <col className="w-[14%]" />
                    <col className="w-[15%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2">Mặt hàng</th>
                      <th className="px-3 py-2">Tên gọi khác</th>
                      <th className="px-3 py-2">Đơn vị ưu tiên</th>
                      <th className="px-3 py-2">Trạng thái</th>
                      <th className="px-3 py-2 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {products.map((product) => (
                      <tr key={product.id} className="hover:bg-surface-muted">
                        <td className="data-table-primary px-3 py-2 font-medium">
                          <span className="data-table-truncate" title={product.displayName}>
                            {product.displayName}
                          </span>
                        </td>
                        <td
                          className="data-table-primary px-3 py-2"
                          title={product.aliases.join(", ") || undefined}
                        >
                          <span className="data-table-truncate">
                            {product.aliases.join(", ") || "—"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {product.preferredUnit ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {product.isActive ? "Đang dùng" : "Đã ngưng"}
                        </td>
                        <td className="data-table-actions px-3 py-2">
                          <div className="flex items-center gap-3">
                            <Link
                              href={`/products/${product.id}`}
                              className="font-semibold text-info underline-offset-4 hover:underline"
                            >
                              Mở
                            </Link>
                            <Link
                              href={`/products/${product.id}/inventory`}
                              className="font-semibold text-info underline-offset-4 hover:underline"
                            >
                              Tồn kho
                            </Link>
                          </div>
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
          visibleCount={products.length}
          noun="mặt hàng"
          loading={isFetching}
          onLoadMore={onLoadMore}
        />
      ) : null}
    </div>
  );
}

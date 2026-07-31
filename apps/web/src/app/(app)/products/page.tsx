"use client";

import { useQuery } from "@tanstack/react-query";
import type { Cursor, Page, ProductDto } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useDebounced } from "@/api/use-debounced.ts";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { SearchInput } from "@/ui/primitives/search-input.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { useOffline } from "@/offline/provider.tsx";
import { LinkButton, PageActions, PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { FilterChipGroup } from "@/ui/patterns/list/filter-chip-group.tsx";
import { LoadMoreFooter } from "@/ui/patterns/list/load-more-footer.tsx";

export default function ProductsPage() {
  const { workspaceId, session } = useSession();
  const offline = useOffline();
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<boolean | null>(null);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [pages, setPages] = useState<readonly Page<ProductDto>[]>([]);
  const search = useQuery(
    trpc.product.search.queryOptions({
      workspaceId,
      query: useDebounced(query, 250),
      isActive: activeFilter,
      cursor,
      limit: 25,
    }),
  );
  useEffect(() => {
    if (!search.data) return;
    setPages((current) => (cursor === null ? [search.data] : [...current, search.data]));
    const fetchedAt = new Date().toISOString();
    void offline.cacheProducts(
      search.data.items.map((product) => ({
        ...offline.partition,
        productId: product.id,
        displayName: product.displayName,
        aliases: product.aliases,
        preferredUnit: product.preferredUnit,
        fetchedAt,
      })),
    );
  }, [cursor, offline, search.data]);
  const products = pages.flatMap((page) => page.items);
  const next = pages.at(-1)?.nextCursor ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Danh mục mặt hàng"
        actions={
          <PageActions>
            {session.permissions.includes("quality.read") ? (
              <LinkButton href="/quality-grades" secondary>
                Phân hạng chất lượng
              </LinkButton>
            ) : null}
            {session.permissions.includes("product.create") ? (
              <LinkButton href="/products/new">Thêm mặt hàng</LinkButton>
            ) : null}
          </PageActions>
        }
      />
      <div className="grid gap-3 border-y border-border py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <SearchInput
          label="Tìm mặt hàng"
          placeholder="Tên hoặc tên gọi khác"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(null);
            setPages([]);
          }}
          onClear={() => {
            setQuery("");
            setCursor(null);
            setPages([]);
          }}
        />
        <FilterChipGroup
          label="Lọc trạng thái mặt hàng"
          value={activeFilter === null ? "all" : activeFilter ? "active" : "inactive"}
          options={[
            { value: "all", label: "Tất cả" },
            { value: "active", label: "Đang dùng" },
            { value: "inactive", label: "Đã ngưng" },
          ]}
          onChange={(value) => {
            setActiveFilter(value === "all" ? null : value === "active");
            setCursor(null);
            setPages([]);
          }}
        />
      </div>
      <QueryStates
        query={search}
        loadingLabel="Đang tải mặt hàng"
        onRetry={() => void search.refetch()}
      >
        {() =>
          products.length === 0 ? (
            <EmptyState
              title={query.trim().length === 0 ? "Chưa có mặt hàng" : "Không tìm thấy mặt hàng"}
              description={
                query.trim().length === 0
                  ? "Thêm mặt hàng đầu tiên để bắt đầu ghi đơn và theo dõi tồn kho."
                  : "Thử tên ngắn hơn hoặc một tên gọi khác."
              }
            />
          ) : (
            <>
              <ul className="overflow-hidden rounded-card border border-border bg-surface divide-y divide-border lg:hidden">
                {products.map((product) => (
                  <li key={product.id}>
                    <Link
                      href={`/products/${product.id}`}
                      className="flex min-h-[64px] justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-muted"
                    >
                      <span>
                        <strong>{product.displayName}</strong>
                        <span className="block text-caption text-ink-muted">
                          {product.aliases.join(", ") || "Không có tên gọi khác"} ·{" "}
                          {product.preferredUnit ?? "chưa chọn đơn vị"}
                        </span>
                      </span>
                      {product.isActive ? null : <Badge tone="neutral">Đã ngưng</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto rounded-card border border-border lg:block">
                <table className="w-full text-left text-body-sm">
                  <thead className="sticky top-16 z-10 bg-surface-muted text-label">
                    <tr>
                      <th className="px-3 py-2">Mặt hàng</th>
                      <th className="px-3 py-2">Tên gọi khác</th>
                      <th className="px-3 py-2">Đơn vị ưu tiên</th>
                      <th className="px-3 py-2">Trạng thái</th>
                      <th className="px-3 py-2">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {products.map((product) => (
                      <tr key={product.id} className="hover:bg-surface-muted">
                        <td className="px-3 py-2 font-medium">{product.displayName}</td>
                        <td className="px-3 py-2">{product.aliases.join(", ") || "—"}</td>
                        <td className="px-3 py-2">{product.preferredUnit ?? "—"}</td>
                        <td className="px-3 py-2">{product.isActive ? "Đang dùng" : "Đã ngưng"}</td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/products/${product.id}`}
                            className="font-semibold text-info underline-offset-4 hover:underline"
                          >
                            Mở
                          </Link>
                          {" · "}
                          <Link
                            href={`/products/${product.id}/inventory`}
                            className="font-semibold text-info underline-offset-4 hover:underline"
                          >
                            Tồn kho
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
      {next !== null ? (
        <LoadMoreFooter
          visibleCount={products.length}
          noun="mặt hàng"
          loading={search.isFetching}
          onLoadMore={() => setCursor(next)}
        />
      ) : null}
    </div>
  );
}

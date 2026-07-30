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
import { Button } from "@/ui/primitives/button.tsx";
import { useOffline } from "@/offline/provider.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";

export default function ProductsPage() {
  const { workspaceId, session } = useSession();
  const offline = useOffline();
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [pages, setPages] = useState<readonly Page<ProductDto>[]>([]);
  const search = useQuery(
    trpc.product.search.queryOptions({
      workspaceId,
      query: useDebounced(query, 250),
      isActive: null,
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
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Danh mục mặt hàng"
        actions={
          <div className="flex gap-3">
            {session.permissions.includes("quality.read") ? (
              <Link href="/quality-grades" className="text-info underline">
                Phân hạng chất lượng
              </Link>
            ) : null}
            {session.permissions.includes("product.create") ? (
              <Link href="/products/new" className="text-info underline">
                Thêm mặt hàng
              </Link>
            ) : null}
          </div>
        }
      />
      <SearchInput
        label="Tìm mặt hàng"
        placeholder="Tên hoặc tên gọi khác"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setCursor(null);
          setPages([]);
        }}
        onClear={() => setQuery("")}
      />
      <QueryStates
        query={search}
        loadingLabel="Đang tải mặt hàng"
        onRetry={() => void search.refetch()}
      >
        {() => (
          <>
            <ul className="flex flex-col gap-2 lg:hidden">
              {products.map((product) => (
                <li key={product.id}>
                  <Link
                    href={`/products/${product.id}`}
                    className="flex justify-between rounded-card border border-border bg-surface p-4"
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
                <thead className="sticky top-0 bg-surface-muted text-label">
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
                        <Link href={`/products/${product.id}`} className="text-info underline">
                          Mở
                        </Link>
                        {" · "}
                        <Link
                          href={`/products/${product.id}/inventory`}
                          className="text-info underline"
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
        )}
      </QueryStates>
      {next !== null ? (
        <Button tone="secondary" onClick={() => setCursor(next)} disabled={search.isFetching}>
          {search.isFetching ? "Đang tải" : "Tải thêm"}
        </Button>
      ) : null}
    </div>
  );
}

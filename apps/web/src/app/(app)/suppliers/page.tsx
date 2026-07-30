"use client";

import { useQuery } from "@tanstack/react-query";
import type { Cursor, Page, SupplierDto } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useDebounced } from "@/api/use-debounced.ts";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { SearchInput } from "@/ui/primitives/search-input.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";

export default function SuppliersPage() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [pages, setPages] = useState<readonly Page<SupplierDto>[]>([]);
  const search = useQuery(
    trpc.supplier.search.queryOptions({
      workspaceId,
      query: useDebounced(query, 250),
      isActive: null,
      cursor,
      limit: 25,
    }),
  );
  useEffect(() => {
    if (search.data === undefined) return;
    setPages((current) => (cursor === null ? [search.data] : [...current, search.data]));
  }, [cursor, search.data]);
  const suppliers = pages.flatMap((page) => page.items);
  const next = pages.at(-1)?.nextCursor ?? null;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Nhà cung cấp"
        actions={
          session.permissions.includes("supplier.create") ? (
            <Link href="/suppliers/new" className="text-info underline">
              Thêm nhà cung cấp
            </Link>
          ) : null
        }
      />
      <SearchInput
        label="Tìm nhà cung cấp"
        placeholder="Tên hoặc số điện thoại"
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
        loadingLabel="Đang tải nhà cung cấp"
        onRetry={() => void search.refetch()}
      >
        {() =>
          suppliers.length === 0 ? (
            <p>Chưa có nhà cung cấp phù hợp.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-2 lg:hidden">
                {suppliers.map((supplier) => (
                  <li key={supplier.id}>
                    <Link
                      href={`/suppliers/${supplier.id}`}
                      className="flex justify-between rounded-card border border-border bg-surface p-4"
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
              <div className="hidden overflow-x-auto rounded-card border border-border lg:block">
                <table className="w-full text-left text-body-sm">
                  <thead className="sticky top-0 bg-surface-muted text-label">
                    <tr>
                      <th className="px-3 py-2">Nhà cung cấp</th>
                      <th className="px-3 py-2">Điện thoại</th>
                      <th className="px-3 py-2">Trạng thái</th>
                      <th className="px-3 py-2">Thao tác</th>
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
                        <td className="px-3 py-2">
                          <Link href={`/suppliers/${supplier.id}`} className="text-info underline">
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
      {next === null ? null : (
        <Button tone="secondary" onClick={() => setCursor(next)} disabled={search.isFetching}>
          {search.isFetching ? "Đang tải" : "Tải thêm"}
        </Button>
      )}
    </div>
  );
}

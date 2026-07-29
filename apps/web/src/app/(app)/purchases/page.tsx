"use client";

import { useQuery } from "@tanstack/react-query";
import type { Cursor, Page, PurchaseDto } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "../../../api/session-gate.tsx";
import { useTRPC } from "../../../api/providers.tsx";
import { formatDate, formatMoney } from "../../../ui/format.ts";
import { QueryStates } from "../../../ui/patterns/query-states.tsx";
import { Badge } from "../../../ui/primitives/badge.tsx";
import { Button } from "../../../ui/primitives/button.tsx";

export default function PurchasesPage() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [pages, setPages] = useState<readonly Page<PurchaseDto>[]>([]);
  const purchases = useQuery(
    trpc.purchase.list.queryOptions({
      workspaceId,
      supplierId: null,
      status: null,
      cursor,
      limit: 25,
    }),
  );
  useEffect(() => {
    if (purchases.data === undefined) return;
    setPages((current) => (cursor === null ? [purchases.data] : [...current, purchases.data]));
  }, [cursor, purchases.data]);
  const rows = pages.flatMap((page) => page.items);
  const next = pages.at(-1)?.nextCursor ?? null;
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-heading font-bold">Đơn mua</h1>
        {session.permissions.includes("purchase.create") ? (
          <Link href="/purchases/new" className="text-info underline">
            Tạo đơn mua
          </Link>
        ) : null}
      </header>
      <QueryStates
        query={purchases}
        loadingLabel="Đang tải đơn mua"
        onRetry={() => void purchases.refetch()}
      >
        {() =>
          rows.length === 0 ? (
            <p>Chưa có đơn mua.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((purchase) => (
                <li key={purchase.id}>
                  <Link
                    href={`/purchases/${purchase.id}`}
                    className="flex justify-between rounded-card border border-border bg-surface p-4"
                  >
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
                      {purchase.voidRecord !== null ? "Đã hoàn tác" : purchase.status}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </QueryStates>
      {next === null ? null : (
        <Button tone="secondary" disabled={purchases.isFetching} onClick={() => setCursor(next)}>
          {purchases.isFetching ? "Đang tải" : "Tải thêm"}
        </Button>
      )}
    </div>
  );
}

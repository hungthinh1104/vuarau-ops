"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { formatQuantity } from "@/ui/format.ts";
import { PermissionDenied } from "@/ui/patterns/feedback/permission-denied.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";

export default function IntakePage() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const arrivals = useQuery(
    trpc.intake.listArrivals.queryOptions({
      workspaceId,
      supplierId: null,
      purchaseId: null,
      cursor: null,
      limit: 100,
    }),
  );

  if (!session.permissions.includes("intake.read")) {
    return (
      <PermissionDenied
        attemptedAction="Xem hàng đến"
        error={{
          code: "PERMISSION_DENIED",
          message: "Role set does not carry intake.read.",
          details: { permission: "intake.read", role: session.role, roles: session.roles },
          retryable: false,
        }}
      />
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Hàng đến và kiểm định"
        description="Theo dõi custody, cân, kiểm định và phần được chấp nhận vào kho."
      />
      <QueryStates
        query={arrivals}
        loadingLabel="Đang tải hàng đến"
        onRetry={() => void arrivals.refetch()}
      >
        {(page) =>
          page.items.length === 0 ? (
            <section className="rounded-card border border-border bg-surface p-5 text-body-sm text-ink-muted">
              Chưa có lần hàng đến nào. Bắt đầu từ một đơn mua đã xác nhận.
            </section>
          ) : (
            <ul className="grid gap-3">
              {page.items.map((arrival) => (
                <li key={arrival.id}>
                  <Link
                    href={`/intake/${arrival.id}`}
                    className="grid gap-3 rounded-card border border-border bg-surface p-4 hover:bg-canvas sm:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <h2 className="text-label font-semibold">
                        {arrival.vehicleReference ?? "Không ghi xe"}
                      </h2>
                      <p className="mt-1 text-body-sm text-ink-muted">
                        {arrival.lines
                          .map(
                            (line) => `${line.productName} ${formatQuantity(line.arrivedQuantity)}`,
                          )
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={arrival.reversal === null ? "positive" : "neutral"}>
                        {arrival.reversal === null ? "Đang hiệu lực" : "Đã hoàn tác"}
                      </Badge>
                      <span className="text-caption text-ink-muted">
                        {new Date(arrival.transactionTime).toLocaleDateString("vi-VN")}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </QueryStates>
    </div>
  );
}

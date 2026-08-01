"use client";

import { useQuery } from "@tanstack/react-query";
import type { GoodsArrivalId } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { ArrivalLineFlow, ArrivalSummary } from "@/ui/patterns/intake/arrival-detail-flow.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";

export default function GoodsArrivalDetailPage() {
  const arrivalId = useParams<{ arrivalId: string }>().arrivalId as GoodsArrivalId;
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const arrival = useQuery(trpc.intake.getArrival.queryOptions({ workspaceId, arrivalId }));
  const profile = useQuery(trpc.session.operationalProfile.queryOptions({ workspaceId }));

  return (
    <QueryStates
      query={arrival}
      loadingLabel="Đang tải lần hàng đến"
      onRetry={() => void arrival.refetch()}
    >
      {(detail) => (
        <QueryStates
          query={profile}
          loadingLabel="Đang tải cấu hình kiểm định"
          onRetry={() => void profile.refetch()}
        >
          {(operationalProfile) => (
            <div className="grid gap-6">
              <PageHeader
                title="Hàng đến và kiểm định"
                description={`${detail.vehicleReference ?? "Không ghi xe"} · ${new Date(
                  detail.transactionTime,
                ).toLocaleString("vi-VN")}`}
              />
              <ArrivalSummary
                arrival={detail}
                canReverse={session.permissions.includes("intake.reverse")}
                onChanged={() => void arrival.refetch()}
              />
              {detail.purchaseId !== null ? (
                <Link href={`/purchases/${detail.purchaseId}`} className="text-info underline">
                  ← Quay lại đơn mua
                </Link>
              ) : null}
              <div className="grid gap-4">
                {detail.lines.map((line) => (
                  <ArrivalLineFlow
                    key={line.arrivalLineId}
                    line={line}
                    profile={operationalProfile}
                    active={detail.reversal === null}
                    canInspect={session.permissions.includes("quality.inspect")}
                    canInspectReverse={session.permissions.includes("quality.inspect.reverse")}
                    canDisposition={session.permissions.includes("quality.disposition")}
                    canDispositionReverse={session.permissions.includes(
                      "quality.disposition.reverse",
                    )}
                  />
                ))}
              </div>
            </div>
          )}
        </QueryStates>
      )}
    </QueryStates>
  );
}

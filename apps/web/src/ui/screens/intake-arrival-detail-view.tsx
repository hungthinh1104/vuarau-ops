"use client";

import type {
  GoodsArrivalDto,
  GoodsArrivalLineInput,
  WorkspaceOperationalProfileDto,
} from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { ArrivalSummary } from "@/ui/patterns/intake/arrival-detail-flow.tsx";

export type IntakeArrivalDetailViewProps = {
  readonly arrival: QueryLike<GoodsArrivalDto>;
  readonly profile: QueryLike<WorkspaceOperationalProfileDto>;
  readonly canReverse: boolean;
  readonly reverseControl?: ReactNode;
  readonly onRetryArrival: () => void;
  readonly onRetryProfile: () => void;
  readonly renderLine: (line: GoodsArrivalLineInput, active: boolean) => ReactNode;
};

export function IntakeArrivalDetailView({
  arrival,
  profile,
  canReverse,
  reverseControl,
  onRetryArrival,
  onRetryProfile,
  renderLine,
}: IntakeArrivalDetailViewProps) {
  return (
    <QueryStates query={arrival} loadingLabel="Đang tải lần hàng đến" onRetry={onRetryArrival}>
      {(detail) => (
        <QueryStates
          query={profile}
          loadingLabel="Đang tải cấu hình kiểm định"
          onRetry={onRetryProfile}
        >
          {(_operationalProfile) => (
            <div className="grid gap-6">
              <PageHeader
                title="Hàng đến và kiểm định"
                description={`${detail.vehicleReference ?? "Không ghi xe"} · ${new Date(
                  detail.transactionTime,
                ).toLocaleString("vi-VN")}`}
                {...(detail.purchaseId !== null
                  ? { back: { href: `/purchases/${detail.purchaseId}`, label: "Mở đơn mua nguồn" } }
                  : {})}
              />
              <ArrivalSummary
                arrival={detail}
                canReverse={canReverse}
                reverseControl={reverseControl}
              />
              <div className="grid gap-4">
                {detail.lines.map((line) => renderLine(line, detail.reversal === null))}
              </div>
            </div>
          )}
        </QueryStates>
      )}
    </QueryStates>
  );
}

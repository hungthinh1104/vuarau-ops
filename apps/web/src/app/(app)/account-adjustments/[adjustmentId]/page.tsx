"use client";

import { useQuery } from "@tanstack/react-query";
import type { AccountAdjustmentGetInput } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "../../../../api/session-gate.tsx";
import { useTRPC } from "../../../../api/providers.tsx";
import { QueryStates } from "../../../../ui/patterns/query-states.tsx";
import { formatInstant, formatSignedMoney } from "../../../../ui/format.ts";

export default function AccountAdjustmentDetailPage() {
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const adjustmentId = useParams<{ adjustmentId: string }>().adjustmentId;
  const detail = useQuery(
    trpc.account.adjustment.queryOptions({
      workspaceId,
      adjustmentId,
    } as AccountAdjustmentGetInput),
  );
  return (
    <QueryStates
      query={detail}
      loadingLabel="Đang tải điều chỉnh công nợ"
      attemptedAction="Xem điều chỉnh công nợ"
      onRetry={() => void detail.refetch()}
    >
      {(item) => (
        <section className="flex flex-col gap-4">
          <h1 className="text-heading font-bold">Điều chỉnh công nợ</h1>
          <p className="text-caption text-ink-muted">{item.displayReference}</p>
          <dl className="grid gap-2 rounded-card border border-border p-4 text-body">
            <div>
              <dt>Lý do</dt>
              <dd>
                {item.reasonCode} — {item.reason}
              </dd>
            </div>
            <div>
              <dt>Thay đổi</dt>
              <dd>{formatSignedMoney(item.accountEffect.change)}</dd>
            </div>
            <div>
              <dt>Công nợ trước</dt>
              <dd>{formatSignedMoney(item.accountEffect.balanceBefore)}</dd>
            </div>
            <div>
              <dt>Công nợ sau</dt>
              <dd>{formatSignedMoney(item.accountEffect.balanceAfter)}</dd>
            </div>
            <div>
              <dt>Ghi nhận</dt>
              <dd>{formatInstant(item.transactionTime)}</dd>
            </div>
            <div>
              <dt>Người thực hiện</dt>
              <dd>{item.actor.displayName}</dd>
            </div>
            <div>
              <dt>Command</dt>
              <dd>{item.commandId}</dd>
            </div>
          </dl>
          <Link href={`/customers/${item.customer.id}`} className="text-info underline">
            ← {item.customer.displayName}
          </Link>
        </section>
      )}
    </QueryStates>
  );
}

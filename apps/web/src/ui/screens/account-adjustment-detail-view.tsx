import type { AccountAdjustmentDetailDto } from "@vuarau/domain-contracts";
import { copyForReasonCode } from "@/ui/copy.ts";
import { formatInstant, formatSignedMoney } from "@/ui/format.ts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";

export type AccountAdjustmentDetailViewProps = {
  readonly query: QueryLike<AccountAdjustmentDetailDto>;
  readonly onRetry: () => void;
};

export function AccountAdjustmentDetailView({ query, onRetry }: AccountAdjustmentDetailViewProps) {
  return (
    <QueryStates
      query={query}
      loadingLabel="Đang tải điều chỉnh công nợ"
      attemptedAction="Xem điều chỉnh công nợ"
      onRetry={onRetry}
    >
      {(item) => (
        <section className="flex flex-col gap-4">
          <PageHeader
            title="Điều chỉnh công nợ"
            description={item.displayReference}
            back={{ href: `/customers/${item.customer.id}`, label: item.customer.displayName }}
          />
          <dl className="grid gap-2 rounded-card border border-border p-4 text-body">
            <div>
              <dt>Loại điều chỉnh</dt>
              <dd>{item.direction === "increase" ? "Tăng công nợ" : "Giảm công nợ"}</dd>
            </div>
            <div>
              <dt>Lý do</dt>
              <dd>
                {copyForReasonCode(item.reasonCode)} — {item.reason}
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
              <dt>Trạng thái sau điều chỉnh</dt>
              <dd>{ledgerClassificationCopy(item.accountEffect.classificationAfter)}</dd>
            </div>
            <div>
              <dt>Thời điểm giao dịch</dt>
              <dd>{formatInstant(item.transactionTime)}</dd>
            </div>
            <div>
              <dt>Thời điểm ghi nhận</dt>
              <dd>{formatInstant(item.recordedAt)}</dd>
            </div>
            <div>
              <dt>Người thực hiện</dt>
              <dd>{item.actor.displayName}</dd>
            </div>
            <div>
              <dt>Mã tham chiếu</dt>
              <dd>{item.commandId}</dd>
            </div>
            <div>
              <dt>Vựa</dt>
              <dd>{item.workspace.name}</dd>
            </div>
          </dl>
        </section>
      )}
    </QueryStates>
  );
}

function ledgerClassificationCopy(value: string): string {
  if (value === "receivable") return "Khách còn nợ vựa";
  if (value === "customer_credit") return "Vựa còn nợ khách";
  if (value === "settled") return "Đã thanh toán đủ";
  return "Cần kiểm tra";
}

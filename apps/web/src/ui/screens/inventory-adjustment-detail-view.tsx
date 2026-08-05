import type { InventoryMovementDto } from "@vuarau/domain-contracts";
import { copyForReasonCode } from "@/ui/copy.ts";
import { formatInstant, formatQuantity } from "@/ui/format.ts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";

export type InventoryAdjustmentDetailViewProps = {
  readonly query: QueryLike<InventoryMovementDto>;
  readonly onRetry: () => void;
};

export function InventoryAdjustmentDetailView({
  query,
  onRetry,
}: InventoryAdjustmentDetailViewProps) {
  return (
    <QueryStates query={query} loadingLabel="Đang tải điều chỉnh kho" onRetry={onRetry}>
      {(movement) => (
        <div className="flex max-w-2xl flex-col gap-4">
          <PageHeader
            title="Điều chỉnh tồn kho"
            back={{
              href: `/products/${movement.productId}/inventory`,
              label: "Mở sổ kho mặt hàng",
            }}
          />
          <dl className="grid grid-cols-2 gap-2 rounded-card border border-border bg-surface p-4">
            <dt>Thay đổi</dt>
            <dd className="text-right font-bold">{formatQuantity(movement.quantity)}</dd>
            <dt>Lý do</dt>
            <dd className="text-right">{copyForReasonCode(movement.reasonCode)}</dd>
            <dt>Giải thích</dt>
            <dd className="text-right">{movement.reason}</dd>
            <dt>Thời điểm giao dịch</dt>
            <dd className="text-right">{formatInstant(movement.transactionTime)}</dd>
            <dt>Ghi nhận</dt>
            <dd className="text-right">{formatInstant(movement.recordedAt)}</dd>
            <dt>Mã tham chiếu</dt>
            <dd className="break-all text-right">{movement.commandId}</dd>
          </dl>
        </div>
      )}
    </QueryStates>
  );
}

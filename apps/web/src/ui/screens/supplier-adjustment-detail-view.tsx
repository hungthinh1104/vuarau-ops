import type { SupplierAccountEntryDto } from "@vuarau/domain-contracts";
import { formatInstant, formatSignedMoney } from "@/ui/format.ts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";

export type SupplierAdjustmentDetailViewProps = {
  readonly query: QueryLike<SupplierAccountEntryDto>;
  readonly onRetry: () => void;
};

export function SupplierAdjustmentDetailView({
  query,
  onRetry,
}: SupplierAdjustmentDetailViewProps) {
  return (
    <QueryStates query={query} loadingLabel="Đang tải điều chỉnh" onRetry={onRetry}>
      {(entry) => (
        <div className="flex max-w-2xl flex-col gap-4">
          <PageHeader
            title="Điều chỉnh công nợ nhà cung cấp"
            back={{ href: `/suppliers/${entry.supplierId}`, label: "Mở nhà cung cấp" }}
          />
          <dl className="grid grid-cols-2 gap-2 rounded-card border border-border bg-surface p-4">
            <dt>Thay đổi</dt>
            <dd className="text-right font-bold">{formatSignedMoney(entry.amount)}</dd>
            <dt>Mã lý do</dt>
            <dd className="text-right">{entry.reasonCode}</dd>
            <dt>Giải thích</dt>
            <dd className="text-right">{entry.reason}</dd>
            <dt>Thời điểm giao dịch</dt>
            <dd className="text-right">{formatInstant(entry.transactionTime)}</dd>
            <dt>Ghi nhận</dt>
            <dd className="text-right">{formatInstant(entry.recordedAt)}</dd>
            <dt>Command</dt>
            <dd className="break-all text-right">{entry.commandId}</dd>
          </dl>
        </div>
      )}
    </QueryStates>
  );
}

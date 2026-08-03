import type { BalanceClassification, Money } from "@vuarau/domain-contracts";
import { MoneyValue } from "@/ui/domain/money-value.tsx";
import { QuantityValue } from "@/ui/domain/quantity-value.tsx";
import { BalancePreview } from "@/ui/patterns/finance/balance-preview.tsx";
import type { ResolvedLine, SaleLineDraft } from "./sale-line-editor.tsx";

export type TransactionPreviewProps = {
  readonly customerName: string;
  readonly lines: readonly SaleLineDraft[];
  readonly resolved: readonly ResolvedLine[];
  readonly total: Money;
  readonly currentBalance: Money | null;
  readonly currentClassification: BalanceClassification | null;
};

/**
 * Read-only confirmation surface for the sale the worker is about to post.
 * Values come from the already-resolved form model; this component performs no
 * transactional arithmetic of its own.
 */
export function TransactionPreview({
  customerName,
  lines,
  resolved,
  total,
  currentBalance,
  currentClassification,
}: TransactionPreviewProps) {
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <p className="text-caption text-ink-muted">Khách hàng</p>
        <p className="text-body font-semibold text-ink">{customerName}</p>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="preview-lines-title">
        <h3 id="preview-lines-title" className="text-label font-semibold text-ink-muted">
          Mặt hàng
        </h3>
        <ul className="divide-y divide-border rounded-card border border-border bg-surface">
          {lines.map((line, index) => {
            const result = resolved[index];
            const valid =
              result !== undefined &&
              result.quantity !== null &&
              result.unitPrice !== null &&
              result.total !== null;
            return (
              <li key={line.lineId} className="flex items-start justify-between gap-4 p-3">
                <div className="min-w-0">
                  <p className="text-body font-medium text-ink">
                    {line.productName.trim() || "Chưa chọn mặt hàng"}
                    {line.qualityGradeName ? (
                      <span className="text-ink-muted"> · {line.qualityGradeName}</span>
                    ) : null}
                  </p>
                  {valid ? (
                    <p className="mt-1 text-caption text-ink-muted">
                      <QuantityValue quantity={result.quantity!} /> ×{" "}
                      <MoneyValue value={result.unitPrice!} />
                    </p>
                  ) : (
                    <p className="mt-1 text-caption text-danger">Dữ liệu dòng chưa hợp lệ.</p>
                  )}
                </div>
                <div className="shrink-0 text-right text-body font-semibold">
                  {valid ? <MoneyValue value={result.total!} /> : "—"}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex items-baseline justify-between border-t border-border pt-3">
        <span className="text-subheading font-semibold">Tổng đơn</span>
        <MoneyValue value={total} className="text-display font-bold" />
      </div>

      {total.amountMinor > 0 && currentBalance !== null && currentClassification !== null ? (
        <BalancePreview
          currentBalance={currentBalance}
          currentClassification={currentClassification}
          change={total}
          changeLabel="Đơn này"
        />
      ) : currentBalance === null || currentClassification === null ? (
        <p className="text-caption text-ink-muted">
          Công nợ hiện tại chưa có trên máy chủ; ứng dụng không tự suy ra số dư.
        </p>
      ) : null}

      <p className="text-caption text-ink-muted">
        Sau khi chốt, đơn sẽ tính vào công nợ của <strong>{customerName}</strong>. Thao tác này
        không thể hoàn tác trực tiếp.
      </p>
    </div>
  );
}

"use client";

import { Sheet } from "@/ui/primitives/sheet.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { formatMoney, formatDate } from "@/ui/format.ts";
import type { CustomerPriceHistoryDto, WorkspaceProductHistoryDto } from "@vuarau/domain-contracts";
import type { ProductId, Unit, Money } from "@vuarau/domain-contracts";

export type VisibleProduct = {
  readonly id: ProductId;
  readonly displayName: string;
  readonly preferredUnit: Unit | null;
};

export type ProductPickerProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly visibleProducts: readonly VisibleProduct[];
  readonly customerHistory: readonly CustomerPriceHistoryDto[];
  readonly workspaceHistory: readonly WorkspaceProductHistoryDto[];
  readonly onSelectProduct: (productId: ProductId | null, productName: string, unit: Unit) => void;
  readonly onApplyHistoricalPrice: (
    productId: ProductId | null,
    productName: string,
    unit: Unit,
    sourceSaleId: string,
    lastUnitPrice: Money,
  ) => void;
};

/**
 * A bottom-sheet picker that combines the workspace product catalog with
 * customer price history. Product selection (name + unit) is always one tap.
 * Historical price requires an explicit secondary "Dùng giá này" tap — it is
 * never applied silently as part of a product selection.
 */
export function ProductPicker({
  open,
  onClose,
  visibleProducts,
  customerHistory,
  workspaceHistory,
  onSelectProduct,
  onApplyHistoricalPrice,
}: ProductPickerProps) {
  const hasContext = customerHistory.length > 0 || workspaceHistory.length > 0;

  return (
    <Sheet open={open} onClose={onClose} title="Chọn mặt hàng">
      <div className="flex flex-col gap-6">
        {hasContext && (
          <section className="flex flex-col gap-3">
            <h2 className="text-label font-semibold text-ink-muted">Gần đây</h2>

            {/* Workspace history: product + unit only, no price */}
            {workspaceHistory.map((history) => (
              <div
                key={`workspace-${history.productName}-${history.unit}`}
                className="flex items-center justify-between gap-3 rounded-card border border-border p-3"
              >
                <span className="text-body font-medium">
                  {history.productName}
                  <span className="ml-1 text-caption text-ink-muted">· {history.unit}</span>
                </span>
                <Button
                  tone="secondary"
                  onClick={() => {
                    onSelectProduct(
                      history.productId as ProductId | null,
                      history.productName,
                      history.unit as Unit,
                    );
                    onClose();
                  }}
                >
                  Chọn
                </Button>
              </div>
            ))}

            {/* Customer history: product + unit + last price (price is explicit-apply only) */}
            {customerHistory.map((history) => (
              <div
                key={`customer-${history.productName}-${history.unit}`}
                className="flex flex-col gap-2 rounded-card border border-border p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-body font-medium">
                    {history.productName}
                    <span className="ml-1 text-caption text-ink-muted">· {history.unit}</span>
                  </span>
                  <Button
                    tone="secondary"
                    onClick={() => {
                      onSelectProduct(
                        history.productId as ProductId | null,
                        history.productName,
                        history.unit as Unit,
                      );
                      onClose();
                    }}
                  >
                    Chọn
                  </Button>
                </div>
                {/* Historical price — requires a second explicit tap. Never auto-applied. */}
                <div className="flex items-center justify-between rounded bg-surface-muted px-2 py-1.5">
                  <span className="text-caption text-ink-muted">
                    Giá lần trước:{" "}
                    <strong className="tabular text-ink">
                      {formatMoney(history.lastUnitPrice)}
                    </strong>
                    {" · "}
                    {formatDate(history.lastTransactionTime)}
                  </span>
                  <Button
                    tone="secondary"
                    onClick={() => {
                      onApplyHistoricalPrice(
                        history.productId as ProductId | null,
                        history.productName,
                        history.unit as Unit,
                        history.sourceSaleId,
                        history.lastUnitPrice,
                      );
                      onClose();
                    }}
                  >
                    Dùng giá này
                  </Button>
                </div>
              </div>
            ))}
          </section>
        )}

        {visibleProducts.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-label font-semibold text-ink-muted">Danh mục chung</h2>
            <p className="text-caption text-ink-muted">
              Chọn mặt hàng chỉ điền tên và đơn vị; đơn giá vẫn do bạn nhập hoặc chủ động dùng giá
              lần trước.
            </p>
            <div className="flex flex-wrap gap-2">
              {visibleProducts.map((product) => (
                <Button
                  key={product.id}
                  tone="secondary"
                  onClick={() => {
                    onSelectProduct(product.id, product.displayName, product.preferredUnit ?? "kg");
                    onClose();
                  }}
                >
                  {product.displayName}
                  {product.preferredUnit === null ? "" : ` · ${product.preferredUnit}`}
                </Button>
              ))}
            </div>
          </section>
        )}

        {!hasContext && visibleProducts.length === 0 && (
          <p className="text-body-sm text-ink-muted">Chưa có mặt hàng để gợi ý.</p>
        )}
      </div>
    </Sheet>
  );
}

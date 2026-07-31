"use client";

import { useEffect, useState } from "react";
import { UNIT_LABEL_VI } from "@vuarau/domain-contracts";
import type {
  CustomerPriceHistoryDto,
  Money,
  ProductId,
  Unit,
  WorkspaceProductHistoryDto,
} from "@vuarau/domain-contracts";
import { Button } from "@/ui/primitives/button.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { SearchInput } from "@/ui/primitives/search-input.tsx";
import { Sheet } from "@/ui/primitives/sheet.tsx";
import { formatDate, formatMoney } from "@/ui/format.ts";

export type VisibleProduct = {
  readonly id: ProductId;
  readonly displayName: string;
  readonly aliases: readonly string[];
  readonly preferredUnit: Unit | null;
};

export type ProductPickerProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSearchChange?: (query: string) => void;
  readonly searching?: boolean;
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

type Ranked<T> = { readonly item: T; readonly rank: number; readonly index: number };

function foldVietnamese(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLocaleLowerCase("vi")
    .trim();
}

function matchRank(value: string, query: string): number {
  const foldedQuery = foldVietnamese(query);
  if (foldedQuery.length === 0) return 1;
  const foldedValue = foldVietnamese(value);
  if (foldedValue === foldedQuery) return 3;
  if (foldedValue.startsWith(foldedQuery)) return 2;
  return foldedValue.includes(foldedQuery) ? 1 : 0;
}

function matchRankWithAliases(
  displayName: string,
  aliases: readonly string[],
  query: string,
): number {
  const displayRank = matchRank(displayName, query);
  let aliasRank = 0;
  for (const alias of aliases) {
    const rank = matchRank(alias, query);
    if (rank > aliasRank) aliasRank = rank;
    if (aliasRank === 3) break;
  }
  return Math.max(displayRank, aliasRank);
}

function filterAndRank<T>(items: readonly T[], query: string, labelOf: (item: T) => string): T[] {
  return items
    .map<Ranked<T>>((item, index) => ({ item, index, rank: matchRank(labelOf(item), query) }))
    .filter((entry) => entry.rank > 0)
    .sort((left, right) => right.rank - left.rank || left.index - right.index)
    .map((entry) => entry.item);
}

function filterAndRankWithAliases<T>(
  items: readonly T[],
  query: string,
  displayNameOf: (item: T) => string,
  aliasesOf: (item: T) => readonly string[],
): T[] {
  return items
    .map<Ranked<T>>((item, index) => ({
      item,
      index,
      rank: matchRankWithAliases(displayNameOf(item), aliasesOf(item), query),
    }))
    .filter((entry) => entry.rank > 0)
    .sort((left, right) => right.rank - left.rank || left.index - right.index)
    .map((entry) => entry.item);
}

function displayUnit(unit: string): string {
  return UNIT_LABEL_VI[unit as Unit] ?? unit;
}

/**
 * Mobile product choice surface for quick sale.
 *
 * Search is local and Vietnamese diacritic-insensitive. Customer history stays
 * above workspace history, which stays above the general catalog. Inside each
 * section exact matches rank before prefix matches, then substring matches.
 * Historical price is never applied as a side effect of choosing a product.
 */
export function ProductPicker({
  open,
  onClose,
  onSearchChange,
  searching = false,
  visibleProducts,
  customerHistory,
  workspaceHistory,
  onSelectProduct,
  onApplyHistoricalPrice,
}: ProductPickerProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const customerMatches = filterAndRank(customerHistory, query, (item) => item.productName);
  const workspaceMatches = filterAndRank(workspaceHistory, query, (item) => item.productName);
  const productMatches = filterAndRankWithAliases(
    visibleProducts,
    query,
    (item) => item.displayName,
    (item) => item.aliases,
  );
  const hasResults =
    customerMatches.length > 0 || workspaceMatches.length > 0 || productMatches.length > 0;

  return (
    <Sheet open={open} onClose={onClose} title="Chọn mặt hàng">
      <div className="flex flex-col gap-5">
        <SearchInput
          autoFocus
          label="Tìm mặt hàng"
          placeholder="Tên mặt hàng"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            onSearchChange?.(event.target.value);
          }}
          onClear={() => {
            setQuery("");
            onSearchChange?.("");
          }}
        />

        {customerMatches.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-label font-semibold text-ink-muted">Gần đây với khách này</h2>
            {customerMatches.map((history) => {
              const unitLabel = displayUnit(history.unit);
              return (
                <div
                  key={`customer-${history.productName}-${history.unit}-${history.sourceSaleId}`}
                  className="flex flex-col gap-2 rounded-card border border-border p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-body font-medium">
                      {history.productName}
                      <span className="ml-1 text-caption text-ink-muted">· {unitLabel}</span>
                    </span>
                    <Button
                      aria-label={`Chọn ${history.productName} · ${unitLabel}`}
                      tone="secondary"
                      onClick={() => {
                        onSelectProduct(
                          history.productId,
                          history.productName,
                          history.unit as Unit,
                        );
                        onClose();
                      }}
                    >
                      Chọn
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-input bg-surface-muted px-2 py-2">
                    <span className="text-caption text-ink-muted">
                      Giá lần trước:{" "}
                      <strong className="tabular text-ink">
                        {formatMoney(history.lastUnitPrice)}
                      </strong>
                      {" · "}
                      {formatDate(history.lastTransactionTime)}
                    </span>
                    <Button
                      aria-label={`Dùng giá lần trước cho ${history.productName}`}
                      tone="secondary"
                      onClick={() => {
                        onApplyHistoricalPrice(
                          history.productId,
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
              );
            })}
          </section>
        ) : null}

        {workspaceMatches.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-label font-semibold text-ink-muted">Gần đây trong vựa</h2>
            {workspaceMatches.map((history) => {
              const unitLabel = displayUnit(history.unit);
              return (
                <div
                  key={`workspace-${history.productName}-${history.unit}-${history.productId ?? "legacy"}`}
                  className="flex items-center justify-between gap-3 rounded-card border border-border p-3"
                >
                  <span className="text-body font-medium">
                    {history.productName}
                    <span className="ml-1 text-caption text-ink-muted">· {unitLabel}</span>
                  </span>
                  <Button
                    aria-label={`Chọn ${history.productName} · ${unitLabel}`}
                    tone="secondary"
                    onClick={() => {
                      onSelectProduct(history.productId, history.productName, history.unit as Unit);
                      onClose();
                    }}
                  >
                    Chọn
                  </Button>
                </div>
              );
            })}
          </section>
        ) : null}

        {productMatches.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-label font-semibold text-ink-muted">Danh mục chung</h2>
            <p className="text-caption text-ink-muted">
              Chọn mặt hàng chỉ điền tên và đơn vị. Đơn giá vẫn do bạn nhập hoặc chủ động dùng giá
              lần trước.
            </p>
            <div className="flex flex-wrap gap-2">
              {productMatches.map((product) => (
                <Button
                  key={product.id}
                  tone="secondary"
                  onClick={() => {
                    onSelectProduct(product.id, product.displayName, product.preferredUnit ?? "kg");
                    onClose();
                  }}
                >
                  {product.displayName}
                  {product.preferredUnit === null ? "" : ` · ${displayUnit(product.preferredUnit)}`}
                </Button>
              ))}
            </div>
          </section>
        ) : null}

        {!hasResults && searching ? (
          <p role="status" className="text-body-sm text-ink-muted">
            Đang tìm mặt hàng…
          </p>
        ) : !hasResults ? (
          <EmptyState
            title="Không tìm thấy mặt hàng"
            description="Thử tên khác hoặc đóng bảng chọn để nhập mặt hàng mới."
          />
        ) : null}
      </div>
    </Sheet>
  );
}

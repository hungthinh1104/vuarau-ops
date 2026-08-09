"use client";

import type { Cursor, Page, ProductCoverageDto, ProductDto } from "@vuarau/domain-contracts";
import Link from "next/link";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { FilterChipGroup } from "@/ui/patterns/list/filter-chip-group.tsx";
import { LoadMoreFooter } from "@/ui/patterns/list/load-more-footer.tsx";
import {
  DirectoryToolbar,
  MobileRecordCard,
  PageFrame,
  PageActions,
  PageHeader,
} from "@/ui/patterns/layout/page-layout.tsx";
import { LinkButton } from "@/ui/primitives/link-button.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { SearchInput } from "@/ui/primitives/search-input.tsx";
import { formatQuantity } from "@/ui/format.ts";
import { formatCoverageAvailability } from "@/ui/domain/product-coverage.ts";

export type ProductsDirectoryViewProps = {
  readonly queryText: string;
  readonly onQueryChange: (value: string) => void;
  readonly onClearQuery: () => void;
  readonly activeFilter: boolean | null;
  readonly onFilterChange: (value: boolean | null) => void;
  readonly search: QueryLike<Page<ProductDto>>;
  readonly coverageQuery: QueryLike<readonly ProductCoverageDto[]>;
  readonly products: readonly ProductDto[];
  readonly coverage: readonly ProductCoverageDto[];
  readonly nextCursor: Cursor | null;
  readonly isFetching: boolean;
  readonly onRetry: () => void;
  readonly onRetryCoverage: () => void;
  readonly onLoadMore: () => void;
  readonly canCreate: boolean;
};

export function ProductsDirectoryView({
  queryText,
  onQueryChange,
  onClearQuery,
  activeFilter,
  onFilterChange,
  search,
  coverageQuery,
  products,
  coverage,
  nextCursor,
  isFetching,
  onRetry,
  onRetryCoverage,
  onLoadMore,
  canCreate,
}: ProductsDirectoryViewProps) {
  return (
    <PageFrame size="wide">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Hàng hóa & kho"
          description="Xem ngay tồn thực tế, hàng đang mua, lượng cần giao và phần thiếu hoặc dư theo từng đơn vị."
          actions={
            <PageActions>
              {canCreate ? <LinkButton href="/products/new">Thêm mặt hàng</LinkButton> : null}
            </PageActions>
          }
        />
        <DirectoryToolbar
          search={
            <SearchInput
              label="Tìm mặt hàng"
              placeholder="Tên hoặc tên gọi khác"
              value={queryText}
              onChange={(event) => onQueryChange(event.target.value)}
              onClear={onClearQuery}
            />
          }
          filters={
            <FilterChipGroup
              label="Lọc trạng thái mặt hàng"
              value={activeFilter === null ? "all" : activeFilter ? "active" : "inactive"}
              options={[
                { value: "all", label: "Tất cả" },
                { value: "active", label: "Đang dùng" },
                { value: "inactive", label: "Đã ngưng" },
              ]}
              onChange={(value) => onFilterChange(value === "all" ? null : value === "active")}
            />
          }
        />
        <QueryStates query={search} loadingLabel="Đang tải mặt hàng" onRetry={onRetry}>
          {() =>
            products.length === 0 ? (
              <EmptyState
                title={
                  queryText.trim().length === 0 ? "Chưa có mặt hàng" : "Không tìm thấy mặt hàng"
                }
                description={
                  queryText.trim().length === 0
                    ? "Thêm mặt hàng đầu tiên để theo dõi tồn, lượng đang về và lượng cần giao."
                    : "Thử tên ngắn hơn hoặc một tên gọi khác."
                }
              />
            ) : (
              <QueryStates
                query={coverageQuery}
                loadingLabel="Đang đối chiếu hàng trong kho và các đơn đã chốt"
                onRetry={onRetryCoverage}
              >
                {() => <CoverageDirectory products={products} coverage={coverage} />}
              </QueryStates>
            )
          }
        </QueryStates>
        {nextCursor !== null ? (
          <LoadMoreFooter
            visibleCount={products.length}
            noun="mặt hàng"
            loading={isFetching}
            onLoadMore={onLoadMore}
          />
        ) : null}
      </div>
    </PageFrame>
  );
}

function CoverageDirectory({
  products,
  coverage,
}: {
  readonly products: readonly ProductDto[];
  readonly coverage: readonly ProductCoverageDto[];
}) {
  const coverageByProduct = new Map(coverage.map((row) => [row.productId, row]));
  return (
    <>
      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface lg:hidden">
        {products.map((product) => {
          const row = coverageByProduct.get(product.id);
          return (
            <li key={product.id}>
              <MobileRecordCard href={`/products/${product.id}/inventory`}>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong>{product.displayName}</strong>
                    {product.isActive ? null : <Badge tone="neutral">Đã ngưng</Badge>}
                  </span>
                  <CoverageLines quantities={row?.quantities ?? []} />
                </span>
              </MobileRecordCard>
            </li>
          );
        })}
      </ul>
      <div className="hidden overflow-x-auto rounded-card border border-border bg-surface lg:block">
        <table className="data-table w-full min-w-[1040px] table-fixed text-left text-body-sm">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[18%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2">Mặt hàng</th>
              <th className="px-3 py-2 text-right">Tồn thực tế</th>
              <th className="px-3 py-2 text-right">Đang mua</th>
              <th className="px-3 py-2 text-right">Cần giao</th>
              <th className="px-3 py-2 text-right">Sau đơn đã chốt</th>
              <th className="px-3 py-2 text-right">Việc tiếp theo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {products.map((product) => {
              const row = coverageByProduct.get(product.id);
              const quantities = row?.quantities ?? [];
              return (
                <tr key={product.id} className="hover:bg-surface-muted">
                  <td className="data-table-primary px-3 py-3 align-top">
                    <Link
                      href={`/products/${product.id}/inventory`}
                      className="font-semibold text-info underline-offset-4 hover:underline"
                    >
                      {product.displayName}
                    </Link>
                    <span className="mt-0.5 block text-caption text-ink-muted">
                      {product.aliases.join(", ") || "Không có tên gọi khác"}
                    </span>
                  </td>
                  <CoverageColumn quantities={quantities} field="onHand" />
                  <CoverageColumn quantities={quantities} field="inboundRemaining" />
                  <CoverageColumn quantities={quantities} field="outboundRemaining" />
                  <CoverageColumn quantities={quantities} field="availableAfterCommitments" />
                  <td className="data-table-actions px-3 py-3 align-top">
                    <CoverageAction product={product} coverage={row} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

type CoverageField =
  "onHand" | "inboundRemaining" | "outboundRemaining" | "availableAfterCommitments";

function CoverageColumn({
  quantities,
  field,
}: {
  readonly quantities: ProductCoverageDto["quantities"];
  readonly field: CoverageField;
}) {
  return (
    <td className="px-3 py-3 text-right align-top tabular-nums">
      {quantities.length === 0 ? (
        <span className="text-ink-muted">—</span>
      ) : (
        <span className="grid gap-1">
          {quantities.map((quantity) => (
            <span
              key={quantity.unit}
              className={
                field === "availableAfterCommitments" && quantity.classification === "shortage"
                  ? "font-semibold text-danger"
                  : undefined
              }
            >
              {field === "availableAfterCommitments"
                ? formatCoverageAvailability(quantity)
                : formatQuantity(quantity[field])}
            </span>
          ))}
        </span>
      )}
    </td>
  );
}

function CoverageLines({ quantities }: { readonly quantities: ProductCoverageDto["quantities"] }) {
  if (quantities.length === 0)
    return <span className="mt-1 block text-caption text-ink-muted">Chưa có dữ liệu kho</span>;
  return (
    <span className="mt-2 grid gap-1 text-caption">
      {quantities.map((quantity) => (
        <span key={quantity.unit} className="flex flex-wrap gap-x-3 gap-y-1">
          <span>Tồn {formatQuantity(quantity.onHand)}</span>
          <span>Đang mua {formatQuantity(quantity.inboundRemaining)}</span>
          <span>Cần giao {formatQuantity(quantity.outboundRemaining)}</span>
          <strong className={quantity.classification === "shortage" ? "text-danger" : "text-ink"}>
            {formatCoverageAvailability(quantity)}
          </strong>
        </span>
      ))}
    </span>
  );
}

function CoverageAction({
  product,
  coverage,
}: {
  readonly product: ProductDto;
  readonly coverage: ProductCoverageDto | undefined;
}) {
  const shortage = coverage?.quantities.some((quantity) => quantity.classification === "shortage");
  return (
    <div className="flex flex-col items-end gap-1">
      {coverage === undefined ? (
        <Badge tone="neutral">Chưa có số liệu</Badge>
      ) : shortage ? (
        <Badge tone="warning">Cần bù hàng</Badge>
      ) : (
        <Badge tone="neutral">Đã đối chiếu</Badge>
      )}
      <Link
        href={`/products/${product.id}`}
        className="font-semibold text-info underline-offset-4 hover:underline"
        aria-label={`Sửa thông tin ${product.displayName}`}
      >
        Thông tin
      </Link>
    </div>
  );
}

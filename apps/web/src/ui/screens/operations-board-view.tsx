"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type {
  OperationsBoardCounts,
  OperationsBoardFilter,
  OperationsBoardRow,
  OperationsBoardSort,
} from "@vuarau/domain-contracts";
import Link from "next/link";
import { formatInstant, formatMoney } from "@/ui/format.ts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { LoadMoreFooter } from "@/ui/patterns/list/load-more-footer.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";

export type OperationsBoardPage = {
  readonly counts: OperationsBoardCounts;
  readonly page: {
    readonly items: readonly OperationsBoardRow[];
    readonly nextCursor: string | null;
  };
};

export type OperationsBoardViewProps = {
  readonly query: QueryLike<OperationsBoardPage> & {
    readonly isFetchingNextPage?: boolean;
    readonly hasNextPage?: boolean;
  };
  readonly rows: readonly OperationsBoardRow[];
  readonly filter: OperationsBoardFilter;
  readonly sort: OperationsBoardSort;
  readonly search: string;
  readonly onFilterChange: (filter: OperationsBoardFilter) => void;
  readonly onSortChange: (sort: OperationsBoardSort) => void;
  readonly onSearchChange: (search: string) => void;
  readonly onRetry: () => void;
  readonly onLoadMore: () => void;
};

const FILTERS: readonly { value: OperationsBoardFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "needs_receiving", label: "Cần nhận" },
  { value: "needs_delivery", label: "Cần giao" },
  { value: "in_delivery", label: "Đang giao" },
  { value: "awaiting_payment", label: "Chờ thanh toán" },
  { value: "overdue", label: "Quá hạn" },
  { value: "attention", label: "Cần kiểm tra" },
];

const SORTS: readonly { value: OperationsBoardSort; label: string }[] = [
  { value: "updated_desc", label: "Mới cập nhật" },
  { value: "age_desc", label: "Đơn lâu nhất" },
  { value: "amount_desc", label: "Giá trị cao nhất" },
];

function stateLabel(value: string): string {
  const labels: Record<string, string> = {
    posted: "Đã post",
    confirmed: "Đã xác nhận",
    voided: "Đã hủy",
    needs_receiving: "Cần nhận",
    needs_delivery: "Cần giao",
    in_delivery: "Đang giao",
    delivered: "Đã giao",
    received: "Đã nhận",
    awaiting_payment: "Chờ thanh toán",
    paid: "Đã thanh toán",
    payable: "Phải trả",
    overdue: "Quá hạn",
    attention: "Cần kiểm tra",
  };
  return labels[value] ?? value;
}

function stateTone(value: string): "info" | "warning" | "positive" | "neutral" {
  if (["paid", "received", "delivered"].includes(value)) return "positive";
  if (
    ["needs_delivery", "needs_receiving", "awaiting_payment", "payable", "overdue"].includes(value)
  )
    return "warning";
  if (["in_delivery", "posted", "confirmed"].includes(value)) return "info";
  return "neutral";
}

function ageLabel(ageSeconds: number): string {
  const days = Math.floor(ageSeconds / 86_400);
  if (days > 0) return `${days} ngày`;
  const hours = Math.floor(ageSeconds / 3_600);
  if (hours > 0) return `${hours} giờ`;
  return "< 1 giờ";
}

const columnHelper = createColumnHelper<OperationsBoardRow>();

function columns() {
  return [
    columnHelper.accessor("reference", {
      header: "Mã",
      cell: (info) => (
        <Link href={info.row.original.href} className="font-semibold text-info hover:underline">
          {info.getValue()}
        </Link>
      ),
    }),
    columnHelper.accessor("kind", {
      header: "Loại",
      cell: (info) => (info.getValue() === "sale" ? "Bán" : "Mua"),
    }),
    columnHelper.accessor("counterparty", { header: "Đối tác" }),
    columnHelper.accessor("amount", {
      header: "Giá trị",
      cell: (info) => (
        <span className="tabular whitespace-nowrap">{formatMoney(info.getValue())}</span>
      ),
    }),
    columnHelper.accessor("commercialState", {
      header: "Thương mại",
      cell: (info) => (
        <Badge tone={stateTone(info.getValue())}>{stateLabel(info.getValue())}</Badge>
      ),
    }),
    columnHelper.accessor("physicalState", {
      header: "Vật lý",
      cell: (info) => (
        <Badge tone={stateTone(info.getValue())}>{stateLabel(info.getValue())}</Badge>
      ),
    }),
    columnHelper.accessor("financialState", {
      header: "Tài chính",
      cell: (info) => (
        <Badge tone={stateTone(info.getValue())}>{stateLabel(info.getValue())}</Badge>
      ),
    }),
    columnHelper.accessor("ageSeconds", {
      header: "Tuổi đơn",
      cell: (info) => <span className="whitespace-nowrap">{ageLabel(info.getValue())}</span>,
    }),
    columnHelper.accessor("nextAction", { header: "Việc tiếp theo" }),
    columnHelper.accessor("updatedAt", {
      header: "Cập nhật",
      cell: (info) => <span className="whitespace-nowrap">{formatInstant(info.getValue())}</span>,
    }),
  ];
}

function CountStrip({
  counts,
  active,
  onChange,
}: {
  readonly counts: OperationsBoardCounts;
  readonly active: OperationsBoardFilter;
  readonly onChange: (filter: OperationsBoardFilter) => void;
}) {
  const values: Record<OperationsBoardFilter, number> = {
    all: counts.all,
    needs_receiving: counts.needsReceiving,
    needs_delivery: counts.needsDelivery,
    in_delivery: counts.inDelivery,
    awaiting_payment: counts.awaitingPayment,
    overdue: counts.overdue,
    attention: counts.attention,
  };
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Bộ lọc trạng thái vận hành">
      {FILTERS.map((item) => (
        <Button
          key={item.value}
          tone="secondary"
          aria-pressed={active === item.value}
          onClick={() => onChange(item.value)}
          className={[
            "shrink-0 rounded-full border px-3 py-2 text-body-sm transition-colors",
            active === item.value
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-surface text-ink-muted hover:text-ink",
          ].join(" ")}
        >
          {item.label} <span className="tabular font-semibold">{values[item.value]}</span>
        </Button>
      ))}
    </div>
  );
}

export function OperationsBoardView(props: OperationsBoardViewProps) {
  const table = useReactTable({
    data: [...props.rows],
    columns: columns(),
    getCoreRowModel: getCoreRowModel(),
  });
  const counts = props.query.data?.counts;
  return (
    <div className="grid gap-5">
      <PageHeader
        title="Bảng điều hành"
        description="Theo dõi riêng trạng thái thương mại, vật lý và tài chính của đơn mua và đơn bán."
      />
      {counts === undefined ? null : (
        <CountStrip counts={counts} active={props.filter} onChange={props.onFilterChange} />
      )}
      <div className="grid gap-3 rounded-card border border-border bg-surface p-4 md:grid-cols-[1fr_auto]">
        <TextInput
          label="Tìm mã hoặc đối tác"
          aria-label="Tìm mã hoặc đối tác"
          value={props.search}
          onChange={(event) => props.onSearchChange(event.target.value)}
          placeholder="SALE-… hoặc tên đối tác"
        />
        <Select
          label="Sắp xếp"
          aria-label="Sắp xếp bảng điều hành"
          value={props.sort}
          onChange={(event) => props.onSortChange(event.target.value as OperationsBoardSort)}
          options={SORTS}
        />
      </div>
      <QueryStates
        query={props.query}
        loadingLabel="Đang tải bảng điều hành"
        onRetry={props.onRetry}
      >
        {() =>
          props.rows.length === 0 ? (
            <EmptyState
              title="Không có đơn trong bộ lọc"
              description="Các đơn mới sẽ xuất hiện sau khi được xác nhận hoặc post."
            />
          ) : (
            <div className="overflow-x-auto rounded-card border border-border bg-surface shadow-sm">
              <table className="data-table w-full min-w-[1320px] text-left text-body-sm">
                <thead>
                  <tr>
                    {table.getHeaderGroups()[0]?.headers.map((header) => (
                      <th key={header.id} className="px-3 py-3">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="hover:bg-surface-muted">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-3 align-top">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </QueryStates>
      {props.query.hasNextPage ? (
        <LoadMoreFooter
          visibleCount={props.rows.length}
          noun="đơn"
          loading={props.query.isFetchingNextPage === true}
          onLoadMore={props.onLoadMore}
        />
      ) : null}
      {props.query.isError ? (
        <Button tone="secondary" onClick={props.onRetry}>
          Thử lại bảng
        </Button>
      ) : null}
    </div>
  );
}

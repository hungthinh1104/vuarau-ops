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
import { MobileRecordCard, PageFrame, PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { LoadMoreFooter } from "@/ui/patterns/list/load-more-footer.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";

export type OperationsBoardPage = {
  readonly counts?: OperationsBoardCounts | undefined;
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
  { value: "returned_fulfilment", label: "Hàng trả" },
  { value: "unallocated_payment", label: "Tiền chưa phân bổ" },
  { value: "awaiting_payment", label: "Chờ thanh toán" },
  { value: "overdue", label: "Quá hạn" },
  { value: "attention", label: "Cần kiểm tra" },
  { value: "fulfilment_remainder_unresolved", label: "Còn lại chưa quyết định" },
  { value: "return_settlement_unresolved", label: "Hàng trả chưa quyết định" },
  { value: "reconciliation_variance", label: "Sai khác chưa giải thích" },
];

const SORTS: readonly { value: OperationsBoardSort; label: string }[] = [
  { value: "updated_desc", label: "Mới cập nhật" },
  { value: "age_desc", label: "Đơn lâu nhất" },
  { value: "amount_desc", label: "Giá trị cao nhất" },
];

function stateLabel(value: string): string {
  const labels: Record<string, string> = {
    posted: "Đã chốt",
    confirmed: "Đã xác nhận",
    voided: "Đã loại bỏ",
    needs_receiving: "Cần nhận",
    needs_delivery: "Cần giao",
    in_delivery: "Đang giao",
    delivered: "Đã giao",
    received: "Đã nhận",
    awaiting_payment: "Chờ thanh toán",
    paid: "Đã thanh toán",
    payable: "Phải trả",
    overdue: "Quá hạn",
    reconciliation_required: "Cần đối soát",
    attention: "Cần kiểm tra",
  };
  return labels[value] ?? "Cần kiểm tra";
}

function stateTone(value: string): "info" | "warning" | "positive" | "neutral" {
  if (["paid", "received", "delivered"].includes(value)) return "positive";
  if (
    [
      "needs_delivery",
      "needs_receiving",
      "awaiting_payment",
      "payable",
      "overdue",
      "reconciliation_required",
    ].includes(value)
  )
    return "warning";
  if (["in_delivery", "posted", "confirmed", "reconciliation_required"].includes(value))
    return "info";
  return "neutral";
}

function ageLabel(ageSeconds: number): string {
  const days = Math.floor(ageSeconds / 86_400);
  if (days > 0) return `${days} ngày`;
  const hours = Math.floor(ageSeconds / 3_600);
  if (hours > 0) return `${hours} giờ`;
  return "< 1 giờ";
}

function unallocatedPaymentLabel(row: OperationsBoardRow): string {
  return row.unallocatedPaymentAmount === null
    ? "Tiền chưa phân bổ"
    : `Tiền chưa phân bổ: ${formatMoney(row.unallocatedPaymentAmount)}`;
}

const columnHelper = createColumnHelper<OperationsBoardRow>();

function columns() {
  return [
    columnHelper.accessor("reference", {
      header: "Đơn / đối tác",
      cell: (info) => (
        <div className="grid gap-1">
          <Link href={info.row.original.href} className="font-semibold text-info hover:underline">
            {info.getValue()}
          </Link>
          <span className="text-caption text-ink-muted">{info.row.original.counterparty}</span>
        </div>
      ),
    }),
    columnHelper.accessor("amount", {
      header: "Giá trị",
      cell: (info) => (
        <span className="tabular whitespace-nowrap">{formatMoney(info.getValue())}</span>
      ),
    }),
    columnHelper.accessor("commercialState", {
      header: "Đơn hàng",
      cell: (info) => (
        <div className="grid gap-1">
          <span className="text-caption text-ink-muted">
            {info.row.original.kind === "sale" ? "Bán" : "Mua"}
          </span>
          <Badge tone={stateTone(info.getValue())}>{stateLabel(info.getValue())}</Badge>
        </div>
      ),
    }),
    columnHelper.accessor("physicalState", {
      header: "Hàng hóa",
      cell: (info) => (
        <div className="grid gap-1">
          <Badge tone={stateTone(info.getValue())}>{stateLabel(info.getValue())}</Badge>
          {info.row.original.returnedFulfilment ? (
            <Badge tone="warning">Hàng trả cần xử lý</Badge>
          ) : null}
          {info.row.original.unallocatedPayment ? (
            <Badge tone="warning">{unallocatedPaymentLabel(info.row.original)}</Badge>
          ) : null}
        </div>
      ),
    }),
    columnHelper.accessor("financialState", {
      header: "Thanh toán",
      cell: (info) => (
        <Badge tone={stateTone(info.getValue())}>{stateLabel(info.getValue())}</Badge>
      ),
    }),
    columnHelper.accessor("updatedAt", {
      header: "Việc tiếp theo",
      cell: (info) => (
        <div className="grid gap-1">
          <span className="font-medium">{info.row.original.nextAction ?? "Không cần xử lý"}</span>
          <span className="text-caption text-ink-muted">
            {ageLabel(info.row.original.ageSeconds)} · {formatInstant(info.getValue())}
          </span>
        </div>
      ),
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
    returned_fulfilment: counts.returnedFulfilment,
    unallocated_payment: counts.unallocatedPayment,
    awaiting_payment: counts.awaitingPayment,
    overdue: counts.overdue,
    attention: counts.attention,
    fulfilment_remainder_unresolved: counts.fulfilmentRemainderUnresolved,
    return_settlement_unresolved: counts.returnSettlementUnresolved,
    reconciliation_variance: counts.reconciliationVariance,
  };
  return (
    <div
      className="min-w-0 flex gap-2 overflow-x-auto pb-1"
      aria-label="Bộ lọc trạng thái vận hành"
    >
      {FILTERS.map((item) => (
        <Button
          key={item.value}
          tone="secondary"
          aria-pressed={active === item.value}
          onClick={() => onChange(item.value)}
          className={[
            "shrink-0 rounded-pill border px-3 py-2 text-body-sm transition-colors",
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
    <PageFrame size="wide">
      <div className="min-w-0 grid gap-5">
        <PageHeader
          title="Bảng điều hành"
          description="Theo dõi đơn, hàng hóa và thanh toán của các đơn mua và đơn bán."
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
              <>
                <ul className="grid gap-2 lg:hidden" aria-label="Việc cần xử lý">
                  {props.rows.map((row) => (
                    <li
                      key={row.id}
                      className="min-w-0 rounded-card border border-border bg-surface"
                    >
                      <MobileRecordCard href={row.href}>
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate">{row.reference}</strong>
                          <span className="block truncate text-caption text-ink-muted">
                            {row.counterparty} · {formatMoney(row.amount)}
                          </span>
                          <span className="mt-1 block text-body-sm font-medium">
                            {row.nextAction ??
                              row.exceptions[0]?.nextAction.label ??
                              "Không cần xử lý"}
                          </span>
                          <span className="mt-1 block text-caption text-ink-muted">
                            {ageLabel(row.ageSeconds)} · {formatInstant(row.updatedAt)}
                          </span>
                        </span>
                        <span className="grid shrink-0 gap-1 text-right">
                          <Badge tone={stateTone(row.commercialState)}>
                            {stateLabel(row.commercialState)}
                          </Badge>
                          <Badge tone={stateTone(row.physicalState)}>
                            {stateLabel(row.physicalState)}
                          </Badge>
                          {row.returnedFulfilment ? (
                            <Badge tone="warning">Hàng trả cần xử lý</Badge>
                          ) : null}
                          {row.unallocatedPayment ? (
                            <Badge tone="warning">{unallocatedPaymentLabel(row)}</Badge>
                          ) : null}
                          <Badge tone={stateTone(row.financialState)}>
                            {stateLabel(row.financialState)}
                          </Badge>
                        </span>
                      </MobileRecordCard>
                    </li>
                  ))}
                </ul>
                <div className="hidden overflow-x-auto rounded-card border border-border bg-surface lg:block">
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
              </>
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
    </PageFrame>
  );
}

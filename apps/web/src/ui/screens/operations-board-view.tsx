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
  OperationsException,
  OperationsSemanticCategory,
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
  { value: "outstanding_delivery", label: "Giao còn lại" },
  { value: "incomplete_receiving", label: "Nhận chưa đủ" },
  { value: "needs_receiving", label: "Cần nhận" },
  { value: "needs_delivery", label: "Cần giao" },
  { value: "in_delivery", label: "Đang giao" },
  { value: "returned_fulfilment", label: "Hàng trả" },
  { value: "unallocated_payment", label: "Tiền chưa phân bổ" },
  { value: "awaiting_payment", label: "Chờ thanh toán" },
  { value: "overdue", label: "Quá hạn" },
  { value: "overdue_receivable", label: "Phải thu quá hạn" },
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

export function getEffectiveNextAction(
  row: Pick<OperationsBoardRow, "nextAction" | "exceptions">,
): string {
  return row.nextAction ?? row.exceptions[0]?.nextAction.label ?? "Không cần xử lý";
}

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
    not_applicable: "Không áp dụng",
    unallocated: "Chưa phân bổ",
    overdue: "Quá hạn",
    overdue_receivable: "Phải thu quá hạn",
    reconciliation_required: "Cần đối soát",
    attention: "Cần kiểm tra",
  };
  return labels[value] ?? "Trạng thái chưa xác định";
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
      "overdue_receivable",
      "reconciliation_required",
      "unallocated",
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

const SEMANTIC_CATEGORY_LABELS: Readonly<Record<OperationsSemanticCategory, string>> = {
  work: "Việc chưa xong",
  uncertainty: "Hệ quả chưa quyết định",
  integrity: "Sai khác cần giải thích",
  control: "Điều kiện kiểm soát",
};

function exceptionCategories(row: OperationsBoardRow): OperationsSemanticCategory[] {
  return [...new Set(row.exceptions.map((exception) => exception.category))];
}

const SOURCE_FACT_LABELS: Readonly<Record<string, string>> = {
  reference: "Mã nguồn",
  commercial_state: "Trạng thái đơn",
  physical_state: "Trạng thái hàng",
  financial_state: "Trạng thái thanh toán",
  amount_minor: "Giá trị nguồn (đơn vị nhỏ nhất)",
  delivery_status: "Trạng thái giao",
  delivery_id: "Mã Delivery",
  receiving_status: "Trạng thái nhận hàng",
  returned_fulfilment: "Đã trả phần fulfilment",
  return_id: "Mã Return",
  unallocated_payment_amount_minor: "Tiền chưa phân bổ (đơn vị nhỏ nhất)",
  due_at: "Hạn thanh toán",
  overdue_status: "Trạng thái quá hạn",
  remainder_status: "Trạng thái phần còn lại",
  reconciliation_status: "Trạng thái đối soát",
};

function sourceFactLabel(key: string): string {
  return SOURCE_FACT_LABELS[key] ?? key.replaceAll("_", " ");
}

function OperationsExceptionDetails({ exception }: { readonly exception: OperationsException }) {
  return (
    <details className="rounded-card border border-border bg-canvas p-3">
      <summary className="cursor-pointer text-caption font-semibold">Vì sao cần xử lý?</summary>
      <div className="mt-3 grid gap-3 text-body-sm">
        <div>
          <p className="text-caption font-semibold text-ink-muted">Điều đã biết</p>
          <p className="mt-1">{exception.explanation}</p>
        </div>
        <div>
          <p className="text-caption font-semibold text-ink-muted">Điều chưa biết</p>
          <p className="mt-1">{exception.unknown}</p>
        </div>
        <div>
          <p className="text-caption font-semibold text-ink-muted">Hướng xử lý được phép</p>
          <ul className="mt-1 grid list-disc gap-1 pl-4">
            {exception.resolutionOptions.map((option) => (
              <li key={option.code}>{option.label}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-caption font-semibold text-ink-muted">Điều kiện kết thúc</p>
          <p className="mt-1">{exception.resolutionCondition}</p>
        </div>
        <div>
          <p className="text-caption font-semibold text-ink-muted">Bước tiếp theo</p>
          <p className="mt-1">{exception.nextAction.label}</p>
          {exception.nextAction.href === null ? (
            <p className="mt-1 text-caption text-ink-muted">
              Contract chưa cung cấp đường dẫn thao tác; không tự suy đoán đích đến.
            </p>
          ) : (
            <Link
              href={exception.nextAction.href}
              className="mt-2 inline-flex font-semibold text-info hover:underline"
            >
              Mở bước xử lý
            </Link>
          )}
        </div>
        <div>
          <p className="text-caption font-semibold text-ink-muted">
            Fact nguồn · {exception.source.reference}
          </p>
          <dl className="mt-1 grid gap-1 sm:grid-cols-2">
            {exception.sourceFacts.map((fact) => (
              <div key={`${fact.key}:${fact.value}`}>
                <dt className="text-caption text-ink-muted">{sourceFactLabel(fact.key)}</dt>
                <dd className="break-words">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="border-t border-border pt-2 text-caption text-ink-muted">
          Các hướng trên là thông tin từ contract vận hành. Chỉ thao tác có command và quyền tương
          ứng mới làm thay đổi dữ liệu.
        </p>
      </div>
    </details>
  );
}

function OperationsExceptionDetailsList({
  exceptions,
}: {
  readonly exceptions: readonly OperationsException[];
}) {
  if (exceptions.length === 0) return null;
  return (
    <div className="mt-2 grid gap-2" aria-label="Giải thích việc cần xử lý">
      {exceptions.map((exception) => (
        <OperationsExceptionDetails
          key={`${exception.kind}:${exception.source.id ?? exception.source.reference}`}
          exception={exception}
        />
      ))}
    </div>
  );
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
            {info.row.original.kind === "sale"
              ? "Bán"
              : info.row.original.kind === "purchase"
                ? "Mua"
                : "Thanh toán"}
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
          {exceptionCategories(info.row.original).map((category) => (
            <Badge key={category} tone="warning">
              {SEMANTIC_CATEGORY_LABELS[category]}
            </Badge>
          ))}
          {info.row.original.exceptions.some(
            (exception) => exception.kind === "return_settlement_unresolved",
          ) ? (
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
          <span className="font-medium">{getEffectiveNextAction(info.row.original)}</span>
          <span className="text-caption text-ink-muted">
            {ageLabel(info.row.original.ageSeconds)} · {formatInstant(info.getValue())}
          </span>
          <OperationsExceptionDetailsList exceptions={info.row.original.exceptions} />
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
    outstanding_delivery: counts.outstandingDelivery,
    incomplete_receiving: counts.incompleteReceiving,
    needs_receiving: counts.needsReceiving,
    needs_delivery: counts.needsDelivery,
    in_delivery: counts.inDelivery,
    returned_fulfilment: counts.returnedFulfilment,
    unallocated_payment: counts.unallocatedPayment,
    awaiting_payment: counts.awaitingPayment,
    overdue: counts.overdue,
    overdue_receivable: counts.overdueReceivable,
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
                            {getEffectiveNextAction(row)}
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
                          {exceptionCategories(row).map((category) => (
                            <Badge key={category} tone="warning">
                              {SEMANTIC_CATEGORY_LABELS[category]}
                            </Badge>
                          ))}
                          {row.exceptions.some(
                            (exception) => exception.kind === "return_settlement_unresolved",
                          ) ? (
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
                      <div className="px-4 pb-3">
                        <OperationsExceptionDetailsList exceptions={row.exceptions} />
                      </div>
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

"use client";

import type {
  Page,
  SupplierAccountBalanceDto,
  SupplierAccountEntryDto,
  SupplierDto,
  SupplierReconciliationDto,
} from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import Link from "next/link";
import { formatInstant, formatMoney, formatSignedMoney } from "@/ui/format.ts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { LinkButton } from "@/ui/primitives/link-button.tsx";

const RECONCILIATION_STATUS_COPY = {
  consistent: "Đã đối chiếu",
  inconsistent: "Có sai lệch",
  not_found: "Chưa có sổ",
  integrity_failure: "Dữ liệu cần kiểm tra",
} as const;

export type SupplierDetailViewProps = {
  readonly query: QueryLike<SupplierDto>;
  readonly balance: QueryLike<SupplierAccountBalanceDto | null>;
  readonly reconciliation: QueryLike<SupplierReconciliationDto>;
  readonly timeline: QueryLike<Page<SupplierAccountEntryDto>>;
  readonly entries: readonly SupplierAccountEntryDto[];
  readonly nextCursor: string | null;
  readonly timelineFetching: boolean;
  readonly canUpdate: boolean;
  readonly canCreatePurchase: boolean;
  readonly canReadAccount: boolean;
  readonly moneyActions: (supplier: SupplierDto) => ReactNode;
  readonly onRetry: () => void;
  readonly onBalanceRetry: () => void;
  readonly onReconciliationRetry: () => void;
  readonly onTimelineRetry: () => void;
  readonly onLoadMore: () => void;
};

export function SupplierDetailView(props: SupplierDetailViewProps) {
  return (
    <QueryStates query={props.query} loadingLabel="Đang tải nhà cung cấp" onRetry={props.onRetry}>
      {(record) => (
        <div className="flex max-w-4xl flex-col gap-6">
          <PageHeader
            title={record.displayName}
            description={record.phone ?? "Không có số điện thoại"}
            back={{ href: "/suppliers", label: "Nhà cung cấp" }}
            status={
              <Badge tone={record.isActive ? "positive" : "neutral"}>
                {record.isActive ? "Đang hoạt động" : "Đã ngưng"}
              </Badge>
            }
          />
          {record.note === null ? null : <p>{record.note}</p>}
          <div className="flex flex-wrap gap-2">
            {props.canUpdate ? (
              <LinkButton tone="secondary" href={`/suppliers/${record.id}/edit`}>
                Sửa hồ sơ
              </LinkButton>
            ) : null}
            {props.canCreatePurchase && record.isActive ? (
              <LinkButton href={`/purchases/new?supplierId=${record.id}`}>Tạo đơn mua</LinkButton>
            ) : null}
          </div>
          {props.canReadAccount ? (
            <>
              <QueryStates
                query={props.balance}
                loadingLabel="Đang tải công nợ"
                onRetry={props.onBalanceRetry}
              >
                {(summary) => (
                  <section className="rounded-card border border-border bg-surface p-4">
                    <h2 className="text-subheading font-semibold">Công nợ nhà cung cấp</h2>
                    <p className="text-heading font-bold">
                      {summary === null
                        ? formatMoney({ amountMinor: 0, currency: "VND" })
                        : formatMoney(summary.balance)}
                    </p>
                    <p className="text-caption text-ink-muted">
                      {summary?.classification === "supplier_credit"
                        ? "Nhà cung cấp đang giữ tiền ứng trước"
                        : summary?.classification === "payable"
                          ? "Vựa đang phải trả"
                          : "Đã cân bằng"}
                    </p>
                  </section>
                )}
              </QueryStates>
              {props.moneyActions(record)}
              <QueryStates
                query={props.reconciliation}
                loadingLabel="Đang đối chiếu"
                onRetry={props.onReconciliationRetry}
              >
                {(result) => (
                  <p role="status" className="text-body-sm">
                    Đối chiếu: <strong>{RECONCILIATION_STATUS_COPY[result.status]}</strong>
                    {result.diagnostics.length === 0 ? "" : ` · ${result.diagnostics.join(", ")}`}
                  </p>
                )}
              </QueryStates>
              <section aria-labelledby="supplier-timeline-title" className="flex flex-col gap-3">
                <h2 id="supplier-timeline-title" className="text-subheading font-semibold">
                  Dòng thời gian công nợ
                </h2>
                <QueryStates
                  query={props.timeline}
                  loadingLabel="Đang tải sổ công nợ"
                  onRetry={props.onTimelineRetry}
                >
                  {() =>
                    props.entries.length === 0 ? (
                      <p>Chưa có phát sinh.</p>
                    ) : (
                      <ol className="divide-y divide-border rounded-card border border-border bg-surface">
                        {props.entries.map((entry) => {
                          const href = sourceHref(entry);
                          return (
                            <li key={entry.id} className="px-4 py-3">
                              <div className="flex justify-between gap-3">
                                <span>{entry.sourceType.replaceAll("_", " ")}</span>
                                <strong>{formatSignedMoney(entry.amount)}</strong>
                              </div>
                              <p className="text-caption text-ink-muted">
                                {formatInstant(entry.transactionTime)}
                                {entry.recordedAt === entry.transactionTime
                                  ? ""
                                  : ` · ghi ${formatInstant(entry.recordedAt)}`}
                              </p>
                              {entry.reason === null ? null : <p>{entry.reason}</p>}
                              {href === null ? null : (
                                <Link
                                  href={href}
                                  className="font-semibold text-info underline-offset-4 hover:underline"
                                >
                                  Mở chứng từ
                                </Link>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    )
                  }
                </QueryStates>
                {props.nextCursor === null ? null : (
                  <Button
                    tone="secondary"
                    disabled={props.timelineFetching}
                    onClick={props.onLoadMore}
                  >
                    {props.timelineFetching ? "Đang tải" : "Tải thêm"}
                  </Button>
                )}
              </section>
            </>
          ) : null}
        </div>
      )}
    </QueryStates>
  );
}

function sourceHref(entry: SupplierAccountEntryDto): string | null {
  if (entry.sourceDocument?.type === "purchase") return `/purchases/${entry.sourceDocument.id}`;
  if (entry.sourceDocument?.type === "supplier_payment") {
    return `/supplier-payments/${entry.sourceDocument.id}`;
  }
  if (entry.sourceDocument?.type === "supplier_adjustment") {
    return `/supplier-account-adjustments/${entry.sourceDocument.id}`;
  }
  return null;
}

"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type {
  AccountTimelineEntryDto,
  Cursor,
  CustomerDto,
  CustomerId,
  Page,
} from "@vuarau/domain-contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useCommand } from "@/api/use-command.ts";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { BalanceCard } from "@/ui/patterns/finance/balance-card.tsx";
import { TimelineItem } from "@/ui/patterns/timeline-item.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { formatDate, formatMoney } from "@/ui/format.ts";

/**
 * One customer: what they owe, how it got that way, and what can be done next.
 *
 * The balance and the timeline are two queries rather than one because they page
 * differently — a balance is a single row and a timeline is unbounded — but they
 * are read together so the number and its explanation appear at the same time.
 *
 * The two actions are rendered as links rather than as `CapabilityAction`, and
 * that is deliberate: reaching a *screen* is not performing a command. The
 * capability check belongs where the command is sent, against the state the
 * server reports at that moment, and putting it here as well would mean a control
 * that greyed out for a reason the next screen would re-derive anyway.
 */
export default function CustomerDetailPage() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const params = useParams<{ customerId: string }>();
  const customerId = params.customerId as CustomerId;
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [pages, setPages] = useState<readonly Page<AccountTimelineEntryDto>[]>([]);

  const customer = useQuery({
    ...trpc.customer.get.queryOptions({ workspaceId, customerId }),
    // A detail route is also the landing page after customer commands. Always
    // reconcile its cached copy with server truth when the route mounts.
    refetchOnMount: "always",
  });
  const sales = useQuery(
    trpc.sale.list.queryOptions({
      workspaceId,
      customerId,
      status: null,
      financialState: null,
      from: null,
      to: null,
      cursor: null,
      limit: 5,
    }),
  );
  const payments = useQuery(
    trpc.payment.list.queryOptions({
      workspaceId,
      customerId,
      status: null,
      from: null,
      to: null,
      cursor: null,
      limit: 5,
    }),
  );
  const deactivateMutation = useMutation(trpc.customer.deactivate.mutationOptions());
  const reactivateMutation = useMutation(trpc.customer.reactivate.mutationOptions());
  const deactivateCommand = useCommand<
    { customerId: CustomerId; reason: string | null },
    CustomerDto
  >((envelope) => deactivateMutation.mutateAsync(envelope as never) as Promise<CustomerDto>);
  const reactivateCommand = useCommand<{ customerId: CustomerId; reason: string }, CustomerDto>(
    (envelope) => reactivateMutation.mutateAsync(envelope as never) as Promise<CustomerDto>,
  );
  const timeline = useQuery(
    trpc.account.timeline.queryOptions({
      workspaceId,
      customerId,
      from: null,
      to: null,
      cursor,
      limit: 20,
    }),
  );

  useEffect(() => {
    setCursor(null);
    setPages([]);
  }, [workspaceId, customerId]);
  useEffect(() => {
    if (!timeline.data) return;
    setPages((current) => (cursor === null ? [timeline.data] : [...current, timeline.data]));
  }, [cursor, timeline.data]);
  useEffect(() => {
    if (
      deactivateCommand.phase.kind === "succeeded" ||
      reactivateCommand.phase.kind === "succeeded"
    )
      void customer.refetch();
  }, [customer.refetch, deactivateCommand.phase.kind, reactivateCommand.phase.kind]);
  const entries = pages.flatMap((page) => page.items);
  const nextCursor = pages.at(-1)?.nextCursor ?? null;

  return (
    <div className="flex flex-col gap-6">
      <QueryStates
        query={customer}
        loadingLabel="Đang tải thông tin khách hàng"
        attemptedAction="Xem công nợ khách hàng"
        onRetry={() => void customer.refetch()}
      >
        {(detail) => (
          <div className="flex flex-col gap-6">
            <PageHeader
              title={detail.customer.displayName}
              back={{ href: "/customers", label: "Khách hàng" }}
              status={detail.customer.isActive ? null : <Badge tone="neutral">Đã ngưng</Badge>}
            />

            {detail.customer.phone !== null ? (
              <a
                href={`tel:${detail.customer.phone}`}
                className="text-body text-info underline underline-offset-2"
              >
                {detail.customer.phone}
              </a>
            ) : null}

            <BalanceCard
              customerName={detail.customer.displayName}
              balance={detail.balance}
              classification={detail.classification}
            />

            {detail.customer.note !== null ? (
              <p className="border-l-2 border-border-strong pl-3 text-body-sm text-ink-muted">
                {detail.customer.note}
              </p>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              <Link
                href={`/customers/${customerId}/sales/new`}
                className="touch-target inline-flex flex-1 items-center justify-center rounded-button bg-leaf px-4 text-label font-semibold text-white hover:bg-leaf-hover"
              >
                Tạo đơn mới
              </Link>
              <Link
                href={`/customers/${customerId}/payments/new`}
                className="touch-target inline-flex flex-1 items-center justify-center rounded-button border border-border bg-surface px-4 text-label font-semibold text-ink hover:border-border-strong"
              >
                Ghi nhận thanh toán
              </Link>
              {detail.capabilities.update.allowed ? (
                <Link
                  href={`/customers/${customerId}/edit`}
                  className="touch-target inline-flex flex-1 items-center justify-center rounded-button border border-border bg-surface px-4 text-label font-semibold text-ink"
                >
                  Sửa hồ sơ
                </Link>
              ) : null}
              {session.permissions.includes("debt.adjust") ? (
                <Link
                  href={`/customers/${customerId}/account/adjust`}
                  className="touch-target inline-flex flex-1 items-center justify-center rounded-button border border-border bg-surface px-4 text-label font-semibold text-ink hover:border-border-strong"
                >
                  Điều chỉnh công nợ
                </Link>
              ) : null}
              <Link
                href={`/customers/${customerId}/account/reconciliation`}
                className="touch-target inline-flex flex-1 items-center justify-center rounded-button border border-border bg-surface px-4 text-label font-semibold text-ink hover:border-border-strong"
              >
                Giải thích số dư
              </Link>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {detail.capabilities.deactivate.allowed ? (
                <button
                  type="button"
                  disabled={deactivateCommand.phase.kind === "sending"}
                  onClick={() =>
                    void deactivateCommand.submit(
                      { customerId, reason: "Ngưng dùng hồ sơ khách hàng" },
                      { expectedVersion: detail.customer.version },
                    )
                  }
                  className="touch-target rounded-button border border-danger px-4 text-label text-danger"
                >
                  Ngưng khách hàng
                </button>
              ) : null}
              {detail.capabilities.reactivate.allowed ? (
                <button
                  type="button"
                  disabled={reactivateCommand.phase.kind === "sending"}
                  onClick={() =>
                    void reactivateCommand.submit(
                      { customerId, reason: "Khôi phục hồ sơ khách hàng" },
                      { expectedVersion: detail.customer.version },
                    )
                  }
                  className="touch-target rounded-button border border-border px-4 text-label"
                >
                  Kích hoạt lại
                </button>
              ) : null}
            </div>
            <CommandOutcome
              command={deactivateCommand}
              attemptedAction="Ngưng khách hàng"
              onReload={() => void customer.refetch()}
            />
            <CommandOutcome
              command={reactivateCommand}
              attemptedAction="Kích hoạt lại khách hàng"
              onReload={() => void customer.refetch()}
            />
          </div>
        )}
      </QueryStates>

      <section className="flex flex-col gap-2">
        <h2 className="text-subheading font-semibold">Sổ công nợ</h2>

        <QueryStates
          query={timeline}
          loadingLabel="Đang tải sổ công nợ"
          attemptedAction="Xem sổ công nợ"
          onRetry={() => void timeline.refetch()}
        >
          {() =>
            entries.length === 0 ? (
              // A fact, not a failure: nothing has moved this account.
              <EmptyState
                title="Chưa có giao dịch nào"
                description="Công nợ đúng bằng 0 ₫ vì chưa có đơn hàng hay thanh toán nào được ghi."
              />
            ) : (
              <>
                <ul
                  aria-label="Giao dịch công nợ"
                  className="rounded-card border border-border bg-surface px-4"
                >
                  {entries.map((entry) => {
                    const href = sourceHref(entry);
                    return (
                      <TimelineItem
                        key={entry.id}
                        entry={entry}
                        {...(href === undefined ? {} : { sourceHref: href })}
                      />
                    );
                  })}
                </ul>
                {nextCursor !== null ? (
                  <div className="flex items-center gap-3">
                    <p className="text-caption text-ink-muted">
                      Đang hiện {entries.length} dòng gần nhất.
                    </p>
                    <button
                      type="button"
                      className="touch-target rounded-button border border-border px-3 text-label"
                      disabled={timeline.isFetching}
                      onClick={() => setCursor(nextCursor)}
                    >
                      {timeline.isFetching ? "Đang tải" : "Tải thêm"}
                    </button>
                    {timeline.isError ? (
                      <button
                        type="button"
                        onClick={() => void timeline.refetch()}
                        className="font-semibold text-info underline-offset-4 hover:underline"
                      >
                        Thử lại
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </>
            )
          }
        </QueryStates>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="border-t border-border pt-4">
          <h2 className="text-subheading font-semibold">Đơn gần đây</h2>
          {sales.data?.items.length ? (
            <ul className="mt-2 flex flex-col gap-2 text-body-sm">
              {sales.data.items.map((sale) => (
                <li key={sale.id}>
                  <Link
                    href={`/sales/${sale.id}`}
                    className="font-semibold text-info underline-offset-4 hover:underline"
                  >
                    {formatDate(sale.transactionTime)} · {formatMoney(sale.totalAmount)}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-body-sm text-ink-muted">Chưa có đơn.</p>
          )}
        </div>
        <div className="border-t border-border pt-4">
          <h2 className="text-subheading font-semibold">Thanh toán gần đây</h2>
          {payments.data?.items.length ? (
            <ul className="mt-2 flex flex-col gap-2 text-body-sm">
              {payments.data.items.map((payment) => (
                <li key={payment.id}>
                  <Link
                    href={`/payments/${payment.id}`}
                    className="font-semibold text-info underline-offset-4 hover:underline"
                  >
                    {formatDate(payment.transactionTime)} · {formatMoney(payment.amount)}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-body-sm text-ink-muted">Chưa có thanh toán.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function sourceHref(entry: {
  readonly source: { readonly document: { readonly type: string; readonly id: string } };
}): string | undefined {
  if (entry.source.document.type === "sale") return `/sales/${entry.source.document.id}`;
  if (entry.source.document.type === "payment") return `/payments/${entry.source.document.id}`;
  if (entry.source.document.type === "adjustment")
    return `/account-adjustments/${entry.source.document.id}`;
  return undefined;
}

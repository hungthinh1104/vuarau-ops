"use client";

import { useQuery } from "@tanstack/react-query";
import type { CustomerId } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "../../../../api/session-gate.tsx";
import { useTRPC } from "../../../../api/providers.tsx";
import { QueryStates } from "../../../../ui/patterns/query-states.tsx";
import { BalanceCard } from "../../../../ui/patterns/balance-card.tsx";
import { TimelineItem } from "../../../../ui/patterns/timeline-item.tsx";
import { Badge } from "../../../../ui/primitives/badge.tsx";
import { EmptyState } from "../../../../ui/primitives/empty-state.tsx";

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

  const customer = useQuery(trpc.customer.get.queryOptions({ workspaceId, customerId }));
  const timeline = useQuery(
    trpc.account.timeline.queryOptions({
      workspaceId,
      customerId,
      from: null,
      to: null,
      cursor: null,
      limit: 20,
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <QueryStates
        query={customer}
        loadingLabel="Đang tải thông tin khách hàng"
        attemptedAction="Xem công nợ khách hàng"
        onRetry={() => void customer.refetch()}
      >
        {(detail) => (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="text-heading font-bold">{detail.customer.displayName}</h1>
              {/* Deactivated and still owing is a real, ordinary state
                  (BR-CUSTOMER-003) — greyed, labelled, never hidden. */}
              {detail.customer.isActive ? null : <Badge tone="neutral">Đã ngưng</Badge>}
            </div>

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
              <p className="rounded-card bg-surface-muted px-4 py-3 text-body-sm text-ink">
                {detail.customer.note}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
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
              {session.permissions.includes("debt.adjust") ? (
                <Link
                  href={`/customers/${customerId}/account/adjust`}
                  className="touch-target inline-flex flex-1 items-center justify-center rounded-button border border-border bg-surface px-4 text-label font-semibold text-ink hover:border-border-strong"
                >
                  Điều chỉnh công nợ
                </Link>
              ) : null}
            </div>
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
          {(page) =>
            page.items.length === 0 ? (
              // A fact, not a failure: nothing has moved this account.
              <EmptyState
                title="Chưa có giao dịch nào"
                description="Công nợ đúng bằng 0 ₫ vì chưa có đơn hàng hay thanh toán nào được ghi."
              />
            ) : (
              <>
                <ul className="rounded-card border border-border bg-surface px-4">
                  {page.items.map((entry) => {
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
                {page.nextCursor !== null ? (
                  <p className="text-caption text-ink-muted">
                    Đang hiện {page.items.length} dòng gần nhất.
                  </p>
                ) : null}
              </>
            )
          }
        </QueryStates>
      </section>

      <Link href="/customers" className="text-body-sm text-info underline underline-offset-2">
        ← Danh sách khách hàng
      </Link>
    </div>
  );
}

function sourceHref(entry: {
  readonly source: { readonly document: { readonly type: string; readonly id: string } };
}): string | undefined {
  if (entry.source.document.type === "sale") return `/sales/${entry.source.document.id}`;
  if (entry.source.document.type === "payment") return `/payments/${entry.source.document.id}`;
  return undefined;
}

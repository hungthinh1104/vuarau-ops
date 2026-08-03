"use client";

import type { CustomerSummaryDto, RecentCustomerDto } from "@vuarau/domain-contracts";
import Link from "next/link";
import type { ReactNode } from "react";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { describeBalance } from "@/ui/format.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { QueryStates, type QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { SearchInput } from "@/ui/primitives/search-input.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";

export function QuickSaleStartView(props: {
  readonly recent: QueryLike<readonly RecentCustomerDto[]>;
  readonly search: QueryLike<{ readonly items: readonly CustomerSummaryDto[] }>;
  readonly query: string;
  readonly showingRecent: boolean;
  readonly creating: boolean;
  readonly name: string;
  readonly phone: string;
  readonly note: string;
  readonly offlineError: string | null;
  readonly createCommand: CommandOutcomeView;
  readonly canCreateCustomer: boolean;
  readonly form?: ReactNode;
  readonly onQueryChange: (value: string) => void;
  readonly onClearQuery: () => void;
  readonly onRecentSelect: (customerId: string) => void;
  readonly onSearchSelect: (customerId: string) => void;
  readonly onStartCreate: () => void;
  readonly onNameChange: (value: string) => void;
  readonly onPhoneChange: (value: string) => void;
  readonly onNoteChange: (value: string) => void;
  readonly onCreateInline: () => void;
  readonly onReload: () => void;
}) {
  if (props.form !== undefined) return props.form;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Ghi đơn nhanh" description="Chọn khách để bắt đầu ghi hàng." />
      <SearchInput
        label="Tìm khách hàng"
        placeholder="Tên hoặc số điện thoại"
        value={props.query}
        onChange={(event) => props.onQueryChange(event.target.value)}
        onClear={props.onClearQuery}
        autoFocus
      />
      {props.showingRecent ? (
        <QueryStates
          query={props.recent}
          loadingLabel="Đang tải khách hàng"
          attemptedAction="Chọn khách hàng"
          onRetry={props.onReload}
        >
          {(customers) =>
            customers.length === 0 ? (
              <EmptyState
                title="Chưa có khách gần đây"
                description="Tìm khách bằng tên hoặc số điện thoại để tạo đơn bán."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {customers.map((customer) => {
                  const balance = describeBalance(customer.balance, customer.classification);
                  return (
                    <li key={customer.customerId}>
                      <Link
                        href={`/customers/${customer.customerId}/sales/new`}
                        onClick={() => props.onRecentSelect(customer.customerId)}
                        className="flex min-h-[64px] items-center justify-between rounded-card border border-border bg-surface px-4 py-3 hover:border-border-strong"
                      >
                        <span>
                          <span className="block text-body font-medium">
                            {customer.displayName}
                          </span>
                          <span className="text-caption text-ink-muted">
                            {customer.phone ?? "Không có số điện thoại"}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="block text-caption text-ink-muted">{balance.label}</span>
                          <span className="tabular text-body font-semibold">
                            {balance.amount ?? "—"}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )
          }
        </QueryStates>
      ) : (
        <QueryStates
          query={props.search}
          loadingLabel="Đang tìm khách hàng"
          attemptedAction="Chọn khách hàng"
          onRetry={props.onReload}
        >
          {(page) =>
            page.items.length === 0 ? (
              <EmptyState
                title="Không tìm thấy khách hàng"
                description="Thử gõ ít chữ hơn hoặc số điện thoại."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {page.items.map((customer) => (
                  <li key={customer.id}>
                    <Link
                      href={`/customers/${customer.id}/sales/new`}
                      onClick={() => props.onSearchSelect(customer.id)}
                      className="flex min-h-[64px] items-center rounded-card border border-border bg-surface px-4 py-3 hover:border-border-strong"
                    >
                      <span>
                        <span className="block text-body font-medium">{customer.displayName}</span>
                        <span className="block text-caption text-ink-muted">
                          {customer.phone ?? "Không có số điện thoại"}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          }
        </QueryStates>
      )}
      {!props.showingRecent && props.canCreateCustomer ? (
        <section className="rounded-card border border-border bg-surface p-4">
          {!props.creating ? (
            <Button tone="secondary" fullWidth onClick={props.onStartCreate}>
              Tạo khách “{props.query.trim()}”
            </Button>
          ) : (
            <div className="flex flex-col gap-3">
              <TextInput
                label="Tên khách"
                required
                value={props.name}
                onChange={(event) => props.onNameChange(event.target.value)}
              />
              <TextInput
                label="Số điện thoại"
                value={props.phone}
                onChange={(event) => props.onPhoneChange(event.target.value)}
              />
              <Textarea
                label="Ghi chú"
                rows={2}
                value={props.note}
                onChange={(event) => props.onNoteChange(event.target.value)}
              />
              <Button
                fullWidth
                disabled={
                  props.name.trim().length === 0 || props.createCommand.phase.kind === "sending"
                }
                onClick={props.onCreateInline}
              >
                Tạo khách và ghi đơn
              </Button>
              <CommandOutcome
                command={props.createCommand}
                attemptedAction="Tạo khách hàng"
                onReload={props.onReload}
              />
              {props.offlineError === null ? null : <p role="alert">{props.offlineError}</p>}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

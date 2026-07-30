"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useDebounced } from "@/api/use-debounced.ts";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { SearchInput } from "@/ui/primitives/search-input.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { describeBalance } from "@/ui/format.ts";
import { Button } from "@/ui/primitives/button.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";
import { useCommand } from "@/api/use-command.ts";
import { useWorkflowMetrics } from "@/api/workflow-metrics.ts";
import { hasPermission } from "@/api/session.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { useOffline } from "@/offline/provider.tsx";
import type { CustomerDetailDto, CustomerId } from "@vuarau/domain-contracts";
import { QuickSaleForm } from "../../customers/[customerId]/sales/new/page.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";

/** The direct entry door: select a person, then reuse the one sale command workflow. */
export default function QuickSaleStartPage() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const searchParams = useSearchParams();
  const offline = useOffline();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [offlineError, setOfflineError] = useState<string | null>(null);
  const [offlineCaptureCustomerId, setOfflineCaptureCustomerId] = useState<CustomerId | null>(
    () => searchParams.get("offlineCustomerId") as CustomerId | null,
  );
  const customerIdRef = useRef<string | null>(null);
  const metrics = useWorkflowMetrics();
  const debounced = useDebounced(query, 200);
  const recent = useQuery(trpc.customer.recent.queryOptions({ workspaceId, limit: 10 }));
  const search = useQuery(
    trpc.customer.search.queryOptions({
      workspaceId,
      query: debounced,
      isActive: true,
      cursor: null,
      limit: 12,
    }),
  );
  const showingRecent = query.trim().length === 0;
  const createCustomer = useMutation(trpc.customer.create.mutationOptions());
  const createCommand = useCommand<unknown, { id: string }>(
    async (envelope) => (await createCustomer.mutateAsync(envelope as never)) as { id: string },
  );

  useEffect(() => {
    if (createCommand.result === null) return;
    metrics.count("customer_created_inline");
    window.location.assign(`/customers/${createCommand.result.id}/sales/new`);
  }, [createCommand.result, metrics]);

  async function createInline(): Promise<void> {
    if (name.trim().length === 0) return;
    const customerId = customerIdRef.current ?? (customerIdRef.current = crypto.randomUUID());
    if (!navigator.onLine) {
      const now = new Date().toISOString();
      const pendingCreate = {
        customerId,
        displayName: name.trim(),
        phone: phone.trim() || null,
        note: note.trim() || null,
      };
      try {
        await offline.cacheCustomers([
          {
            ...offline.partition,
            customerId,
            displayName: pendingCreate.displayName,
            phone: pendingCreate.phone,
            fetchedAt: now,
            pendingCreate,
            detail: {
              customer: {
                id: customerId,
                workspaceId,
                displayName: pendingCreate.displayName,
                phone: pendingCreate.phone,
                note: pendingCreate.note,
                isActive: true,
                version: 0,
                transactionTime: now,
                recordedAt: now,
                updatedAt: now,
              },
              balance: { amountMinor: 0, currency: "VND" },
              classification: "settled",
              capabilities: {
                update: { allowed: false, reasonCode: "CUSTOMER_NOT_FOUND" },
                deactivate: { allowed: false, reasonCode: "CUSTOMER_NOT_FOUND" },
                reactivate: { allowed: false, reasonCode: "CUSTOMER_NOT_FOUND" },
                adjustAccount: { allowed: false, reasonCode: "CUSTOMER_NOT_FOUND" },
              },
            } as CustomerDetailDto,
          },
        ]);
        const next = new URLSearchParams(searchParams.toString());
        next.set("offlineCustomerId", customerId);
        window.history.replaceState(null, "", `/sales/new?${next.toString()}`);
        setOfflineCaptureCustomerId(customerId as CustomerId);
      } catch {
        setOfflineError(
          "Không lưu được khách trên thiết bị. Chưa có gì được xếp hàng; giải phóng bộ nhớ rồi thử lại.",
        );
      }
      return;
    }
    const created = await createCommand.submit({
      customerId,
      displayName: name.trim(),
      phone: phone.trim() || null,
      note: note.trim() || null,
    });
    void created;
  }

  if (offlineCaptureCustomerId !== null) {
    return <QuickSaleForm customerIdOverride={offlineCaptureCustomerId} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Ghi đơn nhanh" description="Chọn khách để bắt đầu ghi hàng." />
      <SearchInput
        label="Tìm khách hàng"
        placeholder="Tên hoặc số điện thoại"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onClear={() => setQuery("")}
        autoFocus
      />
      {showingRecent ? (
        <QueryStates
          query={recent}
          loadingLabel="Đang tải khách hàng"
          attemptedAction="Chọn khách hàng"
          onRetry={() => void recent.refetch()}
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
                        onClick={() => metrics.count("recent_customer_selected")}
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
          query={search}
          loadingLabel="Đang tìm khách hàng"
          attemptedAction="Chọn khách hàng"
          onRetry={() => void search.refetch()}
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
                      onClick={() => metrics.count("customer_selected_from_search")}
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
      {!showingRecent &&
      (search.data?.items.length === 0 ||
        search.isError ||
        (typeof navigator !== "undefined" && !navigator.onLine && search.isPending)) &&
      hasPermission(session, "customer.create") ? (
        <section className="rounded-card border border-border bg-surface p-4">
          {!creating ? (
            <Button
              tone="secondary"
              fullWidth
              onClick={() => {
                setName(query.trim());
                setCreating(true);
              }}
            >
              Tạo khách “{query.trim()}”
            </Button>
          ) : (
            <div className="flex flex-col gap-3">
              <TextInput
                label="Tên khách"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <TextInput
                label="Số điện thoại"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
              <Textarea
                label="Ghi chú"
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <Button
                fullWidth
                onClick={() => void createInline()}
                {...(name.trim().length === 0 || createCommand.phase.kind === "sending"
                  ? { disabledReason: "Nhập tên khách trước khi tạo." }
                  : {})}
              >
                Tạo khách và ghi đơn
              </Button>
              <CommandOutcome
                command={createCommand}
                attemptedAction="Tạo khách hàng"
                onReload={() => window.location.reload()}
              />
              {offlineError === null ? null : <p role="alert">{offlineError}</p>}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

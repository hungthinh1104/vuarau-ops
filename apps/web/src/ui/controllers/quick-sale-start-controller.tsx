"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createCustomerCommandSchema,
  type CustomerDetailDto,
  type CustomerId,
} from "@vuarau/domain-contracts";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { hasPermission } from "@/api/session.ts";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useDebounced } from "@/api/use-debounced.ts";
import { useContractCommand } from "@/api/use-command.ts";
import { useWorkflowMetrics } from "@/api/workflow-metrics.ts";
import { useOffline } from "@/offline/provider.tsx";
import { QuickSaleStartView } from "@/ui/screens/quick-sale-start-view.tsx";

const QuickSaleFormController = dynamic(
  () =>
    import("@/ui/controllers/quick-sale-form-controller.tsx").then(
      (module) => module.QuickSaleFormController,
    ),
  { ssr: false },
);

export function QuickSaleStartController() {
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
  const customerIdRef = useRef<CustomerId | null>(null);
  const metrics = useWorkflowMetrics();
  const debounced = useDebounced(query, 200);
  const recent = useQuery(trpc.customer.recent.queryOptions({ workspaceId, limit: 10 }));
  const search = useQuery({
    ...trpc.customer.search.queryOptions({
      workspaceId,
      query: debounced,
      isActive: true,
      cursor: null,
      limit: 12,
    }),
    enabled: debounced.trim().length > 0,
  });
  const createCustomer = useMutation(trpc.customer.create.mutationOptions());
  const createCommand = useContractCommand(createCustomerCommandSchema, createCustomer.mutateAsync);
  useEffect(() => {
    if (createCommand.result === null) return;
    metrics.count("customer_created_inline");
    window.location.assign(`/customers/${createCommand.result.id}/sales/new`);
  }, [createCommand.result, metrics]);

  async function createInline(): Promise<void> {
    if (name.trim().length === 0) return;
    const customerId =
      customerIdRef.current ?? (customerIdRef.current = crypto.randomUUID() as CustomerId);
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
    await createCommand.submit({
      customerId,
      displayName: name.trim(),
      phone: phone.trim() || null,
      note: note.trim() || null,
    });
  }

  return (
    <QuickSaleStartView
      recent={recent}
      search={search}
      query={query}
      showingRecent={query.trim().length === 0}
      creating={creating}
      name={name}
      phone={phone}
      note={note}
      offlineError={offlineError}
      createCommand={createCommand}
      canCreateCustomer={hasPermission(session, "customer.create")}
      {...(offlineCaptureCustomerId === null
        ? {}
        : { form: <QuickSaleFormController customerIdOverride={offlineCaptureCustomerId} /> })}
      onQueryChange={setQuery}
      onClearQuery={() => setQuery("")}
      onRecentSelect={() => metrics.count("recent_customer_selected")}
      onSearchSelect={() => metrics.count("customer_selected_from_search")}
      onStartCreate={() => {
        setName(query.trim());
        setCreating(true);
      }}
      onNameChange={setName}
      onPhoneChange={setPhone}
      onNoteChange={setNote}
      onCreateInline={() => void createInline()}
      onReload={() =>
        void Promise.all([
          recent.refetch(),
          ...(debounced.trim().length > 0 ? [search.refetch()] : []),
        ])
      }
    />
  );
}

"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type {
  AccountTimelineEntryDto,
  Cursor,
  CustomerDto,
  CustomerId,
  DocumentDto,
  DocumentId,
  DocumentPeriod,
  Page,
} from "@vuarau/domain-contracts";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useCommand } from "@/api/use-command.ts";
import { CustomerStatementPanel } from "@/ui/patterns/document/customer-statement-panel.tsx";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { CustomerDetailView } from "@/ui/screens/customer-detail-view.tsx";

export default function CustomerDetailPage() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const params = useParams<{ customerId: string }>();
  const customerId = params.customerId as CustomerId;
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [pages, setPages] = useState<readonly Page<AccountTimelineEntryDto>[]>([]);

  const customer = useQuery({
    ...trpc.customer.get.queryOptions({ workspaceId, customerId }),
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

  const deactivateMutation = useMutation(trpc.customer.deactivate.mutationOptions());
  const reactivateMutation = useMutation(trpc.customer.reactivate.mutationOptions());
  const documentMutation = useMutation(trpc.document.generate.mutationOptions());
  const deactivateCommand = useCommand<
    { customerId: CustomerId; reason: string | null },
    CustomerDto
  >((envelope) => deactivateMutation.mutateAsync(envelope as never) as Promise<CustomerDto>);
  const reactivateCommand = useCommand<{ customerId: CustomerId; reason: string }, CustomerDto>(
    (envelope) => reactivateMutation.mutateAsync(envelope as never) as Promise<CustomerDto>,
  );
  const statementDocumentId = useRef(crypto.randomUUID() as DocumentId);
  const statementDocument = useCommand<
    {
      documentId: DocumentId;
      documentType: "customer_statement";
      sourceType: "customer";
      sourceId: CustomerId;
      period: DocumentPeriod;
    },
    DocumentDto
  >((envelope) => documentMutation.mutateAsync(envelope as never) as Promise<DocumentDto>);

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
    ) {
      void customer.refetch();
    }
  }, [customer.refetch, deactivateCommand.phase.kind, reactivateCommand.phase.kind]);
  useEffect(() => {
    if (statementDocument.result !== null) {
      router.push(`/documents/${statementDocument.result.id}`);
    }
  }, [router, statementDocument.result]);

  const entries = pages.flatMap((page) => page.items);
  const nextCursor = pages.at(-1)?.nextCursor ?? null;
  const customerCommandLocked =
    deactivateCommand.phase.kind === "sending" ||
    deactivateCommand.phase.kind === "unknown" ||
    reactivateCommand.phase.kind === "sending" ||
    reactivateCommand.phase.kind === "unknown";
  const timelineState =
    timeline.isPending && entries.length === 0 ? "loading" : timeline.isError ? "error" : "ready";

  return (
    <QueryStates
      query={customer}
      loadingLabel="Đang tải thông tin khách hàng"
      attemptedAction="Xem công nợ khách hàng"
      onRetry={() => void customer.refetch()}
    >
      {(detail) => (
        <CustomerDetailView
          detail={detail}
          timelineEntries={entries}
          timelineState={timelineState}
          timelineHasMore={nextCursor !== null}
          timelineFetching={timeline.isFetching}
          recentSales={sales.data?.items ?? []}
          recentPayments={payments.data?.items ?? []}
          canCreateSale={session.permissions.includes("sale.create")}
          canRecordPayment={session.permissions.includes("payment.record")}
          canAdjustDebt={session.permissions.includes("debt.adjust")}
          documentSection={
            session.permissions.includes("document.generate") ? (
              <CustomerStatementPanel
                locked={
                  statementDocument.phase.kind === "sending" ||
                  statementDocument.phase.kind === "unknown"
                }
                onSubmit={(period) =>
                  void statementDocument.submit({
                    documentId: statementDocumentId.current,
                    documentType: "customer_statement",
                    sourceType: "customer",
                    sourceId: customerId,
                    period,
                  })
                }
                feedback={
                  <CommandOutcome
                    command={statementDocument}
                    attemptedAction="Tạo sao kê công nợ"
                    onReload={() => void customer.refetch()}
                  />
                }
              />
            ) : undefined
          }
          customerCommandLocked={customerCommandLocked}
          onDeactivate={() =>
            void deactivateCommand.submit(
              { customerId, reason: "Ngưng dùng hồ sơ khách hàng" },
              { expectedVersion: detail.customer.version },
            )
          }
          onReactivate={() =>
            void reactivateCommand.submit(
              { customerId, reason: "Khôi phục hồ sơ khách hàng" },
              { expectedVersion: detail.customer.version },
            )
          }
          onLoadMore={() => {
            if (nextCursor !== null) setCursor(nextCursor);
          }}
          onRetryTimeline={() => void timeline.refetch()}
          outcomes={
            <>
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
            </>
          }
        />
      )}
    </QueryStates>
  );
}

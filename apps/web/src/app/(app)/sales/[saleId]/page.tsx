"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { DocumentDto, DocumentId, SaleDto, SaleId } from "@vuarau/domain-contracts";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { hasPermission } from "@/api/session.ts";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useCommand } from "@/api/use-command.ts";
import { useDebounced } from "@/api/use-debounced.ts";
import { useWorkflowMetrics } from "@/api/workflow-metrics.ts";
import { messageForCode } from "@/ui/copy.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import {
  SaleCorrectionPanel,
  type SaleCorrectionSubmission,
} from "@/ui/patterns/sale/sale-correction-panel.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { SaleDetailView } from "@/ui/screens/sale-detail-view.tsx";

export default function SaleDetailPage() {
  const { session, workspaceId } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const saleId = useParams<{ saleId: string }>().saleId as SaleId;
  const metrics = useWorkflowMetrics();

  const sale = useQuery(trpc.sale.detail.queryOptions({ workspaceId, saleId }));
  const canReadDelivery = hasPermission(session, "delivery.read");
  const fulfilment = useQuery({
    ...trpc.delivery.fulfilment.queryOptions({ workspaceId, saleId }),
    enabled: canReadDelivery,
  });
  const deliveries = useQuery({
    ...trpc.delivery.list.queryOptions({
      workspaceId,
      saleId,
      status: null,
      cursor: null,
      limit: 100,
    }),
    enabled: canReadDelivery,
  });

  const replacedSaleId = sale.data?.sale.replacesSaleId;
  const replacedSale = useQuery({
    ...trpc.sale.detail.queryOptions({
      workspaceId,
      saleId: replacedSaleId as SaleId,
    }),
    enabled: replacedSaleId !== null && replacedSaleId !== undefined,
    refetchOnMount: "always",
    staleTime: 0,
  });

  const voidMutation = useMutation(trpc.sale.void.mutationOptions());
  const documentMutation = useMutation(trpc.document.generate.mutationOptions());
  const receiptDocumentId = useRef(crypto.randomUUID() as DocumentId);
  const receiptDocument = useCommand<unknown, DocumentDto>((envelope) =>
    documentMutation.mutateAsync(envelope as never),
  );
  const voidCommand = useCommand<
    {
      saleVoidId: string;
      saleId: string;
      reasonCode: SaleCorrectionSubmission["reasonCode"];
      reason: string;
    },
    SaleDto
  >(async (envelope) => (await voidMutation.mutateAsync(envelope as never)) as SaleDto);

  const [correction, setCorrection] = useState<SaleCorrectionSubmission | null>(null);
  const [replacementCustomerQuery, setReplacementCustomerQuery] = useState("");
  const [recoveryCustomerId, setRecoveryCustomerId] = useState<string | null>(null);
  const debouncedCustomerQuery = useDebounced(replacementCustomerQuery, 200);
  const correctionCustomers = useQuery(
    trpc.customer.search.queryOptions({
      workspaceId,
      query: debouncedCustomerQuery,
      isActive: true,
      cursor: null,
      limit: 12,
    }),
  );
  const completedCorrectionRef = useRef<string | null>(null);

  useEffect(() => {
    if (sale.isSuccess) metrics.mark("sale_detail_viewed");
  }, [metrics, sale.isSuccess]);

  useEffect(() => {
    if (
      voidCommand.phase.kind !== "succeeded" ||
      voidCommand.result === null ||
      correction === null
    ) {
      return;
    }
    if (completedCorrectionRef.current === voidCommand.result.id) return;
    completedCorrectionRef.current = voidCommand.result.id;

    if (correction.replacement) {
      const replacementCustomerId =
        correction.reasonCode === "wrong_customer"
          ? correction.replacementCustomerId
          : voidCommand.result.customerId;
      if (replacementCustomerId === null) return;
      router.push(
        `/customers/${replacementCustomerId}/sales/new?replacesSaleId=${voidCommand.result.id}`,
      );
      return;
    }
    void sale.refetch();
  }, [correction, router, sale.refetch, voidCommand.phase.kind, voidCommand.result]);

  useEffect(() => {
    if (receiptDocument.result !== null) {
      router.push(`/documents/${receiptDocument.result.id}`);
    }
  }, [receiptDocument.result, router]);

  function submitCorrection(next: SaleCorrectionSubmission): void {
    setCorrection(next);
    void voidCommand.submit({
      saleVoidId: crypto.randomUUID(),
      saleId,
      reasonCode: next.reasonCode,
      reason: next.reason,
    });
  }

  return (
    <QueryStates
      query={sale}
      loadingLabel="Đang tải đơn hàng"
      attemptedAction="Xem đơn hàng"
      onRetry={() => void sale.refetch()}
    >
      {(detail) => {
        const canVoid = hasPermission(session, "sale.void");
        const voidLocked =
          voidCommand.phase.kind === "sending" || voidCommand.phase.kind === "unknown";
        const documentLocked =
          receiptDocument.phase.kind === "sending" || receiptDocument.phase.kind === "unknown";
        const goodsReturnStatus =
          fulfilment.isSuccess && fulfilment.data.integrity === "healthy"
            ? fulfilment.data.lines.some((line) => line.netFulfilled.valueScaled > 0)
              ? ("blocked" as const)
              : ("safe" as const)
            : ("unknown" as const);

        return (
          <SaleDetailView
            detail={detail}
            {...(fulfilment.data === undefined ? {} : { fulfilment: fulfilment.data })}
            {...(deliveries.data === undefined ? {} : { deliveries: deliveries.data.items })}
            {...(replacedSale.data === undefined ? {} : { replacedSale: replacedSale.data.sale })}
            canGenerateDocument={session.permissions.includes("document.generate")}
            documentLocked={documentLocked}
            onGenerateDocument={() =>
              void receiptDocument.submit({
                documentId: receiptDocumentId.current,
                documentType: "sale_receipt",
                sourceType: "sale",
                sourceId: saleId,
              })
            }
            correctionSection={
              detail.sale.status === "posted" ? (
                <section className="flex flex-col gap-3">
                  {canVoid && detail.sale.capabilities.void.allowed ? (
                    <SaleCorrectionPanel
                      onSubmit={submitCorrection}
                      goodsReturnStatus={goodsReturnStatus}
                      originalCustomerId={detail.sale.customerId}
                      customerSearchQuery={replacementCustomerQuery}
                      customerMatches={correctionCustomers.data?.items ?? []}
                      onCustomerSearchChange={setReplacementCustomerQuery}
                      disabled={voidLocked}
                    />
                  ) : (
                    <p className="border-l-2 border-border-strong pl-3 text-body-sm text-ink-muted">
                      {canVoid
                        ? detail.sale.capabilities.void.reasonCode === undefined
                          ? "Đơn này không thể điều chỉnh."
                          : messageForCode(detail.sale.capabilities.void.reasonCode)
                        : "Bạn không có quyền điều chỉnh đơn đã chốt."}
                    </p>
                  )}
                  <CommandOutcome
                    command={voidCommand}
                    attemptedAction="Hoàn tác đơn đã chốt"
                    onReload={() => void sale.refetch()}
                  />
                </section>
              ) : undefined
            }
            recoverySection={
              detail.sale.status === "posted" &&
              detail.correction.voidRecord !== null &&
              detail.correction.replacedBySaleId === null &&
              canVoid ? (
                <ReplacementRecovery
                  sale={detail.sale}
                  query={replacementCustomerQuery}
                  customerMatches={correctionCustomers.data?.items ?? []}
                  selectedCustomerId={recoveryCustomerId}
                  onQueryChange={setReplacementCustomerQuery}
                  onSelectCustomer={setRecoveryCustomerId}
                  onContinue={(customerId) =>
                    router.push(
                      `/customers/${customerId}/sales/new?replacesSaleId=${detail.sale.id}`,
                    )
                  }
                />
              ) : undefined
            }
            feedback={
              <CommandOutcome
                command={receiptDocument}
                attemptedAction="Tạo phiếu bán hàng"
                onReload={() => void sale.refetch()}
              />
            }
          />
        );
      }}
    </QueryStates>
  );
}

function ReplacementRecovery(props: {
  readonly sale: SaleDto;
  readonly query: string;
  readonly customerMatches: readonly { readonly id: string; readonly displayName: string }[];
  readonly selectedCustomerId: string | null;
  readonly onQueryChange: (value: string) => void;
  readonly onSelectCustomer: (customerId: string) => void;
  readonly onContinue: (customerId: string) => void;
}) {
  const voidRecord = props.sale.voidRecord;
  if (voidRecord === null) return null;
  const wrongCustomer = voidRecord.reasonCode === "wrong_customer";
  const customerId = wrongCustomer ? props.selectedCustomerId : props.sale.customerId;

  return (
    <section className="rounded-card border border-warning/30 bg-warning-soft p-4">
      <h2 className="text-subheading font-semibold">Tiếp tục đơn thay thế</h2>
      <p className="mt-1 text-body-sm text-ink-muted">
        Đơn gốc đã được hoàn tác. Có thể tiếp tục tạo đơn thay thế sau khi tải lại hoặc khi phản hồi
        trước đó bị gián đoạn.
      </p>
      {wrongCustomer ? (
        <div className="mt-3 flex flex-col gap-2">
          <label className="text-label font-semibold" htmlFor="recovery-customer-search">
            Khách hàng đúng
          </label>
          <input
            id="recovery-customer-search"
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder="Tìm tên hoặc số điện thoại"
            className="min-h-11 rounded-button border border-border bg-surface px-3 text-body"
          />
          <div className="flex flex-wrap gap-2">
            {props.customerMatches
              .filter((customer) => customer.id !== props.sale.customerId)
              .map((customer) => (
                <Button
                  key={customer.id}
                  tone="secondary"
                  onClick={() => props.onSelectCustomer(customer.id)}
                >
                  {customer.displayName}
                </Button>
              ))}
          </div>
        </div>
      ) : null}
      <Button
        className="mt-3"
        onClick={() => {
          if (customerId !== null) props.onContinue(customerId);
        }}
        {...(customerId === null
          ? { disabledReason: "Chọn khách hàng đúng trước khi tiếp tục." }
          : {})}
      >
        Tạo đơn thay thế
      </Button>
    </section>
  );
}

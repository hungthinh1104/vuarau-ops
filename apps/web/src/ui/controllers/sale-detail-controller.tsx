"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  generateDocumentCommandSchema,
  voidSaleCommandSchema,
  type DocumentId,
  type SaleId,
  type SaleVoidId,
} from "@vuarau/domain-contracts";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { hasPermission } from "@/api/session.ts";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { useDebounced } from "@/api/use-debounced.ts";
import { useWorkflowMetrics } from "@/api/workflow-metrics.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import type { SaleCorrectionSubmission } from "@/ui/patterns/sale/sale-correction-panel.tsx";
import {
  SaleCorrectionSectionView,
  SaleDetailView,
  SaleReplacementRecoveryView,
} from "@/ui/screens/sale-detail-view.tsx";

export function SaleDetailController() {
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
    ...trpc.sale.detail.queryOptions({ workspaceId, saleId: replacedSaleId as SaleId }),
    enabled: replacedSaleId !== null && replacedSaleId !== undefined,
    refetchOnMount: "always",
    staleTime: 0,
  });
  const voidMutation = useMutation(trpc.sale.void.mutationOptions());
  const documentMutation = useMutation(trpc.document.generate.mutationOptions());
  const receiptDocumentId = useRef(crypto.randomUUID() as DocumentId);
  const receiptDocument = useContractCommand(
    generateDocumentCommandSchema,
    documentMutation.mutateAsync,
  );
  const voidCommand = useContractCommand(voidSaleCommandSchema, voidMutation.mutateAsync);
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
    )
      return;
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
    if (receiptDocument.result !== null) router.push(`/documents/${receiptDocument.result.id}`);
  }, [receiptDocument.result, router]);

  function submitCorrection(next: SaleCorrectionSubmission): void {
    setCorrection(next);
    void voidCommand.submit({
      saleVoidId: crypto.randomUUID() as SaleVoidId,
      saleId,
      reasonCode: next.reasonCode,
      reason: next.reason,
      evidenceReferences: [...next.evidenceReferences],
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
                period: null,
              })
            }
            correctionSection={
              detail.sale.status === "posted" ? (
                <SaleCorrectionSectionView
                  sale={detail.sale}
                  canVoid={canVoid}
                  voidAllowed={detail.sale.capabilities.void.allowed}
                  voidReasonCode={detail.sale.capabilities.void.reasonCode}
                  goodsReturnStatus={goodsReturnStatus}
                  customerSearchQuery={replacementCustomerQuery}
                  customerMatches={correctionCustomers.data?.items ?? []}
                  command={voidCommand}
                  disabled={voidLocked}
                  onSubmit={submitCorrection}
                  onCustomerSearchChange={setReplacementCustomerQuery}
                  onReload={() => void sale.refetch()}
                />
              ) : undefined
            }
            recoverySection={
              detail.sale.status === "posted" &&
              detail.correction.voidRecord !== null &&
              detail.correction.replacedBySaleId === null &&
              canVoid ? (
                <SaleReplacementRecoveryView
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

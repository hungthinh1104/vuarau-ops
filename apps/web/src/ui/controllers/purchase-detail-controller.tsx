"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  confirmPurchaseCommandSchema,
  discardPurchaseDraftCommandSchema,
  recordPurchaseReceiptCommandSchema,
  reversePurchaseReceiptCommandSchema,
  voidPurchaseCommandSchema,
  type PurchaseId,
  type PurchaseReceiptLineId,
  type PurchaseReceiptId,
  type PurchaseReceiptReversalId,
  type PurchaseVoidId,
  type PurchaseVoidReasonCode,
} from "@vuarau/domain-contracts";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { useWorkflowCacheEffects } from "@/api/workflow-cache.ts";
import { messageForCode } from "@/ui/copy.ts";
import { parseSourceEvidence } from "@/ui/domain/source-evidence.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import {
  ReceivingCapturePanel,
  type ReceivingCaptureIntentLine,
} from "@/ui/patterns/receiving/receiving-capture-panel.tsx";
import { ReceiptReversalPanel } from "@/ui/patterns/receiving/receipt-reversal-panel.tsx";
import {
  PurchaseDetailView,
  PurchaseDraftActionsView,
  PurchaseInspectedIntakeView,
  PurchaseCommandsFeedbackView,
  PurchaseReceivingLoadingView,
  PurchaseVoidView,
} from "@/ui/screens/purchase-detail-view.tsx";

export function PurchaseDetailController() {
  const purchaseId = useParams<{ purchaseId: string }>().purchaseId as PurchaseId;
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const cache = useWorkflowCacheEffects();
  const purchase = useQuery(trpc.purchase.get.queryOptions({ workspaceId, purchaseId }));
  const operationalProfile = useQuery(
    trpc.session.operationalProfile.queryOptions({ workspaceId }),
  );
  const arrivals = useQuery(
    trpc.intake.listArrivals.queryOptions({
      workspaceId,
      purchaseId,
      supplierId: null,
      cursor: null,
      limit: 100,
    }),
  );
  const receipts = useQuery(
    trpc.receiving.listForPurchase.queryOptions({ workspaceId, purchaseId }),
  );
  const receivingSummary = useQuery(
    trpc.receiving.summaryForPurchase.queryOptions({ workspaceId, purchaseId }),
  );
  const qualityGrades = useQuery(
    trpc.quality.list.queryOptions({
      workspaceId,
      query: "",
      isActive: true,
      cursor: null,
      limit: 100,
    }),
  );
  const confirmMutation = useMutation(trpc.purchase.confirm.mutationOptions());
  const discardMutation = useMutation(trpc.purchase.discardDraft.mutationOptions());
  const voidMutation = useMutation(trpc.purchase.void.mutationOptions());
  const receiptMutation = useMutation(trpc.receiving.record.mutationOptions());
  const reverseMutation = useMutation(trpc.receiving.reverse.mutationOptions());
  const confirm = useContractCommand(confirmPurchaseCommandSchema, confirmMutation.mutateAsync);
  const discard = useContractCommand(
    discardPurchaseDraftCommandSchema,
    discardMutation.mutateAsync,
  );
  const voidCommand = useContractCommand(voidPurchaseCommandSchema, voidMutation.mutateAsync);
  const receipt = useContractCommand(
    recordPurchaseReceiptCommandSchema,
    receiptMutation.mutateAsync,
  );
  const reverse = useContractCommand(
    reversePurchaseReceiptCommandSchema,
    reverseMutation.mutateAsync,
  );
  const receiptId = useRef(crypto.randomUUID() as PurchaseReceiptId);
  const reversalId = useRef(crypto.randomUUID() as PurchaseReceiptReversalId);
  const receiptLineIds = useRef(new Map<string, PurchaseReceiptLineId>());
  const [receiptQuantities, setReceiptQuantities] = useState<Record<string, string>>({});
  const [receiptEvidence, setReceiptEvidence] = useState("");
  const [reverseTarget, setReverseTarget] = useState<PurchaseReceiptId | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidEvidence, setVoidEvidence] = useState("");
  const [voidReasonCode, setVoidReasonCode] = useState<PurchaseVoidReasonCode>("other");
  const refresh = useCallback(() => {
    void cache.purchaseChanged(workspaceId, purchaseId);
    void Promise.all([
      purchase.refetch(),
      receipts.refetch(),
      receivingSummary.refetch(),
      operationalProfile.refetch(),
      arrivals.refetch(),
    ]);
  }, [
    arrivals.refetch,
    operationalProfile.refetch,
    purchase.refetch,
    receipts.refetch,
    receivingSummary.refetch,
    cache.purchaseChanged,
    purchaseId,
    workspaceId,
  ]);

  useEffect(() => {
    if (confirm.result !== null || discard.result !== null || voidCommand.result !== null)
      refresh();
  }, [confirm.result, discard.result, refresh, voidCommand.result]);
  useEffect(() => {
    if (receipt.result === null) return;
    void cache.receivingChanged(workspaceId, purchaseId);
    refresh();
    setReceiptQuantities({});
    setReceiptEvidence("");
    receiptLineIds.current.clear();
    receiptId.current = crypto.randomUUID() as PurchaseReceiptId;
    receipt.reset();
  }, [cache.receivingChanged, purchaseId, receipt.result, receipt.reset, refresh, workspaceId]);
  useEffect(() => {
    if (reverse.result === null) return;
    void cache.receivingChanged(workspaceId, purchaseId);
    refresh();
    setReverseTarget(null);
    reversalId.current = crypto.randomUUID() as PurchaseReceiptReversalId;
    reverse.reset();
  }, [cache.receivingChanged, purchaseId, refresh, reverse.reset, reverse.result, workspaceId]);

  function recordReceipt(lines: readonly ReceivingCaptureIntentLine[]): void {
    const commandLines = lines.map((line) => {
      const key = `${line.purchaseLineId}:${line.qualityGradeId}`;
      let receiptLineId = receiptLineIds.current.get(key);
      if (receiptLineId === undefined) {
        receiptLineId = crypto.randomUUID() as PurchaseReceiptLineId;
        receiptLineIds.current.set(key, receiptLineId);
      }
      return { receiptLineId, ...line };
    });
    void receipt.submit({
      receiptId: receiptId.current,
      purchaseId,
      lines: commandLines,
      note: null,
      evidenceReferences: parseSourceEvidence(receiptEvidence),
    });
  }

  return (
    <QueryStates
      query={purchase}
      loadingLabel="Đang tải đơn mua"
      onRetry={() => void purchase.refetch()}
    >
      {(detail) => {
        const receiptLocked = receipt.phase.kind === "sending" || receipt.phase.kind === "unknown";
        const reverseLocked = reverse.phase.kind === "sending" || reverse.phase.kind === "unknown";
        const voidLocked =
          voidCommand.phase.kind === "sending" || voidCommand.phase.kind === "unknown";
        const confirmLocked = confirm.phase.kind === "sending" || confirm.phase.kind === "unknown";
        const discardLocked = discard.phase.kind === "sending" || discard.phase.kind === "unknown";
        const canVoid =
          detail.status === "confirmed" &&
          detail.voidRecord === null &&
          session.permissions.includes("purchase.void");
        const voidState = !canVoid
          ? null
          : receivingSummary.isPending
            ? "loading"
            : receivingSummary.isError || receivingSummary.data === undefined
              ? "error"
              : receivingSummary.data.capabilities.voidPurchase.allowed ||
                  receivingSummary.data.capabilities.commercialCorrection.allowed
                ? "ready"
                : "blocked";
        const blockedCode =
          receivingSummary.data?.capabilities.voidPurchase.allowed ||
          receivingSummary.data?.capabilities.commercialCorrection.allowed
            ? null
            : (receivingSummary.data?.capabilities.commercialCorrection.reasonCode ??
              receivingSummary.data?.capabilities.voidPurchase.reasonCode ??
              null);
        return (
          <PurchaseDetailView
            purchase={detail}
            receipts={receipts.data ?? []}
            receivingSummary={receivingSummary.data?.lines ?? []}
            receiptsLoading={receipts.isPending}
            canCreateReplacement={session.permissions.includes("purchase.create")}
            canReverseReceipt={session.permissions.includes("receiving.reverse")}
            onReverseReceipt={setReverseTarget}
            {...(detail.status === "draft"
              ? {
                  draftActions: (
                    <PurchaseDraftActionsView
                      purchase={detail}
                      canUpdate={session.permissions.includes("purchase.update")}
                      canConfirm={session.permissions.includes("purchase.confirm")}
                      canDiscard={session.permissions.includes("purchase.discard")}
                      confirmLocked={confirmLocked}
                      discardLocked={discardLocked}
                      onConfirm={() =>
                        void confirm.submit(
                          { purchaseId: detail.id },
                          { expectedVersion: detail.version },
                        )
                      }
                      onDiscard={() =>
                        void discard.submit(
                          { purchaseId: detail.id, reason: "Không tiếp tục đơn nháp" },
                          { expectedVersion: detail.version },
                        )
                      }
                    />
                  ),
                }
              : {})}
            {...(detail.status === "confirmed" && detail.voidRecord === null
              ? {
                  receivingPanel: operationalProfile.isPending ? (
                    <PurchaseReceivingLoadingView />
                  ) : operationalProfile.data?.intakeMode === "inspected_arrival" ? (
                    <PurchaseInspectedIntakeView
                      purchase={detail}
                      arrivals={arrivals.data?.items ?? []}
                      loading={arrivals.isPending}
                      canRecord={session.permissions.includes("intake.record")}
                    />
                  ) : session.permissions.includes("receiving.record") ? (
                    <ReceivingCapturePanel
                      purchase={detail}
                      grades={qualityGrades.data?.items ?? []}
                      gradesLoading={qualityGrades.isPending}
                      quantities={receiptQuantities}
                      evidence={receiptEvidence}
                      qualityGradeRequired={
                        operationalProfile.data?.qualityGradeMode === "required"
                      }
                      locked={receiptLocked}
                      onQuantityChange={(key, value) =>
                        setReceiptQuantities((current) => ({ ...current, [key]: value }))
                      }
                      onEvidenceChange={setReceiptEvidence}
                      onSubmit={recordReceipt}
                      feedback={
                        <CommandOutcome
                          command={receipt}
                          attemptedAction="Ghi nhận hàng"
                          onReload={refresh}
                        />
                      }
                    />
                  ) : undefined,
                }
              : {})}
            {...(reverseTarget === null
              ? {}
              : {
                  reversalPanel: (
                    <ReceiptReversalPanel
                      locked={reverseLocked}
                      onCancel={() => setReverseTarget(null)}
                      onSubmit={(reason) =>
                        void reverse.submit({
                          reversalId: reversalId.current,
                          receiptId: reverseTarget,
                          reasonCode: "other",
                          reason,
                          evidenceReferences: [],
                        })
                      }
                      feedback={
                        <CommandOutcome
                          command={reverse}
                          attemptedAction="Hoàn tác phiếu nhận"
                          onReload={refresh}
                        />
                      }
                    />
                  ),
                })}
            {...(voidState === null
              ? {}
              : {
                  voidPanel: (
                    <PurchaseVoidView
                      state={voidState}
                      blockedCode={blockedCode}
                      blockedReason={blockedCode === null ? null : messageForCode(blockedCode)}
                      commercialCorrectionAllowed={
                        receivingSummary.data?.capabilities.commercialCorrection.allowed ?? false
                      }
                      voidReasonCode={voidReasonCode}
                      voidReason={voidReason}
                      voidEvidence={voidEvidence}
                      locked={voidLocked}
                      command={voidCommand}
                      onReasonCodeChange={(value) =>
                        setVoidReasonCode(value as PurchaseVoidReasonCode)
                      }
                      onReasonChange={setVoidReason}
                      onEvidenceChange={setVoidEvidence}
                      onSubmit={() =>
                        void voidCommand.submit({
                          purchaseVoidId: crypto.randomUUID() as PurchaseVoidId,
                          purchaseId: detail.id,
                          reasonCode: voidReasonCode,
                          reason: voidReason.trim(),
                          evidenceReferences: parseSourceEvidence(voidEvidence),
                        })
                      }
                      onReload={refresh}
                    />
                  ),
                })}
            feedback={
              <PurchaseCommandsFeedbackView
                confirm={confirm}
                discard={discard}
                onReload={refresh}
              />
            }
          />
        );
      }}
    </QueryStates>
  );
}

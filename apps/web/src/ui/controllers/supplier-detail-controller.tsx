"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  adjustSupplierAccountCommandSchema,
  recordSupplierPaymentCommandSchema,
  type Cursor,
  type Page,
  type SupplierAccountEntryDto,
  type SupplierId,
  type SupplierPaymentId,
  type SupplierPriceHistoryRowDto,
} from "@vuarau/domain-contracts";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import {
  SupplierMoneyActions,
  type SupplierAdjustmentReason,
  type SupplierPaymentDirection,
} from "@/ui/patterns/supplier/supplier-money-actions.tsx";
import { SupplierDetailView } from "@/ui/screens/supplier-detail-view.tsx";

export function SupplierDetailController() {
  const supplierId = useParams<{ supplierId: string }>().supplierId as SupplierId;
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const supplier = useQuery(trpc.supplier.get.queryOptions({ workspaceId, supplierId }));
  const balance = useQuery(trpc.supplier.balance.queryOptions({ workspaceId, supplierId }));
  const reconciliation = useQuery(
    trpc.supplier.reconciliation.queryOptions({ workspaceId, supplierId }),
  );
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [pages, setPages] = useState<readonly Page<SupplierAccountEntryDto>[]>([]);
  const timeline = useQuery(
    trpc.supplier.timeline.queryOptions({ workspaceId, supplierId, cursor, limit: 25 }),
  );
  useEffect(() => {
    if (timeline.data === undefined) return;
    setPages((current) => (cursor === null ? [timeline.data] : [...current, timeline.data]));
  }, [cursor, timeline.data]);

  const entries = pages.flatMap((page) => page.items);
  const nextCursor = pages.at(-1)?.nextCursor ?? null;
  const [priceHistoryCursor, setPriceHistoryCursor] = useState<Cursor | null>(null);
  const [priceHistoryPages, setPriceHistoryPages] = useState<
    readonly Page<SupplierPriceHistoryRowDto>[]
  >([]);
  const priceHistory = useQuery(
    trpc.supplier.priceHistory.queryOptions({
      workspaceId,
      supplierId,
      productId: null,
      cursor: priceHistoryCursor,
      limit: 25,
    }),
  );
  useEffect(() => {
    if (priceHistory.data === undefined) return;
    setPriceHistoryPages((current) =>
      priceHistoryCursor === null ? [priceHistory.data] : [...current, priceHistory.data],
    );
  }, [priceHistory.data, priceHistoryCursor]);
  const priceHistoryItems = priceHistoryPages.flatMap((page) => page.items);
  const priceHistoryNextCursor = priceHistoryPages.at(-1)?.nextCursor ?? null;
  const refresh = useCallback(() => {
    setCursor(null);
    setPages([]);
    setPriceHistoryCursor(null);
    setPriceHistoryPages([]);
    void Promise.all([
      supplier.refetch(),
      balance.refetch(),
      reconciliation.refetch(),
      timeline.refetch(),
      priceHistory.refetch(),
    ]);
  }, [
    balance.refetch,
    priceHistory.refetch,
    reconciliation.refetch,
    supplier.refetch,
    timeline.refetch,
  ]);

  const paymentId = useRef(crypto.randomUUID() as SupplierPaymentId).current;
  const adjustmentId = useRef(crypto.randomUUID()).current;
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentEvidence, setPaymentEvidence] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [direction, setDirection] = useState<SupplierPaymentDirection>("increase_payable");
  const [reasonCode, setReasonCode] = useState<SupplierAdjustmentReason>("opening_balance");
  const [reason, setReason] = useState("");
  const paymentMutation = useMutation(trpc.supplier.recordPayment.mutationOptions());
  const adjustmentMutation = useMutation(trpc.supplier.adjustAccount.mutationOptions());
  const payment = useContractCommand(
    recordSupplierPaymentCommandSchema,
    paymentMutation.mutateAsync,
  );
  const adjustment = useContractCommand(
    adjustSupplierAccountCommandSchema,
    adjustmentMutation.mutateAsync,
  );
  useEffect(() => {
    if (payment.result !== null || adjustment.result !== null) refresh();
  }, [adjustment.result, payment.result, refresh]);

  return (
    <SupplierDetailView
      query={supplier}
      balance={balance}
      reconciliation={reconciliation}
      timeline={timeline}
      entries={entries}
      nextCursor={nextCursor}
      timelineFetching={timeline.isFetching}
      priceHistory={priceHistory}
      priceHistoryItems={priceHistoryItems}
      priceHistoryNextCursor={priceHistoryNextCursor}
      priceHistoryFetching={priceHistory.isFetching}
      canUpdate={session.permissions.includes("supplier.update")}
      canCreatePurchase={session.permissions.includes("purchase.create")}
      canReadAccount={session.permissions.includes("supplier.account.read")}
      moneyActions={(record) => (
        <SupplierMoneyActions
          supplier={record}
          canRecordPayment={session.permissions.includes("supplier.payment.record")}
          canAdjust={session.permissions.includes("supplier.account.adjust")}
          paymentAmount={paymentAmount}
          paymentEvidence={paymentEvidence}
          adjustmentAmount={adjustmentAmount}
          direction={direction}
          reasonCode={reasonCode}
          reason={reason}
          payment={payment}
          adjustment={adjustment}
          onPaymentAmount={setPaymentAmount}
          onPaymentEvidence={setPaymentEvidence}
          onAdjustmentAmount={setAdjustmentAmount}
          onDirection={setDirection}
          onReasonCode={setReasonCode}
          onReason={setReason}
          onRecordPayment={() =>
            void payment.submit({
              supplierPaymentId: paymentId,
              supplierId,
              amount: { amountMinor: Math.round(Number(paymentAmount) * 1000), currency: "VND" },
              method: "cash",
              note: null,
              evidenceReferences: paymentEvidence
                .split(/[\n,]/)
                .map((reference) => reference.trim())
                .filter((reference) => reference.length > 0),
            })
          }
          onAdjust={() =>
            void adjustment.submit({
              adjustmentId,
              supplierId,
              amount: { amountMinor: Math.round(Number(adjustmentAmount) * 1000), currency: "VND" },
              direction,
              reasonCode,
              reason: reason.trim(),
            })
          }
          onChanged={refresh}
        />
      )}
      onRetry={() => void supplier.refetch()}
      onBalanceRetry={() => void balance.refetch()}
      onReconciliationRetry={() => void reconciliation.refetch()}
      onTimelineRetry={() => void timeline.refetch()}
      onPriceHistoryRetry={() => void priceHistory.refetch()}
      onLoadMore={() => {
        if (nextCursor !== null) setCursor(nextCursor);
      }}
      onPriceHistoryLoadMore={() => {
        if (priceHistoryNextCursor !== null) setPriceHistoryCursor(priceHistoryNextCursor);
      }}
    />
  );
}

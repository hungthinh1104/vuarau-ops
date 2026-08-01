"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  GoodsArrivalDto,
  PurchaseDto,
  PurchaseId,
  PurchaseReceiptDto,
  PurchaseReceiptId,
  PurchaseReceiptReversalId,
} from "@vuarau/domain-contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useCommand } from "@/api/use-command.ts";
import { messageForCode } from "@/ui/copy.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import {
  ReceivingCapturePanel,
  type ReceivingCaptureIntentLine,
} from "@/ui/patterns/receiving/receiving-capture-panel.tsx";
import { ReceiptReversalPanel } from "@/ui/patterns/receiving/receipt-reversal-panel.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { INPUT_CLASS } from "@/ui/primitives/field.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { PurchaseDetailView } from "@/ui/screens/purchase-detail-view.tsx";

export default function PurchaseDetailPage() {
  const purchaseId = useParams<{ purchaseId: string }>().purchaseId as PurchaseId;
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();

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

  const confirm = useCommand<unknown, PurchaseDto>((envelope) =>
    confirmMutation.mutateAsync(envelope as never),
  );
  const discard = useCommand<unknown, PurchaseDto>((envelope) =>
    discardMutation.mutateAsync(envelope as never),
  );
  const voidCommand = useCommand<unknown, PurchaseDto>((envelope) =>
    voidMutation.mutateAsync(envelope as never),
  );
  const receipt = useCommand<unknown, PurchaseReceiptDto>((envelope) =>
    receiptMutation.mutateAsync(envelope as never),
  );
  const reverse = useCommand<unknown, PurchaseReceiptDto>((envelope) =>
    reverseMutation.mutateAsync(envelope as never),
  );

  const receiptId = useRef(crypto.randomUUID() as PurchaseReceiptId);
  const reversalId = useRef(crypto.randomUUID() as PurchaseReceiptReversalId);
  const receiptLineIds = useRef(new Map<string, string>());
  const [receiptQuantities, setReceiptQuantities] = useState<Record<string, string>>({});
  const [reverseTarget, setReverseTarget] = useState<PurchaseReceiptId | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidReasonCode, setVoidReasonCode] = useState("other");

  const refresh = useCallback(() => {
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
  ]);

  useEffect(() => {
    if (confirm.result !== null || discard.result !== null || voidCommand.result !== null)
      refresh();
  }, [confirm.result, discard.result, refresh, voidCommand.result]);

  useEffect(() => {
    if (receipt.result === null) return;
    refresh();
    setReceiptQuantities({});
    receiptLineIds.current.clear();
    receiptId.current = crypto.randomUUID() as PurchaseReceiptId;
    receipt.reset();
  }, [receipt.result, receipt.reset, refresh]);

  useEffect(() => {
    if (reverse.result === null) return;
    refresh();
    setReverseTarget(null);
    reversalId.current = crypto.randomUUID() as PurchaseReceiptReversalId;
    reverse.reset();
  }, [refresh, reverse.reset, reverse.result]);

  function recordReceipt(lines: readonly ReceivingCaptureIntentLine[]): void {
    const commandLines = lines.map((line) => {
      const key = `${line.purchaseLineId}:${line.qualityGradeId}`;
      let receiptLineId = receiptLineIds.current.get(key);
      if (receiptLineId === undefined) {
        receiptLineId = crypto.randomUUID();
        receiptLineIds.current.set(key, receiptLineId);
      }
      return { receiptLineId, ...line };
    });
    void receipt.submit({
      receiptId: receiptId.current,
      purchaseId,
      lines: commandLines,
      note: null,
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

        return (
          <PurchaseDetailView
            purchase={detail}
            receipts={receipts.data ?? []}
            receivingSummary={receivingSummary.data?.lines ?? []}
            receiptsLoading={receipts.isPending}
            canCreateReplacement={session.permissions.includes("purchase.create")}
            canReverseReceipt={session.permissions.includes("receiving.reverse")}
            onReverseReceipt={setReverseTarget}
            draftActions={
              detail.status === "draft" ? (
                <div className="flex flex-wrap gap-3">
                  {session.permissions.includes("purchase.update") ? (
                    <a
                      href={`/purchases/${detail.id}/edit`}
                      className="touch-target inline-flex items-center rounded-button border border-border bg-surface px-4 text-label font-semibold"
                    >
                      Sửa đơn nháp
                    </a>
                  ) : null}
                  {session.permissions.includes("purchase.confirm") ? (
                    <Button
                      disabled={confirmLocked}
                      onClick={() =>
                        void confirm.submit(
                          { purchaseId: detail.id },
                          { expectedVersion: detail.version },
                        )
                      }
                    >
                      {confirmLocked ? "Đang xác nhận" : "Xác nhận đơn mua"}
                    </Button>
                  ) : null}
                  {session.permissions.includes("purchase.discard") ? (
                    <Button
                      tone="secondary"
                      disabled={discardLocked}
                      onClick={() =>
                        void discard.submit(
                          { purchaseId: detail.id, reason: "Không tiếp tục đơn nháp" },
                          { expectedVersion: detail.version },
                        )
                      }
                    >
                      Bỏ đơn nháp
                    </Button>
                  ) : null}
                </div>
              ) : undefined
            }
            receivingPanel={
              detail.status === "confirmed" && detail.voidRecord === null ? (
                operationalProfile.isPending ? (
                  <section className="rounded-card border border-border bg-surface p-4 text-body-sm text-ink-muted">
                    Đang xác định luồng nhận hàng của vựa…
                  </section>
                ) : operationalProfile.data?.intakeMode === "inspected_arrival" ? (
                  <InspectedIntakePanel
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
                    locked={receiptLocked}
                    onQuantityChange={(key, value) =>
                      setReceiptQuantities((current) => ({ ...current, [key]: value }))
                    }
                    onSubmit={recordReceipt}
                    feedback={
                      <CommandOutcome
                        command={receipt}
                        attemptedAction="Ghi nhận hàng"
                        onReload={refresh}
                      />
                    }
                  />
                ) : undefined
              ) : undefined
            }
            reversalPanel={
              reverseTarget === null ? undefined : (
                <ReceiptReversalPanel
                  locked={reverseLocked}
                  onCancel={() => setReverseTarget(null)}
                  onSubmit={(reason) =>
                    void reverse.submit({
                      reversalId: reversalId.current,
                      receiptId: reverseTarget,
                      reasonCode: "other",
                      reason,
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
              )
            }
            voidPanel={
              detail.status === "confirmed" &&
              detail.voidRecord === null &&
              session.permissions.includes("purchase.void") ? (
                receivingSummary.isPending ? (
                  <section className="rounded-card border border-border bg-surface p-4 text-body-sm text-ink-muted">
                    Đang kiểm tra hàng thực nhận trước khi cho phép hoàn tác đơn mua…
                  </section>
                ) : receivingSummary.isError || receivingSummary.data === undefined ? (
                  <section
                    role="alert"
                    className="rounded-card border border-danger/30 bg-surface p-4 text-body-sm"
                  >
                    Không kiểm tra được hàng đã nhận nên chưa thể hoàn tác đơn mua. Tải lại để tránh
                    đảo công nợ trong khi Goods Truth chưa rõ.
                  </section>
                ) : !receivingSummary.data.capabilities.voidPurchase.allowed ? (
                  <section
                    role="status"
                    className="rounded-card border border-warning/30 bg-warning-soft p-4 text-body-sm"
                  >
                    <p className="font-semibold">Chưa thể hoàn tác đơn mua này</p>
                    <p className="mt-1">
                      {messageForCode(
                        receivingSummary.data.capabilities.voidPurchase.reasonCode ??
                          "PURCHASE_HAS_ACTIVE_RECEIPTS",
                      )}
                    </p>
                    {receivingSummary.data.capabilities.voidPurchase.reasonCode ===
                    "PURCHASE_HAS_ACTIVE_RECEIPTS" ? (
                      <p className="mt-2 text-ink-muted">
                        Nếu phiếu nhận hàng tự nó ghi sai, hãy hoàn tác phiếu nhận đó. Nếu hàng đã
                        thực sự được nhận và chỉ đơn mua thương mại bị sai, dừng ở đây và xử lý theo
                        ASM-036; không tạo chuyển động kho giả để mở khóa nút này.
                      </p>
                    ) : null}
                  </section>
                ) : (
                  <section className="rounded-card border border-warning/40 p-4">
                    <h2 className="font-semibold">Hoàn tác đơn mua</h2>
                    <Select
                      label="Lý do"
                      value={voidReasonCode}
                      disabled={voidLocked}
                      onChange={(event) => setVoidReasonCode(event.target.value)}
                      options={[
                        { value: "wrong_supplier", label: "Sai nhà cung cấp" },
                        { value: "wrong_product", label: "Sai mặt hàng" },
                        { value: "wrong_quantity", label: "Sai số lượng" },
                        { value: "wrong_price", label: "Sai giá" },
                        { value: "duplicate", label: "Trùng" },
                        { value: "other", label: "Khác" },
                      ]}
                    />
                    <label className="grid gap-2 text-label">
                      Giải thích
                      <textarea
                        className={INPUT_CLASS}
                        disabled={voidLocked}
                        value={voidReason}
                        onChange={(event) => setVoidReason(event.target.value)}
                      />
                    </label>
                    <Button
                      tone="secondary"
                      disabled={voidReason.trim().length === 0 || voidLocked}
                      onClick={() =>
                        void voidCommand.submit({
                          purchaseVoidId: crypto.randomUUID(),
                          purchaseId: detail.id,
                          reasonCode: voidReasonCode,
                          reason: voidReason.trim(),
                        })
                      }
                    >
                      Hoàn tác đơn mua
                    </Button>
                    <CommandOutcome
                      command={voidCommand}
                      attemptedAction="Hoàn tác đơn mua"
                      onReload={refresh}
                    />
                  </section>
                )
              ) : undefined
            }
            feedback={
              <div className="grid gap-2">
                <CommandOutcome
                  command={confirm}
                  attemptedAction="Xác nhận đơn mua"
                  onReload={refresh}
                />
                <CommandOutcome command={discard} attemptedAction="Bỏ đơn mua" onReload={refresh} />
              </div>
            }
          />
        );
      }}
    </QueryStates>
  );
}

function InspectedIntakePanel({
  purchase,
  arrivals,
  loading,
  canRecord,
}: {
  purchase: PurchaseDto;
  arrivals: readonly GoodsArrivalDto[];
  loading: boolean;
  canRecord: boolean;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-subheading font-semibold">Hàng đến và kiểm định</h2>
          <p className="mt-1 max-w-2xl text-body-sm text-ink-muted">
            Luồng này chưa đưa hàng vào kho ngay. Ghi nhận hàng đến, kiểm số lượng/chất lượng, rồi
            quyết định phần chấp nhận, cách ly, từ chối hoặc hủy.
          </p>
        </div>
        {canRecord ? (
          <Link
            href={`/intake/new?purchaseId=${purchase.id}`}
            className="touch-target inline-flex items-center rounded-button bg-leaf px-4 text-label font-semibold text-white"
          >
            Ghi hàng đến
          </Link>
        ) : null}
      </div>
      {loading ? (
        <p className="mt-4 text-body-sm text-ink-muted">Đang tải các lần hàng đến…</p>
      ) : arrivals.length === 0 ? (
        <p className="mt-4 text-body-sm text-ink-muted">
          Chưa có lần hàng đến nào cho đơn mua này.
        </p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {arrivals.map((arrival) => (
            <li key={arrival.id}>
              <Link
                href={`/intake/${arrival.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-button border border-border px-3 py-2 hover:bg-canvas"
              >
                <span className="text-label font-semibold">
                  {arrival.vehicleReference ?? "Không ghi xe"} · {arrival.lines.length} mặt hàng
                </span>
                <span className="text-caption text-ink-muted">
                  {arrival.reversal === null ? "Đang hiệu lực" : "Đã hoàn tác"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

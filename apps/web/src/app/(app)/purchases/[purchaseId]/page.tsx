"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  PurchaseDto,
  PurchaseId,
  PurchaseReceiptDto,
  PurchaseReceiptId,
  PurchaseReceiptReversalId,
  PurchaseReceivingSummaryDto,
} from "@vuarau/domain-contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "../../../../api/session-gate.tsx";
import { useTRPC } from "../../../../api/providers.tsx";
import { useCommand } from "../../../../api/use-command.ts";
import { formatInstant, formatMoney, formatQuantity } from "../../../../ui/format.ts";
import { CommandOutcome } from "../../../../ui/patterns/command-outcome.tsx";
import { QueryStates } from "../../../../ui/patterns/query-states.tsx";
import { Badge } from "../../../../ui/primitives/badge.tsx";
import { Button } from "../../../../ui/primitives/button.tsx";
import { INPUT_CLASS } from "../../../../ui/primitives/field.tsx";
import { Select } from "../../../../ui/primitives/select.tsx";

export default function PurchaseDetailPage() {
  const purchaseId = useParams<{ purchaseId: string }>().purchaseId as PurchaseId;
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const purchase = useQuery(trpc.purchase.get.queryOptions({ workspaceId, purchaseId }));
  const receipts = useQuery(
    trpc.receiving.listForPurchase.queryOptions({ workspaceId, purchaseId }),
  );
  const receivingSummary = useQuery(
    trpc.receiving.summaryForPurchase.queryOptions({ workspaceId, purchaseId }),
  );
  const refresh = useCallback(() => {
    void Promise.all([purchase.refetch(), receipts.refetch(), receivingSummary.refetch()]);
  }, [purchase, receipts, receivingSummary]);
  return (
    <QueryStates
      query={purchase}
      loadingLabel="Đang tải đơn mua"
      onRetry={() => void purchase.refetch()}
    >
      {(detail) => (
        <PurchaseDetail
          purchase={detail}
          receipts={receipts.data ?? []}
          receivingSummary={receivingSummary.data?.lines ?? []}
          receiptsLoading={receipts.isPending}
          onChanged={refresh}
        />
      )}
    </QueryStates>
  );
}

function PurchaseDetail(props: {
  purchase: PurchaseDto;
  receipts: readonly PurchaseReceiptDto[];
  receivingSummary: PurchaseReceivingSummaryDto["lines"];
  receiptsLoading: boolean;
  onChanged: () => void;
}) {
  const { session, workspaceId } = useSession();
  const trpc = useTRPC();
  const confirmMutation = useMutation(trpc.purchase.confirm.mutationOptions());
  const discardMutation = useMutation(trpc.purchase.discardDraft.mutationOptions());
  const voidMutation = useMutation(trpc.purchase.void.mutationOptions());
  const receiptMutation = useMutation(trpc.receiving.record.mutationOptions());
  const reverseMutation = useMutation(trpc.receiving.reverse.mutationOptions());
  const qualityGrades = useQuery(
    trpc.quality.list.queryOptions({
      workspaceId,
      query: "",
      isActive: true,
      cursor: null,
      limit: 100,
    }),
  );
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
  const [receiptId, setReceiptId] = useState(() => crypto.randomUUID() as PurchaseReceiptId);
  const [reversalId, setReversalId] = useState(
    () => crypto.randomUUID() as PurchaseReceiptReversalId,
  );
  const [reason, setReason] = useState("");
  const [reasonCode, setReasonCode] = useState("other");
  const [receiptQuantities, setReceiptQuantities] = useState<Record<string, string>>({});
  const [reverseTarget, setReverseTarget] = useState<PurchaseReceiptId | null>(null);
  const receiptLineIds = useRef(new Map<string, string>());
  useEffect(() => {
    if (confirm.result !== null || discard.result !== null || voidCommand.result !== null)
      props.onChanged();
  }, [confirm.result, discard.result, props, voidCommand.result]);
  useEffect(() => {
    if (receipt.result === null) return;
    props.onChanged();
    setReceiptQuantities({});
    receiptLineIds.current.clear();
    setReceiptId(crypto.randomUUID() as PurchaseReceiptId);
    receipt.reset();
  }, [props, receipt]);
  useEffect(() => {
    if (reverse.result === null) return;
    props.onChanged();
    setReverseTarget(null);
    setReason("");
    setReversalId(crypto.randomUUID() as PurchaseReceiptReversalId);
    reverse.reset();
  }, [props, reverse]);
  const purchase = props.purchase;
  const receiptLines = purchase.lines.flatMap((line) =>
    (qualityGrades.data?.items ?? []).flatMap((grade) => {
      const key = `${line.lineId}:${grade.id}`;
      const value = Math.round(Number(receiptQuantities[key] ?? "0") * 1000);
      if (value <= 0 || !Number.isSafeInteger(value)) return [];
      let receiptLineId = receiptLineIds.current.get(key);
      if (receiptLineId === undefined) {
        receiptLineId = crypto.randomUUID();
        receiptLineIds.current.set(key, receiptLineId);
      }
      return [
        {
          receiptLineId,
          purchaseLineId: line.lineId,
          productId: line.productId,
          qualityGradeId: grade.id,
          qualityGradeName: grade.name,
          quantity: { valueScaled: value, unit: line.quantity.unit },
        },
      ];
    }),
  );
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-heading font-bold">
            Đơn mua {purchase.id.slice(0, 8).toUpperCase()}
          </h1>
          <p className="text-caption text-ink-muted">
            {formatInstant(purchase.transactionTime)}
            {purchase.recordedAt === purchase.transactionTime
              ? ""
              : ` · ghi ${formatInstant(purchase.recordedAt)}`}
          </p>
        </div>
        <Badge
          tone={
            purchase.voidRecord !== null
              ? "warning"
              : purchase.status === "confirmed"
                ? "positive"
                : "neutral"
          }
        >
          {purchase.voidRecord !== null ? "Đã hoàn tác" : purchase.status}
        </Badge>
      </header>
      <Link href={`/suppliers/${purchase.supplierId}`} className="text-info underline">
        Mở nhà cung cấp
      </Link>
      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="text-subheading font-semibold">Hàng mua</h2>
        <ul className="divide-y divide-border">
          {purchase.lines.map((line) => (
            <li key={line.lineId} className="grid gap-1 py-3 md:grid-cols-3">
              <Link
                href={`/products/${line.productId}`}
                className="font-semibold text-info underline"
              >
                {line.productName}
              </Link>
              <span>
                {formatQuantity(line.quantity)} × {formatMoney(line.unitPrice)}
              </span>
              <strong className="md:text-right">{formatMoney(line.lineTotal)}</strong>
            </li>
          ))}
        </ul>
        <p className="text-right text-subheading font-bold">
          Tổng {formatMoney(purchase.totalAmount)}
        </p>
      </section>
      {purchase.replacesPurchaseId === null ? null : (
        <p>
          Thay thế{" "}
          <Link href={`/purchases/${purchase.replacesPurchaseId}`} className="text-info underline">
            đơn mua trước
          </Link>
          .
        </p>
      )}
      {purchase.voidRecord === null ? null : (
        <section className="rounded-card border border-warning/40 bg-warning-soft p-4">
          <h2 className="font-semibold">Đơn mua đã được hoàn tác</h2>
          <p>
            {purchase.voidRecord.reasonCode}: {purchase.voidRecord.reason}
          </p>
          <p>{formatMoney(purchase.voidRecord.amount)}</p>
          {session.permissions.includes("purchase.create") ? (
            <Link
              href={`/purchases/new?replacesPurchaseId=${purchase.id}`}
              className="text-info underline"
            >
              Tạo đơn mua thay thế
            </Link>
          ) : null}
        </section>
      )}
      {purchase.status === "draft" ? (
        <div className="flex flex-wrap gap-3">
          {session.permissions.includes("purchase.update") ? (
            <Link
              href={`/purchases/${purchase.id}/edit`}
              className="touch-target inline-flex items-center rounded-button border border-border bg-surface px-4 text-label font-semibold"
            >
              Sửa đơn nháp
            </Link>
          ) : null}
          {session.permissions.includes("purchase.confirm") ? (
            <Button
              onClick={() =>
                void confirm.submit(
                  { purchaseId: purchase.id },
                  { expectedVersion: purchase.version },
                )
              }
            >
              Xác nhận đơn mua
            </Button>
          ) : null}
          {session.permissions.includes("purchase.discard") ? (
            <Button
              tone="secondary"
              onClick={() =>
                void discard.submit(
                  { purchaseId: purchase.id, reason: "Không tiếp tục đơn nháp" },
                  { expectedVersion: purchase.version },
                )
              }
            >
              Bỏ đơn nháp
            </Button>
          ) : null}
        </div>
      ) : null}
      {purchase.status === "confirmed" &&
      purchase.voidRecord === null &&
      session.permissions.includes("receiving.record") ? (
        <section className="rounded-card border border-border bg-surface p-4">
          <h2 className="text-subheading font-semibold">Ghi nhận hàng về</h2>
          {purchase.lines.map((line) => (
            <fieldset
              key={line.lineId}
              className="grid gap-2 rounded-card border border-border p-3"
            >
              <legend className="px-1 text-label font-semibold">
                {line.productName} ({line.quantity.unit})
              </legend>
              {(qualityGrades.data?.items ?? []).map((grade) => {
                const key = `${line.lineId}:${grade.id}`;
                return (
                  <label key={key} className="text-label">
                    {grade.name}
                    <input
                      className={INPUT_CLASS}
                      inputMode="decimal"
                      value={receiptQuantities[key] ?? ""}
                      onChange={(event) =>
                        setReceiptQuantities((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  </label>
                );
              })}
            </fieldset>
          ))}
          {qualityGrades.isPending ? (
            <p>Đang tải phân hạng chất lượng…</p>
          ) : qualityGrades.data?.items.length === 0 ? (
            <p role="alert">Chưa có phân hạng chất lượng để ghi nhận hàng.</p>
          ) : null}
          <Button
            disabled={receiptLines.length === 0 || receipt.phase.kind === "sending"}
            onClick={() =>
              void receipt.submit({
                receiptId,
                purchaseId: purchase.id,
                lines: receiptLines,
                note: null,
              })
            }
          >
            Ghi phiếu nhận hàng
          </Button>
          <CommandOutcome
            command={receipt}
            attemptedAction="Ghi nhận hàng"
            onReload={props.onChanged}
          />
        </section>
      ) : null}
      <section className="flex flex-col gap-2">
        <h2 className="text-subheading font-semibold">Phiếu nhận hàng</h2>
        {props.receivingSummary.length === 0 ? null : (
          <ul className="rounded-card border border-border bg-surface p-3">
            {props.receivingSummary.map((line) => (
              <li key={line.purchaseLineId}>
                <strong>{line.productName}</strong>: đặt {formatQuantity(line.ordered)} · đã nhận{" "}
                {formatQuantity(line.received)} · còn lại {formatQuantity(line.remaining)}
              </li>
            ))}
          </ul>
        )}
        {props.receiptsLoading ? (
          <p>Đang tải…</p>
        ) : props.receipts.length === 0 ? (
          <p>Chưa ghi nhận hàng về.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {props.receipts.map((item) => (
              <li key={item.id} className="rounded-card border border-border bg-surface p-3">
                <Link href={`/receipts/${item.id}`} className="font-semibold text-info underline">
                  Phiếu {item.id.slice(0, 8).toUpperCase()}
                </Link>
                <p>{item.lines.map((line) => formatQuantity(line.quantity)).join(", ")}</p>
                {item.reversal === null ? (
                  session.permissions.includes("receiving.reverse") ? (
                    <Button tone="secondary" onClick={() => setReverseTarget(item.id)}>
                      Hoàn tác phiếu nhận
                    </Button>
                  ) : null
                ) : (
                  <Badge tone="warning">Đã hoàn tác</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {reverseTarget === null ? null : (
        <section className="rounded-card border border-warning/40 p-4">
          <h2 className="font-semibold">Hoàn tác phiếu nhận</h2>
          <label className="text-label">
            Giải thích
            <textarea
              className={INPUT_CLASS}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <Button
            tone="secondary"
            disabled={reason.trim().length === 0}
            onClick={() =>
              void reverse.submit({
                reversalId,
                receiptId: reverseTarget,
                reasonCode: "other",
                reason: reason.trim(),
              })
            }
          >
            Xác nhận hoàn tác
          </Button>
          <CommandOutcome
            command={reverse}
            attemptedAction="Hoàn tác phiếu nhận"
            onReload={props.onChanged}
          />
        </section>
      )}
      {purchase.status === "confirmed" &&
      purchase.voidRecord === null &&
      session.permissions.includes("purchase.void") ? (
        <section className="rounded-card border border-warning/40 p-4">
          <h2 className="font-semibold">Hoàn tác đơn mua</h2>
          <Select
            label="Lý do"
            value={reasonCode}
            onChange={(event) => setReasonCode(event.target.value)}
            options={[
              { value: "wrong_supplier", label: "Sai nhà cung cấp" },
              { value: "wrong_product", label: "Sai mặt hàng" },
              { value: "wrong_quantity", label: "Sai số lượng" },
              { value: "wrong_price", label: "Sai giá" },
              { value: "duplicate", label: "Trùng" },
              { value: "other", label: "Khác" },
            ]}
          />
          <label className="text-label">
            Giải thích
            <textarea
              className={INPUT_CLASS}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <Button
            tone="secondary"
            disabled={reason.trim().length === 0 || voidCommand.phase.kind === "sending"}
            onClick={() =>
              void voidCommand.submit({
                purchaseVoidId: crypto.randomUUID(),
                purchaseId: purchase.id,
                reasonCode,
                reason: reason.trim(),
              })
            }
          >
            Hoàn tác đơn mua
          </Button>
          <CommandOutcome
            command={voidCommand}
            attemptedAction="Hoàn tác đơn mua"
            onReload={props.onChanged}
          />
        </section>
      ) : null}
      <CommandOutcome
        command={confirm}
        attemptedAction="Xác nhận đơn mua"
        onReload={props.onChanged}
      />
      <CommandOutcome command={discard} attemptedAction="Bỏ đơn mua" onReload={props.onChanged} />
      <Link href="/purchases" className="text-info underline">
        ← Đơn mua
      </Link>
    </div>
  );
}

"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  DeliveryDto,
  DeliveryId,
  DeliveryReturnId,
  DocumentDto,
  DocumentId,
} from "@vuarau/domain-contracts";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "../../../../api/session-gate.tsx";
import { useTRPC } from "../../../../api/providers.tsx";
import { useCommand } from "../../../../api/use-command.ts";
import { formatInstant, formatQuantity } from "../../../../ui/format.ts";
import { CommandOutcome } from "../../../../ui/patterns/command-outcome.tsx";
import { QueryStates } from "../../../../ui/patterns/query-states.tsx";
import { Badge } from "../../../../ui/primitives/badge.tsx";
import { Button } from "../../../../ui/primitives/button.tsx";
import { INPUT_CLASS } from "../../../../ui/primitives/field.tsx";

export default function DeliveryDetailPage() {
  const deliveryId = useParams<{ deliveryId: string }>().deliveryId as DeliveryId;
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const query = useQuery(trpc.delivery.get.queryOptions({ workspaceId, deliveryId }));
  const dispatchMutation = useMutation(trpc.delivery.dispatch.mutationOptions());
  const deliveredMutation = useMutation(trpc.delivery.markDelivered.mutationOptions());
  const returnMutation = useMutation(trpc.delivery.recordReturn.mutationOptions());
  const documentMutation = useMutation(trpc.document.generate.mutationOptions());
  const dispatch = useCommand<unknown, DeliveryDto>((envelope) =>
    dispatchMutation.mutateAsync(envelope as never),
  );
  const delivered = useCommand<unknown, DeliveryDto>((envelope) =>
    deliveredMutation.mutateAsync(envelope as never),
  );
  const returned = useCommand<unknown, DeliveryDto>((envelope) =>
    returnMutation.mutateAsync(envelope as never),
  );
  const generated = useCommand<unknown, DocumentDto>((envelope) =>
    documentMutation.mutateAsync(envelope as never),
  );
  const [returnId] = useState(() => crypto.randomUUID() as DeliveryReturnId);
  const [documentId] = useState(() => crypto.randomUUID() as DocumentId);
  const [returnReason, setReturnReason] = useState("");
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});

  useEffect(() => {
    if (dispatch.result !== null || delivered.result !== null || returned.result !== null)
      void query.refetch();
  }, [delivered.result, dispatch.result, query, returned.result]);
  useEffect(() => {
    if (generated.result !== null) router.push(`/documents/${generated.result.id}`);
  }, [generated.result, router]);

  return (
    <QueryStates
      query={query}
      loadingLabel="Đang tải phiếu giao"
      onRetry={() => void query.refetch()}
    >
      {(delivery) => (
        <div className="flex max-w-4xl flex-col gap-5">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-heading font-bold">
                Phiếu giao {delivery.id.slice(0, 8).toUpperCase()}
              </h1>
              <p className="text-caption text-ink-muted">
                {formatInstant(delivery.transactionTime)}
              </p>
            </div>
            <Badge tone={delivery.status === "delivered" ? "positive" : "neutral"}>
              {delivery.status}
            </Badge>
          </header>
          <Link href={`/sales/${delivery.saleId}`} className="text-info underline">
            Mở đơn bán nguồn
          </Link>
          <section className="rounded-card border border-border bg-surface p-4">
            <h2 className="font-semibold">Hàng giao</h2>
            <ul className="divide-y divide-border">
              {delivery.lines.map((line) => (
                <li key={line.deliveryLineId} className="grid gap-2 py-3 md:grid-cols-3">
                  <Link
                    href={`/products/${line.productId}/inventory`}
                    className="text-info underline"
                  >
                    {line.productName}
                  </Link>
                  <span>Giao {formatQuantity(line.quantity)}</span>
                  <span>Trả {formatQuantity(line.returnedQuantity)}</span>
                </li>
              ))}
            </ul>
          </section>
          <div className="flex flex-wrap gap-3">
            {delivery.status === "draft" && session.permissions.includes("delivery.dispatch") ? (
              <Button
                disabled={dispatch.phase.kind === "sending"}
                onClick={() =>
                  void dispatch.submit({ deliveryId }, { expectedVersion: delivery.version })
                }
              >
                Xuất kho
              </Button>
            ) : null}
            {delivery.status === "dispatched" &&
            session.permissions.includes("delivery.complete") ? (
              <Button
                onClick={() =>
                  void delivered.submit({ deliveryId }, { expectedVersion: delivery.version })
                }
              >
                Xác nhận đã giao
              </Button>
            ) : null}
            {session.permissions.includes("document.generate") ? (
              <Button
                tone="secondary"
                onClick={() =>
                  void generated.submit({
                    documentId,
                    documentType: "delivery_note",
                    sourceType: "delivery",
                    sourceId: delivery.id,
                  })
                }
              >
                Tạo chứng từ giao hàng
              </Button>
            ) : null}
          </div>
          {["dispatched", "delivered"].includes(delivery.status) &&
          session.permissions.includes("delivery.return") ? (
            <section className="rounded-card border border-border bg-surface p-4">
              <h2 className="font-semibold">Ghi nhận hàng trả</h2>
              {delivery.lines.map((line) => (
                <label key={line.deliveryLineId} className="grid gap-2 py-2">
                  <span>{line.productName}</span>
                  <input
                    className={INPUT_CLASS}
                    inputMode="decimal"
                    aria-label={`Số lượng trả ${line.productName}`}
                    value={returnQuantities[line.deliveryLineId] ?? ""}
                    onChange={(event) =>
                      setReturnQuantities((current) => ({
                        ...current,
                        [line.deliveryLineId]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
              <label className="grid gap-2 py-2">
                <span>Lý do</span>
                <textarea
                  className={INPUT_CLASS}
                  value={returnReason}
                  onChange={(event) => setReturnReason(event.target.value)}
                />
              </label>
              <Button
                onClick={() => {
                  const lines = delivery.lines.flatMap((line) => {
                    const valueScaled = Math.round(
                      Number(returnQuantities[line.deliveryLineId] ?? "0") * 1000,
                    );
                    return valueScaled > 0 && Number.isSafeInteger(valueScaled)
                      ? [
                          {
                            deliveryLineId: line.deliveryLineId,
                            quantity: { valueScaled, unit: line.quantity.unit },
                          },
                        ]
                      : [];
                  });
                  void returned.submit({
                    returnId,
                    deliveryId,
                    lines,
                    reason: returnReason,
                  });
                }}
              >
                Ghi hàng trả
              </Button>
            </section>
          ) : null}
          <CommandOutcome
            command={dispatch}
            attemptedAction="Xuất kho"
            onReload={() => void query.refetch()}
          />
          <CommandOutcome
            command={delivered}
            attemptedAction="Xác nhận đã giao"
            onReload={() => void query.refetch()}
          />
          <CommandOutcome
            command={returned}
            attemptedAction="Ghi hàng trả"
            onReload={() => void query.refetch()}
          />
          <CommandOutcome
            command={generated}
            attemptedAction="Tạo chứng từ giao hàng"
            onReload={() => void query.refetch()}
          />
        </div>
      )}
    </QueryStates>
  );
}

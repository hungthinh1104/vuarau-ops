"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { DeliveryDto, DeliveryId, DeliveryLineId, SaleId } from "@vuarau/domain-contracts";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "../../../../../../api/session-gate.tsx";
import { useTRPC } from "../../../../../../api/providers.tsx";
import { useCommand } from "../../../../../../api/use-command.ts";
import { CommandOutcome } from "../../../../../../ui/patterns/command-outcome.tsx";
import { QueryStates } from "../../../../../../ui/patterns/query-states.tsx";
import { Button } from "../../../../../../ui/primitives/button.tsx";
import { INPUT_CLASS } from "../../../../../../ui/primitives/field.tsx";
import { formatQuantity } from "../../../../../../ui/format.ts";

export default function NewDeliveryPage() {
  const saleId = useParams<{ saleId: string }>().saleId as SaleId;
  const router = useRouter();
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const sale = useQuery(trpc.sale.detail.queryOptions({ workspaceId, saleId }));
  const fulfilment = useQuery(trpc.delivery.fulfilment.queryOptions({ workspaceId, saleId }));
  const mutation = useMutation(trpc.delivery.createDraft.mutationOptions());
  const command = useCommand<unknown, DeliveryDto>((envelope) =>
    mutation.mutateAsync(envelope as never),
  );
  const [deliveryId] = useState(() => crypto.randomUUID() as DeliveryId);
  const lineIds = useRef(new Map<string, DeliveryLineId>());
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  useEffect(() => {
    if (command.result !== null) router.replace(`/deliveries/${command.result.id}`);
  }, [command.result, router]);

  if (!session.permissions.includes("delivery.create"))
    return <p role="alert">Bạn không có quyền tạo phiếu giao hàng.</p>;

  return (
    <QueryStates query={sale} loadingLabel="Đang tải đơn bán" onRetry={() => void sale.refetch()}>
      {(detail) => (
        <div className="flex max-w-3xl flex-col gap-5">
          <h1 className="text-heading font-bold">Tạo phiếu giao · {detail.displayReference}</h1>
          <section className="rounded-card border border-border bg-surface p-4">
            <h2 className="font-semibold">Số lượng xuất kho</h2>
            {fulfilment.data?.lines.map((summary) => {
              const saleLine = detail.sale.lines.find((line) => line.lineId === summary.saleLineId);
              if (saleLine?.productId == null) return null;
              return (
                <label key={summary.saleLineId} className="grid gap-2 border-b border-border py-3">
                  <span>
                    {summary.productName} · còn {formatQuantity(summary.remaining)}
                  </span>
                  <input
                    className={INPUT_CLASS}
                    inputMode="decimal"
                    value={quantities[summary.saleLineId] ?? ""}
                    onChange={(event) =>
                      setQuantities((current) => ({
                        ...current,
                        [summary.saleLineId]: event.target.value,
                      }))
                    }
                    aria-label={`Số lượng giao ${summary.productName}`}
                  />
                </label>
              );
            })}
            <label className="mt-3 grid gap-2">
              <span>Ghi chú</span>
              <textarea
                className={INPUT_CLASS}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          </section>
          <Button
            disabled={command.phase.kind === "sending" || fulfilment.data === undefined}
            onClick={() => {
              const lines = detail.sale.lines.flatMap((line) => {
                if (line.productId === null) return [];
                const valueScaled = Math.round(Number(quantities[line.lineId] ?? "0") * 1000);
                if (!Number.isSafeInteger(valueScaled) || valueScaled <= 0) return [];
                return [
                  {
                    deliveryLineId:
                      lineIds.current.get(line.lineId) ??
                      (() => {
                        const id = crypto.randomUUID() as DeliveryLineId;
                        lineIds.current.set(line.lineId, id);
                        return id;
                      })(),
                    saleLineId: line.lineId,
                    productId: line.productId,
                    quantity: { valueScaled, unit: line.quantity.unit },
                  },
                ];
              });
              void command.submit({ deliveryId, saleId, lines, note: note.trim() || null });
            }}
          >
            Lưu phiếu giao
          </Button>
          <CommandOutcome
            command={command}
            attemptedAction="Lưu phiếu giao"
            onReload={() => void sale.refetch()}
          />
        </div>
      )}
    </QueryStates>
  );
}

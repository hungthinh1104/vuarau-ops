"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createDeliveryDraftCommandSchema,
  type DeliveryId,
  type DeliveryLineId,
  type SaleId,
} from "@vuarau/domain-contracts";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { NewDeliveryPermissionView, NewDeliveryView } from "@/ui/screens/new-delivery-view.tsx";

export function NewDeliveryController() {
  const saleId = useParams<{ saleId: string }>().saleId as SaleId;
  const router = useRouter();
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const sale = useQuery(trpc.sale.detail.queryOptions({ workspaceId, saleId }));
  const fulfilment = useQuery(trpc.delivery.fulfilment.queryOptions({ workspaceId, saleId }));
  const mutation = useMutation(trpc.delivery.createDraft.mutationOptions());
  const command = useContractCommand(createDeliveryDraftCommandSchema, mutation.mutateAsync);
  const [deliveryId] = useState(() => crypto.randomUUID() as DeliveryId);
  const lineIds = useRef(new Map<string, DeliveryLineId>());
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  useEffect(() => {
    if (command.result !== null) router.replace(`/deliveries/${command.result.id}`);
  }, [command.result, router]);

  if (!session.permissions.includes("delivery.create")) return <NewDeliveryPermissionView />;

  return (
    <QueryStates query={sale} loadingLabel="Đang tải đơn bán" onRetry={() => void sale.refetch()}>
      {(detail) => (
        <NewDeliveryView
          saleId={saleId}
          detail={detail}
          fulfilment={fulfilment.data}
          quantities={quantities}
          note={note}
          command={command}
          onQuantityChange={(lineId, value) =>
            setQuantities((current) => ({ ...current, [lineId]: value }))
          }
          onNoteChange={setNote}
          onSubmit={() => {
            const lines = detail.sale.lines.flatMap((line) => {
              const summary = fulfilment.data?.lines.find(
                (candidate) => candidate.saleLineId === line.lineId,
              );
              if (
                line.productId === null ||
                line.qualityGradeId === null ||
                summary === undefined ||
                summary.fulfilmentState === "attention" ||
                summary.remaining.valueScaled === 0
              )
                return [];
              const valueScaled = Math.round(
                Number(quantities[line.lineId] ?? String(summary.remaining.valueScaled / 1_000)) *
                  1_000,
              );
              if (
                !Number.isSafeInteger(valueScaled) ||
                valueScaled <= 0 ||
                valueScaled > summary.remaining.valueScaled
              )
                return [];
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
                  qualityGradeId: line.qualityGradeId,
                  quantity: { valueScaled, unit: line.quantity.unit },
                },
              ];
            });
            void command.submit({ deliveryId, saleId, lines, note: note.trim() || null });
          }}
          onReload={() => void sale.refetch()}
        />
      )}
    </QueryStates>
  );
}

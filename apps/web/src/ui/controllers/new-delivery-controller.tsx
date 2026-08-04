"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createDeliveryDraftCommandSchema,
  dispatchDeliveryCommandSchema,
  markDeliveryDeliveredCommandSchema,
  type DeliveryId,
  type DeliveryLineId,
  type SaleId,
} from "@vuarau/domain-contracts";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { useWorkflowCacheEffects } from "@/api/workflow-cache.ts";
import { buildDeliveryDraftLines } from "@/ui/domain/delivery-form.ts";
import { parseSourceEvidence } from "@/ui/domain/source-evidence.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PartialCompletion } from "@/ui/patterns/feedback/partial-completion.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { NewDeliveryPermissionView, NewDeliveryView } from "@/ui/screens/new-delivery-view.tsx";

export function NewDeliveryController() {
  const saleId = useParams<{ saleId: string }>().saleId as SaleId;
  const router = useRouter();
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const cache = useWorkflowCacheEffects();
  const sale = useQuery(trpc.sale.detail.queryOptions({ workspaceId, saleId }));
  const fulfilment = useQuery(trpc.delivery.fulfilment.queryOptions({ workspaceId, saleId }));
  const createMutation = useMutation(trpc.delivery.createDraft.mutationOptions());
  const dispatchMutation = useMutation(trpc.delivery.dispatch.mutationOptions());
  const deliveredMutation = useMutation(trpc.delivery.markDelivered.mutationOptions());
  const command = useContractCommand(createDeliveryDraftCommandSchema, createMutation.mutateAsync);
  const dispatch = useContractCommand(dispatchDeliveryCommandSchema, dispatchMutation.mutateAsync);
  const delivered = useContractCommand(
    markDeliveryDeliveredCommandSchema,
    deliveredMutation.mutateAsync,
  );
  const [deliveryId] = useState(() => crypto.randomUUID() as DeliveryId);
  const lineIds = useRef(new Map<string, DeliveryLineId>());
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");
  const [partialCompletion, setPartialCompletion] = useState<{
    readonly deliveryId: DeliveryId;
    readonly message: string;
  } | null>(null);

  if (!session.permissions.includes("delivery.create")) return <NewDeliveryPermissionView />;

  return (
    <QueryStates query={sale} loadingLabel="Đang tải đơn bán" onRetry={() => void sale.refetch()}>
      {(detail) => (
        <QueryStates
          query={fulfilment}
          loadingLabel="Đang kiểm tra hàng còn phải giao"
          attemptedAction="Kiểm tra hàng còn phải giao"
          onRetry={() => void fulfilment.refetch()}
        >
          {(fulfilmentDetail) => (
            <NewDeliveryView
              saleId={saleId}
              detail={detail}
              fulfilment={fulfilmentDetail}
              quantities={quantities}
              note={note}
              evidence={evidence}
              command={command}
              dispatchCommand={dispatch}
              deliveredCommand={delivered}
              partialCompletion={partialCompletion}
              onQuantityChange={(lineId, value) =>
                setQuantities((current) => ({ ...current, [lineId]: value }))
              }
              onNoteChange={setNote}
              onEvidenceChange={setEvidence}
              onSubmit={(action) => {
                setPartialCompletion(null);
                const lines = buildDeliveryDraftLines(
                  detail,
                  fulfilmentDetail,
                  action === "deliver-all" ? {} : quantities,
                  (lineId) => {
                    const existing = lineIds.current.get(lineId);
                    if (existing !== undefined) return existing;
                    const created = crypto.randomUUID() as DeliveryLineId;
                    lineIds.current.set(lineId, created);
                    return created;
                  },
                );
                // The command contract requires at least one line. This guard
                // keeps an empty selection from ever reaching the transport.
                if (lines.length === 0) return;
                void (async () => {
                  const created = await command.submit({
                    deliveryId,
                    saleId,
                    lines,
                    note: note.trim() || null,
                    evidenceReferences: parseSourceEvidence(evidence),
                  });
                  if (created === null) return;
                  await cache.deliveryChanged(workspaceId, created);
                  if (action === "draft") {
                    router.replace(`/deliveries/${created.id}`);
                    return;
                  }
                  const dispatched = await dispatch.submit(
                    { deliveryId: created.id },
                    { expectedVersion: created.version },
                  );
                  if (dispatched === null) {
                    setPartialCompletion({
                      deliveryId: created.id,
                      message:
                        "Phiếu giao đã được lưu nhưng chưa xuất hàng. Kiểm tra và tiếp tục từ phiếu giao.",
                    });
                    return;
                  }
                  await cache.deliveryChanged(workspaceId, dispatched);
                  const completed = await delivered.submit(
                    { deliveryId: dispatched.id },
                    { expectedVersion: dispatched.version },
                  );
                  if (completed === null) {
                    setPartialCompletion({
                      deliveryId: created.id,
                      message:
                        "Hàng đã xuất kho nhưng chưa xác nhận giao khách. Kiểm tra và tiếp tục từ phiếu giao.",
                    });
                  }
                  if (completed !== null) await cache.deliveryChanged(workspaceId, completed);
                  if (completed !== null) router.replace(`/deliveries/${created.id}`);
                })();
              }}
              onReload={() => void Promise.all([sale.refetch(), fulfilment.refetch()])}
              feedback={
                <>
                  <CommandOutcome
                    command={command}
                    attemptedAction="Lưu phiếu giao"
                    suppressSuccessToast
                    onReload={() => void Promise.all([sale.refetch(), fulfilment.refetch()])}
                  />
                  <CommandOutcome
                    command={dispatch}
                    attemptedAction="Xuất hàng"
                    suppressSuccessToast
                    onReload={() => void fulfilment.refetch()}
                  />
                  <CommandOutcome
                    command={delivered}
                    attemptedAction="Xác nhận giao khách"
                    suppressSuccessToast
                    onReload={() => void fulfilment.refetch()}
                  />
                  {partialCompletion === null ? null : (
                    <PartialCompletion
                      href={`/deliveries/${partialCompletion.deliveryId}`}
                      message={partialCompletion.message}
                    />
                  )}
                </>
              }
            />
          )}
        </QueryStates>
      )}
    </QueryStates>
  );
}

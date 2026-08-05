"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  dispatchDeliveryCommandSchema,
  generateDocumentCommandSchema,
  markDeliveryDeliveredCommandSchema,
  recordDeliveryReturnCommandSchema,
  type DeliveryDto,
  type DeliveryId,
  type DeliveryReturnId,
  type DocumentId,
  type RecordDeliveryReturnCommand,
} from "@vuarau/domain-contracts";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand, type CommandRunner } from "@/api/use-command.ts";
import { useWorkflowCacheEffects } from "@/api/workflow-cache.ts";
import {
  DeliveryReturnPanel,
  type DeliveryReturnIntent,
} from "@/ui/patterns/delivery/delivery-return-panel.tsx";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { DeliveryDetailView } from "@/ui/screens/delivery-detail-view.tsx";

export function DeliveryDetailController() {
  const deliveryId = useParams<{ deliveryId: string }>().deliveryId as DeliveryId;
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const cache = useWorkflowCacheEffects();
  const router = useRouter();
  const query = useQuery(trpc.delivery.get.queryOptions({ workspaceId, deliveryId }));
  const dispatchMutation = useMutation(trpc.delivery.dispatch.mutationOptions());
  const deliveredMutation = useMutation(trpc.delivery.markDelivered.mutationOptions());
  const returnMutation = useMutation(trpc.delivery.recordReturn.mutationOptions());
  const documentMutation = useMutation(trpc.document.generate.mutationOptions());
  const dispatch = useContractCommand(dispatchDeliveryCommandSchema, dispatchMutation.mutateAsync);
  const delivered = useContractCommand(
    markDeliveryDeliveredCommandSchema,
    deliveredMutation.mutateAsync,
  );
  const returned = useContractCommand(
    recordDeliveryReturnCommandSchema,
    returnMutation.mutateAsync,
  );
  const generated = useContractCommand(generateDocumentCommandSchema, documentMutation.mutateAsync);
  const returnId = useRef(crypto.randomUUID() as DeliveryReturnId);
  const documentId = useRef(crypto.randomUUID() as DocumentId);

  useEffect(() => {
    const changed = returned.result ?? delivered.result ?? dispatch.result;
    if (changed !== null) {
      void cache.deliveryChanged(workspaceId, changed);
      void query.refetch();
    }
  }, [
    cache.deliveryChanged,
    delivered.result,
    dispatch.result,
    query.refetch,
    returned.result,
    workspaceId,
  ]);
  useEffect(() => {
    if (generated.result !== null) router.push(`/documents/${generated.result.id}`);
  }, [generated.result, router]);

  return (
    <DeliveryDetailView
      query={query}
      canDispatch={session.permissions.includes("delivery.dispatch")}
      canComplete={session.permissions.includes("delivery.complete")}
      canReturn={session.permissions.includes("delivery.return")}
      canGenerateDocument={session.permissions.includes("document.generate")}
      dispatchLocked={dispatch.phase.kind === "sending" || dispatch.phase.kind === "unknown"}
      completeLocked={delivered.phase.kind === "sending" || delivered.phase.kind === "unknown"}
      documentLocked={generated.phase.kind === "sending" || generated.phase.kind === "unknown"}
      onDispatch={(delivery) =>
        void dispatch.submit({ deliveryId }, { expectedVersion: delivery.version })
      }
      onComplete={(delivery) =>
        void delivered.submit({ deliveryId }, { expectedVersion: delivery.version })
      }
      onGenerateDocument={(delivery) =>
        void generated.submit({
          documentId: documentId.current,
          documentType: "delivery_note",
          sourceType: "delivery",
          sourceId: delivery.id,
          period: null,
        })
      }
      renderReturnPanel={(delivery) => (
        <DeliveryReturnCommandPanel
          delivery={delivery}
          command={returned}
          returnId={returnId}
          onChanged={(changed) => {
            void cache.deliveryChanged(workspaceId, changed);
            void query.refetch();
          }}
        />
      )}
      feedback={
        <>
          <CommandOutcome
            command={dispatch}
            attemptedAction="Xuất kho và bắt đầu giao"
            onReload={() => void query.refetch()}
          />
          <CommandOutcome
            command={delivered}
            attemptedAction="Xác nhận giao xong"
            onReload={() => void query.refetch()}
          />
          <CommandOutcome
            command={generated}
            attemptedAction="Tạo chứng từ giao hàng"
            onReload={() => void query.refetch()}
          />
        </>
      }
      onRetry={() => void query.refetch()}
    />
  );
}

function DeliveryReturnCommandPanel(props: {
  readonly delivery: DeliveryDto;
  readonly command: CommandRunner<RecordDeliveryReturnCommand["payload"], DeliveryDto>;
  readonly returnId: { current: DeliveryReturnId };
  readonly onChanged: (delivery: DeliveryDto) => void;
}) {
  const locked = props.command.phase.kind === "sending" || props.command.phase.kind === "unknown";
  useEffect(() => {
    if (props.command.result !== null) props.onChanged(props.command.result);
  }, [props.command.result, props.onChanged]);
  function submit(intent: DeliveryReturnIntent): void {
    void props.command.submit({
      returnId: props.returnId.current,
      deliveryId: props.delivery.id,
      lines: [...intent.lines],
      reason: intent.reason,
      evidenceReferences: [...intent.evidenceReferences],
    });
  }
  return (
    <DeliveryReturnPanel
      lines={props.delivery.lines}
      completed={props.command.result !== null}
      locked={locked}
      onSubmit={submit}
      onStartAnother={() => {
        props.returnId.current = crypto.randomUUID() as DeliveryReturnId;
        props.command.reset();
      }}
      feedback={
        <CommandOutcome
          command={props.command}
          attemptedAction="Ghi hàng trả"
          onReload={() => props.onChanged(props.delivery)}
        />
      }
    />
  );
}

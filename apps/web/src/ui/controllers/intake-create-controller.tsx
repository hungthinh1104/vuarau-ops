"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  GoodsArrivalDto,
  GoodsArrivalId,
  GoodsArrivalLineId,
  PurchaseId,
  RecordGoodsArrivalCommand,
} from "@vuarau/domain-contracts";
import { purchaseIdSchema } from "@vuarau/domain-contracts";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useCommand } from "@/api/use-command.ts";
import {
  buildArrivalLines,
  EMPTY_INTAKE_LINE,
  type IntakeLineState,
} from "@/ui/domain/intake-form.ts";
import { IntakeCreateView } from "@/ui/screens/intake-create-view.tsx";

export function IntakeCreateController() {
  const rawPurchaseId = useSearchParams().get("purchaseId");
  const parsedPurchaseId = purchaseIdSchema.safeParse(rawPurchaseId);
  const purchaseId = (
    parsedPurchaseId.success ? parsedPurchaseId.data : "00000000-0000-0000-0000-000000000000"
  ) as PurchaseId;
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const purchase = useQuery({
    ...trpc.purchase.get.queryOptions({ workspaceId, purchaseId }),
    enabled: parsedPurchaseId.success,
  });
  const profile = useQuery(trpc.session.operationalProfile.queryOptions({ workspaceId }));
  const mutation = useMutation(trpc.intake.recordArrival.mutationOptions());
  const command = useCommand<RecordGoodsArrivalCommand["payload"], GoodsArrivalDto>((envelope) =>
    mutation.mutateAsync(envelope),
  );
  const arrivalId = useRef(crypto.randomUUID() as GoodsArrivalId);
  const lineIds = useRef(new Map<string, GoodsArrivalLineId>());
  const [vehicleReference, setVehicleReference] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Readonly<Record<string, IntakeLineState>>>({});

  useEffect(() => {
    if (command.result !== null) router.push(`/intake/${command.result.id}`);
  }, [command.result, router]);

  const weighing = profile.data?.weighingMode === "gross_tare_net";
  const commandLines =
    purchase.data === undefined
      ? []
      : buildArrivalLines(purchase.data.lines, lines, weighing, lineIds.current);

  return (
    <IntakeCreateView
      validPurchaseId={parsedPurchaseId.success}
      canRecord={session.permissions.includes("intake.record")}
      role={session.role}
      roles={session.roles}
      purchase={purchase}
      profile={profile}
      vehicleReference={vehicleReference}
      note={note}
      lines={lines}
      commandLines={commandLines}
      command={command}
      onVehicleReference={setVehicleReference}
      onNote={setNote}
      onLineChange={(lineId, patch) =>
        setLines((current) => ({
          ...current,
          [lineId]: { ...EMPTY_INTAKE_LINE, ...current[lineId], ...patch },
        }))
      }
      onSubmit={() => {
        if (!purchase.data) return;
        void command.submit({
          arrivalId: arrivalId.current,
          supplierId: purchase.data.supplierId,
          purchaseId: purchase.data.id,
          vehicleReference: vehicleReference.trim() || null,
          lines: commandLines,
          note: note.trim() || null,
        });
      }}
      onPurchaseRetry={() => void purchase.refetch()}
      onProfileRetry={() => void profile.refetch()}
    />
  );
}

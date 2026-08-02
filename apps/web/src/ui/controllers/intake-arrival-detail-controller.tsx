"use client";

import { useQuery } from "@tanstack/react-query";
import type { GoodsArrivalId } from "@vuarau/domain-contracts";
import { useParams } from "next/navigation";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { ArrivalLineController } from "@/ui/controllers/intake/arrival-line-controller.tsx";
import { ReverseArrivalController } from "@/ui/controllers/intake/reverse-arrival-controller.tsx";
import { IntakeArrivalDetailView } from "@/ui/screens/intake-arrival-detail-view.tsx";

export function IntakeArrivalDetailController() {
  const arrivalId = useParams<{ arrivalId: string }>().arrivalId as GoodsArrivalId;
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const arrival = useQuery(trpc.intake.getArrival.queryOptions({ workspaceId, arrivalId }));
  const profile = useQuery(trpc.session.operationalProfile.queryOptions({ workspaceId }));
  const refresh = () => void arrival.refetch();

  return (
    <IntakeArrivalDetailView
      arrival={arrival}
      profile={profile}
      canReverse={session.permissions.includes("intake.reverse")}
      reverseControl={
        arrival.data === undefined ? undefined : (
          <ReverseArrivalController arrival={arrival.data} onChanged={refresh} />
        )
      }
      onRetryArrival={() => void arrival.refetch()}
      onRetryProfile={() => void profile.refetch()}
      renderLine={(line, active) =>
        profile.data === undefined ? null : (
          <ArrivalLineController
            key={line.arrivalLineId}
            line={line}
            profile={profile.data}
            active={active}
            canInspect={session.permissions.includes("quality.inspect")}
            canInspectReverse={session.permissions.includes("quality.inspect.reverse")}
            canDisposition={session.permissions.includes("quality.disposition")}
            canDispositionReverse={session.permissions.includes("quality.disposition.reverse")}
          />
        )
      }
    />
  );
}

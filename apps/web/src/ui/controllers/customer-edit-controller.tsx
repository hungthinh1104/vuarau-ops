"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { updateCustomerCommandSchema, type CustomerId } from "@vuarau/domain-contracts";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { CustomerEditView } from "@/ui/screens/customer-edit-view.tsx";

export function CustomerEditController() {
  const { workspaceId } = useSession();
  const customerId = useParams<{ customerId: string }>().customerId as CustomerId;
  const trpc = useTRPC();
  const router = useRouter();
  const detail = useQuery(trpc.customer.get.queryOptions({ workspaceId, customerId }));
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null);
  const updateMutation = useMutation(trpc.customer.update.mutationOptions());
  const command = useContractCommand(updateCustomerCommandSchema, updateMutation.mutateAsync);

  useEffect(() => {
    if (!detail.data || loadedVersion !== null) return;
    setDisplayName(detail.data.customer.displayName);
    setPhone(detail.data.customer.phone ?? "");
    setNote(detail.data.customer.note ?? "");
    setLoadedVersion(detail.data.customer.version);
  }, [detail.data, loadedVersion]);
  useEffect(() => {
    if (command.phase.kind === "succeeded") router.replace(`/customers/${customerId}`);
  }, [command.phase.kind, customerId, router]);

  const duplicates = useQuery({
    ...trpc.customer.duplicates.queryOptions({
      workspaceId,
      displayName,
      phone: phone.trim().length === 0 ? null : phone,
      excludeCustomerId: customerId,
    }),
    enabled: loadedVersion !== null && (displayName.trim().length > 1 || phone.length >= 6),
  });

  return (
    <CustomerEditView
      query={detail}
      displayName={displayName}
      phone={phone}
      note={note}
      loadedVersion={loadedVersion}
      duplicateCount={duplicates.data?.length ?? 0}
      command={command}
      onDisplayName={setDisplayName}
      onPhone={setPhone}
      onNote={setNote}
      onSave={() => {
        if (loadedVersion === null) return;
        void command.submit(
          {
            customerId,
            displayName,
            phone: phone.trim().length === 0 ? null : phone,
            note: note.trim().length === 0 ? null : note,
          },
          { expectedVersion: loadedVersion },
        );
      }}
      onRetry={() => void detail.refetch()}
      onCancel={() => router.push(`/customers/${customerId}`)}
    />
  );
}

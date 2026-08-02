"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { createCustomerCommandSchema, type CustomerId } from "@vuarau/domain-contracts";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { CustomerCreateView } from "@/ui/screens/customer-create-view.tsx";

export function CustomerCreateController() {
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const customerId = useRef(crypto.randomUUID() as CustomerId).current;
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const createMutation = useMutation(trpc.customer.create.mutationOptions());
  const command = useContractCommand(createCustomerCommandSchema, createMutation.mutateAsync);
  const duplicates = useQuery({
    ...trpc.customer.duplicates.queryOptions({
      workspaceId,
      displayName,
      phone: phone.trim().length === 0 ? null : phone,
      excludeCustomerId: null,
    }),
    enabled: displayName.trim().length > 1 || phone.replace(/\D/g, "").length >= 6,
  });

  useEffect(() => {
    if (command.phase.kind === "succeeded") router.replace(`/customers/${customerId}`);
  }, [command.phase.kind, customerId, router]);

  return (
    <CustomerCreateView
      displayName={displayName}
      phone={phone}
      note={note}
      duplicates={duplicates.data}
      command={command}
      onDisplayName={setDisplayName}
      onPhone={setPhone}
      onNote={setNote}
      onCreate={() =>
        void command.submit({
          customerId,
          displayName,
          phone: phone.trim().length === 0 ? null : phone,
          note: note.trim().length === 0 ? null : note,
        })
      }
      onReload={() => void duplicates.refetch()}
      onCancel={() => router.push("/customers")}
    />
  );
}

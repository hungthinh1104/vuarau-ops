"use client";

import { useMutation } from "@tanstack/react-query";
import { createSupplierCommandSchema, type SupplierId } from "@vuarau/domain-contracts";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { SupplierCreateView } from "@/ui/screens/supplier-create-view.tsx";

export function SupplierCreateController() {
  const trpc = useTRPC();
  const router = useRouter();
  const supplierId = useRef(crypto.randomUUID() as SupplierId).current;
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const mutation = useMutation(trpc.supplier.create.mutationOptions());
  const command = useContractCommand(createSupplierCommandSchema, mutation.mutateAsync);

  useEffect(() => {
    if (command.result !== null) router.replace(`/suppliers/${command.result.id}`);
  }, [command.result, router]);

  return (
    <SupplierCreateView
      displayName={displayName}
      phone={phone}
      note={note}
      command={command}
      onDisplayName={setDisplayName}
      onPhone={setPhone}
      onNote={setNote}
      onCreate={() =>
        void command.submit({
          supplierId,
          displayName: displayName.trim(),
          phone: phone.trim() || null,
          note: note.trim() || null,
        })
      }
    />
  );
}

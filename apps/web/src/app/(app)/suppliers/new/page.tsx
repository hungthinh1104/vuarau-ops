"use client";

import { useMutation } from "@tanstack/react-query";
import type { SupplierDto, SupplierId } from "@vuarau/domain-contracts";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useCommand } from "@/api/use-command.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { INPUT_CLASS } from "@/ui/primitives/field.tsx";

export default function NewSupplierPage() {
  const trpc = useTRPC();
  const router = useRouter();
  const supplierId = useRef(crypto.randomUUID() as SupplierId).current;
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const mutation = useMutation(trpc.supplier.create.mutationOptions());
  const command = useCommand<unknown, SupplierDto>((envelope) =>
    mutation.mutateAsync(envelope as never),
  );
  useEffect(() => {
    if (command.result !== null) router.replace(`/suppliers/${command.result.id}`);
  }, [command.result, router]);
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <PageHeader title="Thêm nhà cung cấp" back={{ href: "/suppliers", label: "Hủy" }} />
      <label className="text-label">
        Tên nhà cung cấp
        <input
          className={INPUT_CLASS}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </label>
      <label className="text-label">
        Số điện thoại
        <input
          className={INPUT_CLASS}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </label>
      <label className="text-label">
        Ghi chú
        <textarea
          className={INPUT_CLASS}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <Button
        disabled={displayName.trim().length === 0 || command.phase.kind === "sending"}
        onClick={() =>
          void command.submit({
            supplierId,
            displayName: displayName.trim(),
            phone: phone.trim() || null,
            note: note.trim() || null,
          })
        }
      >
        Tạo nhà cung cấp
      </Button>
      <CommandOutcome
        command={command}
        attemptedAction="Tạo nhà cung cấp"
        onReload={() => undefined}
      />
    </div>
  );
}

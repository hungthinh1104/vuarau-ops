"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { CustomerDto, CustomerId } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useCommand } from "@/api/use-command.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { CustomerFields } from "@/ui/patterns/customer/customer-fields.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";

export default function NewCustomerPage() {
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const customerId = useRef(crypto.randomUUID() as CustomerId).current;
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const createMutation = useMutation(trpc.customer.create.mutationOptions());
  const command = useCommand<
    { customerId: CustomerId; displayName: string; phone: string | null; note: string | null },
    CustomerDto
  >((envelope) => createMutation.mutateAsync(envelope as never) as Promise<CustomerDto>);
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
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title="Thêm khách hàng" back={{ href: "/customers", label: "Hủy" }} />
      <CustomerFields
        displayName={displayName}
        phone={phone}
        note={note}
        onDisplayName={setDisplayName}
        onPhone={setPhone}
        onNote={setNote}
      />
      {duplicates.data && duplicates.data.length > 0 ? (
        <DuplicateWarning candidates={duplicates.data} />
      ) : null}
      <button
        type="button"
        disabled={displayName.trim().length === 0 || command.phase.kind === "sending"}
        onClick={() =>
          void command.submit({
            customerId,
            displayName,
            phone: phone.trim().length === 0 ? null : phone,
            note: note.trim().length === 0 ? null : note,
          })
        }
        className="touch-target rounded-button bg-leaf px-4 text-label font-semibold text-white disabled:opacity-50"
      >
        {command.phase.kind === "sending" ? "Đang tạo" : "Tạo khách hàng"}
      </button>
      <CommandOutcome
        command={command}
        attemptedAction="Tạo khách hàng"
        onReload={() => void duplicates.refetch()}
        onCancel={() => router.push("/customers")}
      />
    </div>
  );
}

function DuplicateWarning({
  candidates,
}: {
  candidates: readonly {
    customer: { id: string; displayName: string; phone: string | null };
    reasons: readonly ("same_name" | "same_phone")[];
  }[];
}) {
  return (
    <aside className="rounded-card border border-warning/50 bg-warning/5 p-4">
      <h2 className="font-semibold">Có thể đã có khách này</h2>
      <p className="text-body-sm">Tên trùng vẫn được phép. Hãy kiểm tra trước khi tạo thêm.</p>
      <ul className="mt-2 list-disc pl-5 text-body-sm">
        {candidates.map((candidate) => (
          <li key={candidate.customer.id}>
            <Link href={`/customers/${candidate.customer.id}`} className="text-info underline">
              {candidate.customer.displayName} · {candidate.customer.phone ?? "không có SĐT"}
            </Link>{" "}
            ({candidate.reasons.includes("same_phone") ? "trùng số điện thoại" : "trùng tên"})
          </li>
        ))}
      </ul>
    </aside>
  );
}

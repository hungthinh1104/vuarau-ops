"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { CustomerDto, CustomerId } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTRPC } from "../../../../../api/providers.tsx";
import { useSession } from "../../../../../api/session-gate.tsx";
import { useCommand } from "../../../../../api/use-command.ts";
import { CommandOutcome } from "../../../../../ui/patterns/command-outcome.tsx";
import { QueryStates } from "../../../../../ui/patterns/query-states.tsx";
import { CustomerFields } from "../../../../../ui/patterns/customer-fields.tsx";

export default function EditCustomerPage() {
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
  const command = useCommand<
    { customerId: CustomerId; displayName: string; phone: string | null; note: string | null },
    CustomerDto
  >((envelope) => updateMutation.mutateAsync(envelope as never) as Promise<CustomerDto>);

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
    <QueryStates
      query={detail}
      loadingLabel="Đang tải khách hàng"
      attemptedAction="Sửa khách hàng"
      onRetry={() => void detail.refetch()}
    >
      {() => (
        <div className="flex max-w-2xl flex-col gap-5">
          <h1 className="text-heading font-bold">Sửa khách hàng</h1>
          <CustomerFields
            displayName={displayName}
            phone={phone}
            note={note}
            onDisplayName={setDisplayName}
            onPhone={setPhone}
            onNote={setNote}
          />
          {duplicates.data && duplicates.data.length > 0 ? (
            <p className="rounded-card border border-warning/50 p-3 text-body-sm">
              Có {duplicates.data.length} hồ sơ trùng tên hoặc số điện thoại. Hệ thống không tự gộp.
            </p>
          ) : null}
          <button
            type="button"
            disabled={
              loadedVersion === null ||
              displayName.trim().length === 0 ||
              command.phase.kind === "sending"
            }
            onClick={() => {
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
            className="touch-target rounded-button bg-leaf px-4 text-label font-semibold text-white disabled:opacity-50"
          >
            Lưu thay đổi
          </button>
          <CommandOutcome
            command={command}
            attemptedAction="Sửa khách hàng"
            onReload={() => void detail.refetch()}
            onCancel={() => router.push(`/customers/${customerId}`)}
          />
          <Link href={`/customers/${customerId}`} className="text-info underline">
            ← Hủy
          </Link>
        </div>
      )}
    </QueryStates>
  );
}

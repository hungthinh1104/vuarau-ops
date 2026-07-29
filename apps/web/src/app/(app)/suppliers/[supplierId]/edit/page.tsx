"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { SupplierDto, SupplierId } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "../../../../../api/session-gate.tsx";
import { useTRPC } from "../../../../../api/providers.tsx";
import { useCommand } from "../../../../../api/use-command.ts";
import { CommandOutcome } from "../../../../../ui/patterns/command-outcome.tsx";
import { QueryStates } from "../../../../../ui/patterns/query-states.tsx";
import { Button } from "../../../../../ui/primitives/button.tsx";
import { INPUT_CLASS } from "../../../../../ui/primitives/field.tsx";

export default function EditSupplierPage() {
  const supplierId = useParams<{ supplierId: string }>().supplierId as SupplierId;
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const supplier = useQuery(trpc.supplier.get.queryOptions({ workspaceId, supplierId }));
  if (!session.permissions.includes("supplier.update"))
    return <p role="alert">Bạn không có quyền sửa nhà cung cấp.</p>;
  return (
    <QueryStates
      query={supplier}
      loadingLabel="Đang tải nhà cung cấp"
      onRetry={() => void supplier.refetch()}
    >
      {(record) => <SupplierEditForm supplier={record} />}
    </QueryStates>
  );
}

function SupplierEditForm({ supplier }: { supplier: SupplierDto }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [displayName, setDisplayName] = useState(supplier.displayName);
  const [phone, setPhone] = useState(supplier.phone ?? "");
  const [note, setNote] = useState(supplier.note ?? "");
  const [lifecycleReason, setLifecycleReason] = useState("");
  const updateMutation = useMutation(trpc.supplier.update.mutationOptions());
  const lifecycleMutation = useMutation(
    supplier.isActive
      ? trpc.supplier.deactivate.mutationOptions()
      : trpc.supplier.reactivate.mutationOptions(),
  );
  const update = useCommand<unknown, SupplierDto>((envelope) =>
    updateMutation.mutateAsync(envelope as never),
  );
  const lifecycle = useCommand<unknown, SupplierDto>((envelope) =>
    lifecycleMutation.mutateAsync(envelope as never),
  );
  useEffect(() => {
    if (update.result !== null || lifecycle.result !== null)
      router.replace(`/suppliers/${supplier.id}`);
  }, [lifecycle.result, router, supplier.id, update.result]);
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-heading font-bold">Sửa nhà cung cấp</h1>
      <label className="text-label">
        Tên
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
        disabled={displayName.trim().length === 0 || update.phase.kind === "sending"}
        onClick={() =>
          void update.submit(
            {
              supplierId: supplier.id,
              displayName: displayName.trim(),
              phone: phone.trim() || null,
              note: note.trim() || null,
            },
            { expectedVersion: supplier.version },
          )
        }
      >
        Lưu thay đổi
      </Button>
      <label className="text-label">
        Lý do đổi trạng thái
        <input
          className={INPUT_CLASS}
          value={lifecycleReason}
          onChange={(event) => setLifecycleReason(event.target.value)}
        />
      </label>
      <Button
        tone="secondary"
        disabled={lifecycleReason.trim().length === 0 || lifecycle.phase.kind === "sending"}
        onClick={() =>
          void lifecycle.submit(
            {
              supplierId: supplier.id,
              reason: lifecycleReason.trim(),
            },
            { expectedVersion: supplier.version },
          )
        }
      >
        {supplier.isActive ? "Ngưng nhà cung cấp" : "Kích hoạt lại"}
      </Button>
      <CommandOutcome
        command={update}
        attemptedAction="Sửa nhà cung cấp"
        onReload={() => undefined}
      />
      <CommandOutcome
        command={lifecycle}
        attemptedAction="Đổi trạng thái nhà cung cấp"
        onReload={() => undefined}
      />
      <Link href={`/suppliers/${supplier.id}`} className="text-info underline">
        ← Quay lại
      </Link>
    </div>
  );
}

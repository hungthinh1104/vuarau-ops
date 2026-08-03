"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  deactivateSupplierCommandSchema,
  reactivateSupplierCommandSchema,
  updateSupplierCommandSchema,
  type SupplierId,
} from "@vuarau/domain-contracts";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { SupplierEditView } from "@/ui/screens/supplier-edit-view.tsx";

export function SupplierEditController() {
  const supplierId = useParams<{ supplierId: string }>().supplierId as SupplierId;
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const supplier = useQuery(trpc.supplier.get.queryOptions({ workspaceId, supplierId }));
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [lifecycleReason, setLifecycleReason] = useState("");
  const [loadedSupplierId, setLoadedSupplierId] = useState<string | null>(null);
  const updateMutation = useMutation(trpc.supplier.update.mutationOptions());
  const deactivateMutation = useMutation(trpc.supplier.deactivate.mutationOptions());
  const reactivateMutation = useMutation(trpc.supplier.reactivate.mutationOptions());
  const update = useContractCommand(updateSupplierCommandSchema, updateMutation.mutateAsync);
  const deactivate = useContractCommand(
    deactivateSupplierCommandSchema,
    deactivateMutation.mutateAsync,
  );
  const reactivate = useContractCommand(
    reactivateSupplierCommandSchema,
    reactivateMutation.mutateAsync,
  );
  const lifecycle = supplier.data?.isActive === false ? reactivate : deactivate;

  useEffect(() => {
    if (!supplier.data || loadedSupplierId === supplier.data.id) return;
    setDisplayName(supplier.data.displayName);
    setPhone(supplier.data.phone ?? "");
    setNote(supplier.data.note ?? "");
    setLoadedSupplierId(supplier.data.id);
  }, [loadedSupplierId, supplier.data]);
  useEffect(() => {
    if (update.result !== null || lifecycle.result !== null) {
      router.replace(`/suppliers/${supplierId}`);
    }
  }, [lifecycle.result, router, supplierId, update.result]);

  const canUpdate = session.permissions.includes("supplier.update");
  return (
    <SupplierEditView
      query={supplier}
      canUpdate={canUpdate}
      role={session.role}
      displayName={displayName}
      phone={phone}
      note={note}
      lifecycleReason={lifecycleReason}
      update={update}
      lifecycle={lifecycle}
      onDisplayName={setDisplayName}
      onPhone={setPhone}
      onNote={setNote}
      onLifecycleReason={setLifecycleReason}
      onSave={() => {
        if (!supplier.data) return;
        void update.submit(
          {
            supplierId: supplier.data.id,
            displayName: displayName.trim(),
            phone: phone.trim() || null,
            note: note.trim() || null,
          },
          { expectedVersion: supplier.data.version },
        );
      }}
      onLifecycle={() => {
        if (!supplier.data) return;
        void lifecycle.submit(
          { supplierId: supplier.data.id, reason: lifecycleReason.trim() },
          { expectedVersion: supplier.data.version },
        );
      }}
      onRetry={() => void supplier.refetch()}
    />
  );
}

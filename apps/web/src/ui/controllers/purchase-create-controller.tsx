"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  confirmPurchaseCommandSchema,
  createPurchaseDraftCommandSchema,
  type ProductId,
  type PurchaseId,
  type PurchaseLineId,
  type SupplierId,
} from "@vuarau/domain-contracts";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import type { PurchaseDraftLine } from "@/ui/domain/purchase-form.ts";
import { parseSourceEvidence } from "@/ui/domain/source-evidence.ts";
import {
  PurchaseCreatePermissionView,
  PurchaseCreateView,
} from "@/ui/screens/purchase-create-view.tsx";

const newLine = (): PurchaseDraftLine => ({
  lineId: crypto.randomUUID() as PurchaseLineId,
  productId: "",
  productName: "",
  quantity: "1",
  unit: "kg",
  price: "",
});

export function PurchaseCreateController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const replacesPurchaseId = useSearchParams().get("replacesPurchaseId") as PurchaseId | null;
  const purchaseId = useRef(crypto.randomUUID() as PurchaseId).current;
  const [supplierId, setSupplierId] = useState<SupplierId | "">("");
  const [lines, setLines] = useState<readonly PurchaseDraftLine[]>([newLine()]);
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");
  const suppliers = useQuery(
    trpc.supplier.search.queryOptions({
      workspaceId,
      query: "",
      isActive: true,
      cursor: null,
      limit: 100,
    }),
  );
  const products = useQuery(
    trpc.product.search.queryOptions({
      workspaceId,
      query: "",
      isActive: true,
      cursor: null,
      limit: 100,
    }),
  );
  const createMutation = useMutation(trpc.purchase.createDraft.mutationOptions());
  const confirmMutation = useMutation(trpc.purchase.confirm.mutationOptions());
  const create = useContractCommand(createPurchaseDraftCommandSchema, createMutation.mutateAsync);
  const confirm = useContractCommand(confirmPurchaseCommandSchema, confirmMutation.mutateAsync);

  if (!session.permissions.includes("purchase.create")) return <PurchaseCreatePermissionView />;

  const payloadLines = lines.map((line) => ({
    lineId: line.lineId,
    productId: line.productId as ProductId,
    productName: line.productName.trim(),
    quantity: { valueScaled: Math.round(Number(line.quantity) * 1000), unit: line.unit },
    unitPrice: { amountMinor: Math.round(Number(line.price) * 1000), currency: "VND" as const },
  }));
  const valid =
    supplierId !== "" &&
    payloadLines.length > 0 &&
    payloadLines.every(
      (line) =>
        line.productName.length > 0 &&
        line.quantity.valueScaled > 0 &&
        Number.isSafeInteger(line.quantity.valueScaled) &&
        line.unitPrice.amountMinor >= 0 &&
        Number.isSafeInteger(line.unitPrice.amountMinor),
    );
  const save = async (shouldConfirm: boolean) => {
    const draft = await create.submit({
      purchaseId,
      supplierId: supplierId as SupplierId,
      currency: "VND",
      lines: payloadLines,
      note: note.trim() || null,
      evidenceReferences: parseSourceEvidence(evidence),
      dueAt: null,
      replacesPurchaseId,
    });
    if (draft === null) return;
    if (!shouldConfirm) {
      router.replace(`/purchases/${draft.id}`);
      return;
    }
    const confirmed = await confirm.submit(
      { purchaseId: draft.id },
      { expectedVersion: draft.version },
    );
    if (confirmed !== null) router.replace(`/purchases/${confirmed.id}`);
  };

  return (
    <PurchaseCreateView
      supplierId={supplierId}
      suppliers={(suppliers.data?.items ?? []).map((supplier) => ({
        id: supplier.id,
        displayName: supplier.displayName,
      }))}
      lines={lines}
      products={(products.data?.items ?? []).map((product) => ({
        id: product.id,
        displayName: product.displayName,
        preferredUnit: product.preferredUnit,
      }))}
      note={note}
      evidence={evidence}
      valid={valid}
      submitting={create.phase.kind === "sending" || confirm.phase.kind === "sending"}
      createCommand={create}
      confirmCommand={confirm}
      canConfirm={session.permissions.includes("purchase.confirm")}
      onSupplierChange={(value) => setSupplierId(value as SupplierId)}
      onLineChange={(lineId, patch) =>
        setLines((current) =>
          current.map((line) => (line.lineId === lineId ? { ...line, ...patch } : line)),
        )
      }
      onAddLine={() => setLines((current) => [...current, newLine()])}
      onRemoveLine={(lineId) =>
        setLines((current) => current.filter((line) => line.lineId !== lineId))
      }
      onNoteChange={setNote}
      onEvidenceChange={setEvidence}
      onSave={(shouldConfirm) => void save(shouldConfirm)}
    />
  );
}

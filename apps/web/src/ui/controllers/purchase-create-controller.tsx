"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  confirmPurchaseCommandSchema,
  createPurchaseDraftCommandSchema,
  recordPurchaseReceiptCommandSchema,
  type ProductId,
  type PurchaseId,
  type PurchaseLineId,
  type PurchaseReceiptId,
  type PurchaseReceiptLineId,
  type SupplierId,
} from "@vuarau/domain-contracts";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { useWorkflowCacheEffects } from "@/api/workflow-cache.ts";
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
  const cache = useWorkflowCacheEffects();
  const replacesPurchaseId = useSearchParams().get("replacesPurchaseId") as PurchaseId | null;
  const purchaseIdRef = useRef<PurchaseId>(crypto.randomUUID() as PurchaseId);
  const [supplierId, setSupplierId] = useState<SupplierId | "">("");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [lines, setLines] = useState<readonly PurchaseDraftLine[]>([newLine()]);
  const [productQuery, setProductQuery] = useState("");
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");
  const suppliers = useQuery(
    trpc.supplier.search.queryOptions({
      workspaceId,
      query: supplierQuery,
      isActive: true,
      cursor: null,
      limit: 100,
    }),
  );
  const products = useQuery(
    trpc.product.search.queryOptions({
      workspaceId,
      query: productQuery,
      isActive: true,
      cursor: null,
      limit: 100,
    }),
  );
  const operationalProfile = useQuery(
    trpc.session.operationalProfile.queryOptions({ workspaceId }),
  );
  const createMutation = useMutation(trpc.purchase.createDraft.mutationOptions());
  const confirmMutation = useMutation(trpc.purchase.confirm.mutationOptions());
  const receiptMutation = useMutation(trpc.receiving.record.mutationOptions());
  const create = useContractCommand(createPurchaseDraftCommandSchema, createMutation.mutateAsync);
  const confirm = useContractCommand(confirmPurchaseCommandSchema, confirmMutation.mutateAsync);
  const receipt = useContractCommand(
    recordPurchaseReceiptCommandSchema,
    receiptMutation.mutateAsync,
  );
  const receiptIdRef = useRef<PurchaseReceiptId>(crypto.randomUUID() as PurchaseReceiptId);
  const [partialCompletion, setPartialCompletion] = useState<{
    readonly href: string;
    readonly message: string;
  } | null>(null);

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
  const productOptions = [
    ...lines
      .filter((line) => line.productId !== "" && line.productName.trim().length > 0)
      .map((line) => ({
        id: line.productId as ProductId,
        displayName: line.productName,
        preferredUnit: line.unit,
      })),
    ...(products.data?.items ?? []).map((product) => ({
      id: product.id,
      displayName: product.displayName,
      preferredUnit: product.preferredUnit,
    })),
  ].filter(
    (product, index, all) => all.findIndex((candidate) => candidate.id === product.id) === index,
  );
  const save = async (action: "draft" | "receive" | "another") => {
    setPartialCompletion(null);
    create.reset();
    confirm.reset();
    const draft = await create.submit({
      purchaseId: purchaseIdRef.current,
      supplierId: supplierId as SupplierId,
      currency: "VND",
      lines: payloadLines,
      note: note.trim() || null,
      evidenceReferences: parseSourceEvidence(evidence),
      dueAt: null,
      replacesPurchaseId,
    });
    if (draft === null) return;
    await cache.purchaseCreated(workspaceId, draft);
    if (action === "another") {
      purchaseIdRef.current = crypto.randomUUID() as PurchaseId;
      setSupplierId("");
      setSupplierQuery("");
      setLines([newLine()]);
      setProductQuery("");
      setNote("");
      setEvidence("");
      toast.success("Đã lưu đơn mua", {
        description: "Bạn có thể tạo đơn mua tiếp theo.",
        duration: 2_500,
      });
      return;
    }
    if (action === "draft") {
      router.replace(`/purchases/${draft.id}`);
      return;
    }
    const confirmed = await confirm.submit(
      { purchaseId: draft.id },
      { expectedVersion: draft.version },
    );
    if (confirmed === null) {
      setPartialCompletion({
        href: `/purchases/${draft.id}`,
        message: "Đơn mua đã được lưu nhưng chưa xác nhận. Mở đơn nháp để kiểm tra và tiếp tục.",
      });
      return;
    }
    if (action === "receive" && operationalProfile.data?.qualityGradeMode === "disabled") {
      const received = await receipt.submit({
        receiptId: receiptIdRef.current,
        purchaseId: confirmed.id,
        lines: payloadLines.map((line) => ({
          receiptLineId: crypto.randomUUID() as PurchaseReceiptLineId,
          purchaseLineId: line.lineId,
          productId: line.productId,
          qualityGradeId: null,
          qualityGradeName: null,
          quantity: line.quantity,
        })),
        note: null,
        evidenceReferences: parseSourceEvidence(evidence),
      });
      if (received === null) {
        setPartialCompletion({
          href: `/purchases/${draft.id}`,
          message:
            "Đơn mua đã xác nhận nhưng phiếu nhận chưa ghi được. Mở đơn để kiểm tra và tiếp tục.",
        });
        return;
      }
      await cache.receivingChanged(workspaceId, confirmed.id);
    }
    await cache.purchaseChanged(workspaceId, confirmed.id);
    router.replace(`/purchases/${confirmed.id}`);
  };

  return (
    <PurchaseCreateView
      supplierId={supplierId}
      suppliers={(suppliers.data?.items ?? []).map((supplier) => ({
        id: supplier.id,
        displayName: supplier.displayName,
      }))}
      supplierSearch={{ value: supplierQuery, onChange: setSupplierQuery }}
      lines={lines}
      products={productOptions}
      productSearch={{ value: productQuery, onChange: setProductQuery }}
      note={note}
      evidence={evidence}
      valid={valid}
      submitting={
        create.phase.kind === "sending" ||
        confirm.phase.kind === "sending" ||
        receipt.phase.kind === "sending"
      }
      createCommand={create}
      confirmCommand={confirm}
      receiptCommand={receipt}
      qualityGradeRequired={operationalProfile.data?.qualityGradeMode !== "disabled"}
      partialCompletion={partialCompletion}
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
      onSave={(action) => void save(action)}
    />
  );
}

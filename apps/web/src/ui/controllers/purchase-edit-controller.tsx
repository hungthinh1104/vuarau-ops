"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  updatePurchaseDraftCommandSchema,
  type ProductId,
  type PurchaseId,
  type PurchaseLineId,
  type Unit,
} from "@vuarau/domain-contracts";
import type { PurchaseDto } from "@vuarau/domain-contracts";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import type { PurchaseDraftLine } from "@/ui/domain/purchase-form.ts";
import { formatSourceEvidence, parseSourceEvidence } from "@/ui/domain/source-evidence.ts";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import {
  PurchaseEditPermissionView,
  PurchaseEditStateView,
  PurchaseEditView,
} from "@/ui/screens/purchase-edit-view.tsx";

const emptyLine = (
  products: readonly { id: ProductId; displayName: string }[],
): PurchaseDraftLine => ({
  lineId: crypto.randomUUID() as PurchaseLineId,
  productId: products[0]?.id ?? ("" as ProductId),
  productName: products[0]?.displayName ?? "",
  quantity: "1",
  unit: "kg",
  price: "",
});

export function PurchaseEditController() {
  const purchaseId = useParams<{ purchaseId: string }>().purchaseId as PurchaseId;
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const purchase = useQuery(trpc.purchase.get.queryOptions({ workspaceId, purchaseId }));
  const products = useQuery(
    trpc.product.search.queryOptions({
      workspaceId,
      query: "",
      isActive: true,
      cursor: null,
      limit: 100,
    }),
  );
  if (!session.permissions.includes("purchase.update")) return <PurchaseEditPermissionView />;
  return (
    <QueryStates
      query={purchase}
      loadingLabel="Đang tải đơn mua"
      onRetry={() => void purchase.refetch()}
    >
      {(draft) =>
        draft.status !== "draft" ? (
          <PurchaseEditStateView />
        ) : (
          <PurchaseEditForm
            purchase={draft}
            products={products.data?.items ?? []}
            productsLoading={products.isPending}
            onRetry={() => void purchase.refetch()}
          />
        )
      }
    </QueryStates>
  );
}

function PurchaseEditForm(props: {
  readonly purchase: PurchaseDto;
  readonly products: readonly {
    readonly id: ProductId;
    readonly displayName: string;
    readonly preferredUnit: Unit | null;
  }[];
  readonly productsLoading: boolean;
  readonly onRetry: () => void;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const mutation = useMutation(trpc.purchase.updateDraft.mutationOptions());
  const update = useContractCommand(updatePurchaseDraftCommandSchema, mutation.mutateAsync);
  const [lines, setLines] = useState<readonly PurchaseDraftLine[]>(() =>
    props.purchase.lines.map((line) => ({
      lineId: line.lineId,
      productId: line.productId,
      productName: line.productName,
      quantity: String(line.quantity.valueScaled / 1000),
      unit: line.quantity.unit,
      price: String(line.unitPrice.amountMinor / 1000),
    })),
  );
  const [note, setNote] = useState(props.purchase.note ?? "");
  const [evidence, setEvidence] = useState(formatSourceEvidence(props.purchase.evidenceReferences));
  useEffect(() => {
    if (update.result !== null) router.replace(`/purchases/${update.result.id}`);
  }, [router, update.result]);
  const payloadLines = lines.map((line) => ({
    lineId: line.lineId,
    productId: line.productId as ProductId,
    productName: line.productName.trim(),
    quantity: { valueScaled: Math.round(Number(line.quantity) * 1000), unit: line.unit },
    unitPrice: { amountMinor: Math.round(Number(line.price) * 1000), currency: "VND" as const },
  }));
  const valid =
    payloadLines.length > 0 &&
    payloadLines.every(
      (line) =>
        line.productId !== "" &&
        line.productName.length > 0 &&
        line.quantity.valueScaled > 0 &&
        Number.isSafeInteger(line.quantity.valueScaled) &&
        line.unitPrice.amountMinor >= 0 &&
        Number.isSafeInteger(line.unitPrice.amountMinor),
    );
  return (
    <PurchaseEditView
      purchase={props.purchase}
      products={props.products}
      productsLoading={props.productsLoading}
      lines={lines}
      note={note}
      evidence={evidence}
      valid={valid}
      command={update}
      onLineChange={(lineId, patch) =>
        setLines((current) =>
          current.map((line) => (line.lineId === lineId ? { ...line, ...patch } : line)),
        )
      }
      onAddLine={() => setLines((current) => [...current, emptyLine(props.products)])}
      onRemoveLine={(lineId) =>
        setLines((current) => current.filter((line) => line.lineId !== lineId))
      }
      onNoteChange={setNote}
      onEvidenceChange={setEvidence}
      onSubmit={() =>
        void update.submit(
          {
            purchaseId: props.purchase.id,
            supplierId: props.purchase.supplierId,
            currency: props.purchase.currency,
            lines: payloadLines,
            note: note.trim() || null,
            evidenceReferences: parseSourceEvidence(evidence),
            dueAt: props.purchase.dueAt,
            replacesPurchaseId: props.purchase.replacesPurchaseId,
          },
          { expectedVersion: props.purchase.version },
        )
      }
      onReload={props.onRetry}
    />
  );
}

"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  deactivateProductCommandSchema,
  reactivateProductCommandSchema,
  updateProductCommandSchema,
  type ProductId,
  type Unit,
} from "@vuarau/domain-contracts";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { ProductDetailView } from "@/ui/screens/product-detail-view.tsx";

export function ProductDetailController() {
  const { workspaceId, session } = useSession();
  const productId = useParams<{ productId: string }>().productId as ProductId;
  const trpc = useTRPC();
  const product = useQuery(trpc.product.get.queryOptions({ workspaceId, productId }));
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [unit, setUnit] = useState<Unit | "">("");
  const [loadedProductId, setLoadedProductId] = useState<string | null>(null);
  const updateMutation = useMutation(trpc.product.update.mutationOptions());
  const deactivateMutation = useMutation(trpc.product.deactivate.mutationOptions());
  const reactivateMutation = useMutation(trpc.product.reactivate.mutationOptions());
  const update = useContractCommand(updateProductCommandSchema, updateMutation.mutateAsync);
  const deactivate = useContractCommand(
    deactivateProductCommandSchema,
    deactivateMutation.mutateAsync,
  );
  const reactivate = useContractCommand(
    reactivateProductCommandSchema,
    reactivateMutation.mutateAsync,
  );
  const lifecycle = product.data?.isActive === false ? reactivate : deactivate;

  useEffect(() => {
    if (!product.data || loadedProductId === product.data.id) return;
    setName(product.data.displayName);
    setAliases(product.data.aliases.join(", "));
    setUnit(product.data.preferredUnit ?? "");
    setLoadedProductId(product.data.id);
  }, [loadedProductId, product.data]);
  const refresh = useCallback(() => void product.refetch(), [product.refetch]);
  useEffect(() => {
    if (update.result !== null || lifecycle.result !== null) refresh();
  }, [lifecycle.result, refresh, update.result]);

  return (
    <ProductDetailView
      query={product}
      mayUpdate={session.permissions.includes("product.update")}
      mayDeactivate={session.permissions.includes("product.deactivate")}
      name={name}
      aliases={aliases}
      unit={unit}
      update={update}
      lifecycle={lifecycle}
      onName={setName}
      onAliases={setAliases}
      onUnit={setUnit}
      onUpdate={() => {
        if (!product.data) return;
        void update.submit(
          {
            productId: product.data.id,
            displayName: name,
            aliases: aliases
              .split(",")
              .map((alias) => alias.trim())
              .filter(Boolean),
            preferredUnit: unit || null,
          },
          { expectedVersion: product.data.version },
        );
      }}
      onLifecycle={() => {
        if (!product.data) return;
        void lifecycle.submit(
          {
            productId: product.data.id,
            reason: product.data.isActive ? "Ngưng sử dụng" : "Sử dụng lại",
          },
          { expectedVersion: product.data.version },
        );
      }}
      onRetry={refresh}
    />
  );
}

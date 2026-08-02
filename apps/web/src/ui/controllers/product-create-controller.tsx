"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { createProductCommandSchema, type ProductId, type Unit } from "@vuarau/domain-contracts";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useDebounced } from "@/api/use-debounced.ts";
import { useContractCommand } from "@/api/use-command.ts";
import { ProductCreateView } from "@/ui/screens/product-create-view.tsx";

export function ProductCreateController() {
  const trpc = useTRPC();
  const { workspaceId } = useSession();
  const router = useRouter();
  const productId = useRef(crypto.randomUUID() as ProductId).current;
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [unit, setUnit] = useState<Unit | "">("");
  const duplicateQuery = useDebounced(name, 250);
  const candidates = useQuery(
    trpc.product.search.queryOptions({
      workspaceId,
      query: duplicateQuery,
      isActive: null,
      cursor: null,
      limit: 5,
    }),
  );
  const mutation = useMutation(trpc.product.create.mutationOptions());
  const command = useContractCommand(createProductCommandSchema, mutation.mutateAsync);

  useEffect(() => {
    if (command.result !== null) router.replace(`/products/${command.result.id}`);
  }, [command.result, router]);

  return (
    <ProductCreateView
      name={name}
      aliases={aliases}
      unit={unit}
      candidates={candidates.data?.items}
      command={command}
      onName={setName}
      onAliases={setAliases}
      onUnit={setUnit}
      onCreate={() =>
        void command.submit({
          productId,
          displayName: name,
          aliases: aliases
            .split(",")
            .map((alias) => alias.trim())
            .filter(Boolean),
          preferredUnit: unit || null,
        })
      }
    />
  );
}

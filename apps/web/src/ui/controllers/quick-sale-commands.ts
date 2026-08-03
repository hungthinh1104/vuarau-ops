"use client";

import { useMutation } from "@tanstack/react-query";
import {
  createProductCommandSchema,
  createSaleDraftCommandSchema,
  discardSaleDraftCommandSchema,
  postSaleCommandSchema,
  updateSaleDraftCommandSchema,
} from "@vuarau/domain-contracts";
import type { ProductDto, SaleDto } from "@vuarau/domain-contracts";
import type { useTRPC } from "@/api/providers.tsx";
import { useCommand } from "@/api/use-command.ts";

type QuickSaleCommandsProps = {
  readonly trpc: ReturnType<typeof useTRPC>;
};

export function useQuickSaleCommands(props: QuickSaleCommandsProps) {
  const createDraft = useMutation(props.trpc.sale.createDraft.mutationOptions());
  const createProduct = useMutation(props.trpc.product.create.mutationOptions());
  const updateDraft = useMutation(props.trpc.sale.updateDraft.mutationOptions());
  const discardDraft = useMutation(props.trpc.sale.discardDraft.mutationOptions());
  const postSale = useMutation(props.trpc.sale.post.mutationOptions());

  const draftCommand = useCommand<unknown, SaleDto>((envelope) => {
    if (typeof envelope.payload !== "object" || envelope.payload === null) {
      throw new Error("Sale draft payload must be an object.");
    }
    if ("customerId" in envelope.payload) {
      return createDraft.mutateAsync(createSaleDraftCommandSchema.parse(envelope));
    }
    return updateDraft.mutateAsync(updateSaleDraftCommandSchema.parse(envelope));
  });
  const postCommand = useCommand<unknown, SaleDto>((envelope) =>
    postSale.mutateAsync(postSaleCommandSchema.parse(envelope)),
  );
  const discardCommand = useCommand<unknown, SaleDto>((envelope) =>
    discardDraft.mutateAsync(discardSaleDraftCommandSchema.parse(envelope)),
  );
  const productCreateCommand = useCommand<unknown, ProductDto>((envelope) =>
    createProduct.mutateAsync(createProductCommandSchema.parse(envelope)),
  );

  return { draftCommand, discardCommand, postCommand, productCreateCommand };
}

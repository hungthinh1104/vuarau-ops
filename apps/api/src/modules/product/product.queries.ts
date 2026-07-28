import type {
  Page,
  ProductDto,
  ProductSearchInput,
  ProductId,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import { err } from "@vuarau/domain-kernel";
import type { DomainResult } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery, toPage, toPageQuery } from "../shared/read-pipeline.ts";

export function searchProducts(
  ctx: CommandContext,
  input: ProductSearchInput,
): Promise<DomainResult<Page<ProductDto>>> {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "product.read",
    execute: async ({ repos }) =>
      toPage(
        await repos.productReads.search({
          workspaceId: input.workspaceId,
          query: input.query,
          isActive: input.isActive,
          page: toPageQuery(input),
        }),
        (row) => row,
      ),
  });
}

export async function getProduct(
  ctx: CommandContext,
  input: { workspaceId: WorkspaceId; productId: ProductId },
): Promise<DomainResult<ProductDto>> {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "product.read",
    execute: ({ repos }) => repos.productReads.get(input.workspaceId, input.productId),
  });
  if (!result.ok) return result;
  return result.value === null
    ? err("PRODUCT_NOT_FOUND", "No such product in this workspace.")
    : { ok: true, value: result.value };
}

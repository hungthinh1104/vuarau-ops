import type { PurchaseId, PurchaseListInput, WorkspaceId } from "@vuarau/domain-contracts";
import { err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery, toPage, toPageQuery } from "../shared/read-pipeline.ts";

export async function getPurchase(
  ctx: CommandContext,
  input: { workspaceId: WorkspaceId; purchaseId: PurchaseId },
) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "purchase.read",
    execute: ({ repos }) => repos.purchaseReads.get(input.workspaceId, input.purchaseId),
  });
  if (!result.ok) return result;
  return result.value === null ? err("PURCHASE_NOT_FOUND", "No such Purchase.") : ok(result.value);
}

export const listPurchases = (ctx: CommandContext, input: PurchaseListInput) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "purchase.read",
    execute: async ({ repos }) =>
      toPage(
        await repos.purchaseReads.list({
          workspaceId: input.workspaceId,
          supplierId: input.supplierId,
          status: input.status,
          page: toPageQuery(input),
        }),
        (row) => row,
      ),
  });

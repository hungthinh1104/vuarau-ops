import type { WorkspaceId } from "@vuarau/domain-contracts";
import type { PurchaseState } from "@vuarau/domain-kernel";
import type { Repositories } from "../../infrastructure/persistence/ports.ts";
import { CommandIntegrityError } from "./integrity.ts";

type ReceivingRepositories = Pick<Repositories, "purchaseReceipts">;

/**
 * One quantity contract for both receiving paths.
 *
 * Direct receipts and accepted inspected dispositions are both physical
 * acceptance against the same Purchase line. Callers must use this combined
 * view while holding the Purchase row lock so switching intake modes cannot
 * create a second allowance for the same goods.
 */
export async function acceptedQuantityByPurchaseLine(
  repos: ReceivingRepositories,
  workspaceId: WorkspaceId,
  purchase: Pick<PurchaseState, "id" | "lines">,
): Promise<ReadonlyMap<string, number>> {
  const facts = await repos.purchaseReceipts.receivingFactsByPurchaseLine(workspaceId, purchase.id);
  const combined = new Map<string, number>();
  for (const line of purchase.lines) {
    const fact = facts.get(line.lineId);
    if (fact?.integrity === true) {
      throw new CommandIntegrityError(
        "INVENTORY_RECONCILIATION_INTEGRITY_FAILURE",
        `Purchase line ${line.lineId} has invalid receiving facts.`,
      );
    }
    combined.set(line.lineId, fact?.receivedNetQuantityScaled ?? 0);
  }
  return combined;
}

import type { WorkspaceId } from "@vuarau/domain-contracts";
import type { PurchaseState } from "@vuarau/domain-kernel";
import type { Repositories } from "../../infrastructure/persistence/ports.ts";

type ReceivingRepositories = Pick<Repositories, "purchaseReceipts" | "qualityDispositions">;

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
  const direct = await repos.purchaseReceipts.netReceivedByPurchaseLine(workspaceId, purchase.id);
  const inspected = await Promise.all(
    purchase.lines.map(async (line) => ({
      line,
      quantity: await repos.qualityDispositions.acceptedQuantityForPurchaseLine(
        workspaceId,
        line.lineId,
      ),
    })),
  );
  const combined = new Map(direct);
  for (const { line, quantity } of inspected) {
    if (quantity === null) continue;
    if (quantity.unit !== line.quantity.unit) {
      throw new Error(`Purchase line ${line.lineId} has mixed receiving units.`);
    }
    const total = BigInt(combined.get(line.lineId) ?? 0) + BigInt(quantity.valueScaled);
    if (total < BigInt(Number.MIN_SAFE_INTEGER) || total > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RangeError("Purchase receiving aggregate exceeds the exact integer range.");
    }
    combined.set(line.lineId, Number(total));
  }
  return combined;
}

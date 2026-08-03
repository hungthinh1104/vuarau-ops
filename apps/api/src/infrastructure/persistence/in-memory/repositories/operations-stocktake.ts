import type { WorkspaceBackupV18, WorkspaceId } from "@vuarau/domain-contracts";
import type { StocktakeCountState, StocktakeSessionState } from "@vuarau/domain-kernel";
import { key, type Store } from "../store.ts";

export function restoreStocktakes(
  store: Store,
  workspaceId: WorkspaceId,
  payload: WorkspaceBackupV18["payload"],
): void {
  for (const raw of payload.stocktakeSessions) {
    const row = {
      ...raw,
      workspaceId,
      counts: [],
      varianceMovementIds: raw["varianceMovementIds"] ?? [],
      evidenceReferences: raw["evidenceReferences"] ?? [],
    } as unknown as StocktakeSessionState;
    store.stocktakeSessions.set(key(workspaceId, row.id), row);
  }
  for (const raw of payload.stocktakeCounts) {
    const row = {
      ...raw,
      workspaceId,
      quantity: { valueScaled: Number(raw["quantityScaled"]), unit: raw["unit"] },
      evidenceReferences: raw["evidenceReferences"] ?? [],
    } as unknown as StocktakeCountState;
    store.stocktakeCounts.set(key(workspaceId, row.id), row);
  }
}

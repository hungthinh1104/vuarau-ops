import type { Repositories } from "../../ports.ts";
import { before, descendingBy, takePage } from "../store.ts";
import type { Store } from "../store.ts";

export const createReconciliationObservationReads = (
  store: Store,
): Pick<Repositories, "reconciliationObservationReads"> => ({
  reconciliationObservationReads: {
    get: async (workspaceId, observationId) =>
      [...store.reconciliationObservations.values()].find(
        (candidate) => candidate.workspaceId === workspaceId && candidate.id === observationId,
      ) ?? null,
    list: async ({ workspaceId, kind, page }) => {
      const rows = [...store.reconciliationObservations.values()]
        .filter((observation) => observation.workspaceId === workspaceId)
        .filter((observation) => kind === null || observation.kind === kind)
        .sort(
          descendingBy(
            (observation) => observation.recordedAt,
            (observation) => observation.id,
          ),
        )
        .filter((observation) =>
          page.after === null
            ? true
            : before(
                [observation.recordedAt, observation.id],
                [page.after.sortValue, page.after.id],
              ),
        );
      return takePage(rows, page, (observation) => ({
        sortValue: observation.recordedAt,
        id: observation.id,
      }));
    },
  },
});

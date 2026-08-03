import type { Repositories } from "../../ports.ts";
import { before, descendingBy, takePage } from "../store.ts";
import type { Store } from "../store.ts";

export const createSupplierObservationReads = (
  store: Store,
): Pick<Repositories, "supplierObservationReads"> => ({
  supplierObservationReads: {
    get: async (workspaceId, observationId) =>
      [...store.supplierObservations.values()].find(
        (candidate) => candidate.workspaceId === workspaceId && candidate.id === observationId,
      ) ?? null,
    list: async ({ workspaceId, kind, page }) => {
      const rows = [...store.supplierObservations.values()]
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
    listAll: async (workspaceId) =>
      [...store.supplierObservations.values()]
        .filter((observation) => observation.workspaceId === workspaceId)
        .sort(
          (left, right) =>
            left.transactionTime.localeCompare(right.transactionTime) ||
            left.recordedAt.localeCompare(right.recordedAt) ||
            left.id.localeCompare(right.id),
        ),
  },
});

import type { Repositories } from "../../ports.ts";
import { before, descendingBy, takePage } from "../store.ts";
import type { Store } from "../store.ts";

export const createWorkspacePolicyReads = (
  store: Store,
): Pick<Repositories, "workspacePolicyReads"> => ({
  workspacePolicyReads: {
    findById: async (workspaceId, policyVersionId) =>
      store.workspacePolicies.get(`${workspaceId}:${policyVersionId}`) ?? null,
    list: async ({ workspaceId, policyKind, state, page }) => {
      const rows = [...store.workspacePolicies.values()]
        .filter((policy) => policy.workspaceId === workspaceId)
        .filter((policy) => policyKind === null || policy.policyKind === policyKind)
        .filter((policy) => state === null || policy.state === state)
        .sort(
          descendingBy(
            (policy) => policy.createdAt,
            (policy) => policy.id,
          ),
        )
        .filter((policy) =>
          page.after === null
            ? true
            : before([policy.createdAt, policy.id], [page.after.sortValue, page.after.id]),
        );
      return takePage(rows, page, (policy) => ({
        sortValue: policy.createdAt,
        id: policy.id,
      }));
    },
    listAll: async (workspaceId) =>
      [...store.workspacePolicies.values()]
        .filter((policy) => policy.workspaceId === workspaceId)
        .sort((left, right) => right.version - left.version || right.id.localeCompare(left.id)),
  },
});

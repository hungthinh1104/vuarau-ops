import type { Repositories } from "../../ports.ts";
import type { WorkspacePolicyState } from "@vuarau/domain-contracts";
import type { Store } from "../store.ts";
import { key } from "../store.ts";

export const createWorkspacePolicyRepositories = (
  store: Store,
): Pick<Repositories, "workspacePolicies"> => ({
  workspacePolicies: {
    findById: async (workspaceId, policyVersionId) =>
      store.workspacePolicies.get(key(workspaceId, policyVersionId)) ?? null,
    listForUpdate: async (workspaceId, policyKind) =>
      [...store.workspacePolicies.values()].filter(
        (policy) => policy.workspaceId === workspaceId && policy.policyKind === policyKind,
      ),
    insert: async (policy) => {
      const policyKey = key(policy.workspaceId, policy.id);
      if (store.workspacePolicies.has(policyKey)) return false;
      if (
        [...store.workspacePolicies.values()].some(
          (candidate) =>
            candidate.workspaceId === policy.workspaceId &&
            candidate.policyKind === policy.policyKind &&
            candidate.version === policy.version,
        )
      ) {
        return false;
      }
      store.workspacePolicies.set(policyKey, policy);
      return true;
    },
    update: async (policy, expectedState: WorkspacePolicyState) => {
      const policyKey = key(policy.workspaceId, policy.id);
      const current = store.workspacePolicies.get(policyKey);
      if (current === undefined || current.state !== expectedState) return false;
      store.workspacePolicies.set(policyKey, policy);
      return true;
    },
  },
});

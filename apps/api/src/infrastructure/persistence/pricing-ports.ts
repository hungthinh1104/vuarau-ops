import type { PriceRuleId, WorkspaceId } from "@vuarau/domain-contracts";
import type { PriceRuleState } from "@vuarau/domain-kernel";

/** Price rules are append-only commercial facts; there is no update or delete port. */
export type PriceRuleRepository = {
  findById(workspaceId: WorkspaceId, priceRuleId: PriceRuleId): Promise<PriceRuleState | null>;
  insert(rule: PriceRuleState): Promise<void>;
};

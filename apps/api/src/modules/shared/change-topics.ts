import type { WorkspaceChangeTopic } from "@vuarau/domain-contracts";

const TOPIC_RULES: readonly [WorkspaceChangeTopic, readonly string[]][] = [
  ["account", ["Debt", "Payment", "Account"]],
  ["cash", ["Cash", "Expense"]],
  ["customer", ["Customer"]],
  ["customerOrder", ["CustomerOrder"]],
  ["delivery", ["Delivery", "Return"]],
  ["document", ["Document"]],
  ["evidence", ["Observation"]],
  ["intake", ["Arrival", "Inspection", "Disposition"]],
  ["inventory", ["Inventory", "Stocktake", "Receipt"]],
  ["operations", ["Backup", "Restore", "OperationalClose"]],
  ["payment", ["Payment"]],
  ["policy", ["Policy"]],
  ["pricing", ["Price"]],
  ["product", ["Product", "Quality"]],
  ["purchase", ["Purchase"]],
  ["quality", ["Quality"]],
  ["report", ["Rebuild"]],
  ["sale", ["Sale"]],
  ["session", ["WorkspaceMember"]],
  ["supplier", ["Supplier"]],
  ["supplyCommitment", ["SupplyCommitment"]],
  ["workspace", ["Workspace"]],
];

/**
 * Command names are the stable server vocabulary. The mapping lives beside
 * the command pipeline so every accepted command records typed read roots,
 * while an unknown future command still gets a safe workspace reconciliation.
 */
export function topicsForCommand(commandType: string): readonly WorkspaceChangeTopic[] {
  const topics = new Set<WorkspaceChangeTopic>(["dashboard"]);
  for (const [topic, fragments] of TOPIC_RULES) {
    if (fragments.some((fragment) => commandType.includes(fragment))) topics.add(topic);
  }
  return [...topics];
}

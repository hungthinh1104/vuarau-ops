import type {
  CreditLimitPolicyDefinition,
  Money,
  WorkspacePolicyVersionId,
} from "@vuarau/domain-contracts";
import { addMoney, compareMoney } from "../shared/money.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

export type CreditLimitDecision = {
  readonly policyVersionId: WorkspacePolicyVersionId;
  readonly mode: CreditLimitPolicyDefinition["parameters"]["mode"];
  readonly currentBalance: Money;
  readonly additionalDebt: Money;
  readonly projectedBalance: Money;
  readonly limit: Money | null;
};

/**
 * BR-CREDIT-001 — credit control is an explicit workspace policy, never a
 * hidden default. Only modes with a complete command effect are supported:
 * information_only records the policy lineage, while hard_block refuses a
 * projected balance above the configured integer limit. Warning and approval
 * require a visible workflow that does not exist yet, so they fail closed.
 */
export function decideCreditLimit({
  definition,
  policyVersionId,
  currentBalance,
  additionalDebt,
}: {
  readonly definition: CreditLimitPolicyDefinition;
  readonly policyVersionId: WorkspacePolicyVersionId;
  readonly currentBalance: Money;
  readonly additionalDebt: Money;
}): DomainResult<CreditLimitDecision> {
  if (currentBalance.currency !== additionalDebt.currency) {
    return err(
      "CREDIT_POLICY_UNAVAILABLE",
      "Credit control cannot evaluate balances in different currencies.",
      { currentCurrency: currentBalance.currency, additionalCurrency: additionalDebt.currency },
    );
  }

  const { mode, limit } = definition.parameters;
  const projectedBalance = addMoney(currentBalance, additionalDebt);

  if (mode === "warning" || mode === "approval_required") {
    return err(
      "CREDIT_POLICY_UNAVAILABLE",
      "This credit-control mode has no complete command workflow yet.",
      { mode, policyVersionId },
    );
  }

  if (mode === "hard_block") {
    if (limit === null || limit.currency !== additionalDebt.currency) {
      return err(
        "CREDIT_POLICY_UNAVAILABLE",
        "A hard-block credit policy requires a limit in the sale currency.",
        { mode, policyVersionId, limitCurrency: limit?.currency ?? null },
      );
    }
    if (compareMoney(projectedBalance, limit) > 0) {
      return err(
        "CREDIT_LIMIT_EXCEEDED",
        "Posting this sale would exceed the customer's configured credit limit.",
        {
          policyVersionId,
          currentBalanceMinor: currentBalance.amountMinor,
          additionalDebtMinor: additionalDebt.amountMinor,
          projectedBalanceMinor: projectedBalance.amountMinor,
          limitMinor: limit.amountMinor,
          currency: limit.currency,
        },
      );
    }
  } else if (limit !== null && limit.currency !== additionalDebt.currency) {
    return err(
      "CREDIT_POLICY_UNAVAILABLE",
      "Credit control cannot compare a limit in a different currency.",
      { mode, policyVersionId, limitCurrency: limit.currency },
    );
  }

  return ok({
    policyVersionId,
    mode,
    currentBalance,
    additionalDebt,
    projectedBalance,
    limit,
  });
}

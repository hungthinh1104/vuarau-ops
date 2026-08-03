import { describe, expect, it } from "vitest";
import {
  creditLimitPolicyDefinitionSchema,
  type WorkspacePolicyVersionId,
} from "@vuarau/domain-contracts";
import { decideCreditLimit } from "./credit-limit.ts";

const policyVersionId = "00000000-0000-4000-8000-000000000099" as WorkspacePolicyVersionId;
const vnd = (amountMinor: number) => ({ amountMinor, currency: "VND" as const });

function definition(
  mode: "information_only" | "warning" | "approval_required" | "hard_block",
  limit: number | null,
) {
  return creditLimitPolicyDefinitionSchema.parse({
    contractVersion: 1,
    parameters: { mode, limit: limit === null ? null : vnd(limit) },
  });
}

describe("BR-CREDIT-001 / TC-CREDIT-001", () => {
  it("allows information-only control and preserves the selected policy identity", () => {
    const result = decideCreditLimit({
      definition: definition("information_only", 100_000),
      policyVersionId,
      currentBalance: vnd(80_000),
      additionalDebt: vnd(50_000),
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        policyVersionId,
        projectedBalance: vnd(130_000),
      },
    });
  });

  it("allows a hard-block sale exactly at the integer limit", () => {
    const result = decideCreditLimit({
      definition: definition("hard_block", 100_000),
      policyVersionId,
      currentBalance: vnd(80_000),
      additionalDebt: vnd(20_000),
    });

    expect(result.ok).toBe(true);
  });

  it("refuses a projected balance above the configured limit", () => {
    const result = decideCreditLimit({
      definition: definition("hard_block", 100_000),
      policyVersionId,
      currentBalance: vnd(80_000),
      additionalDebt: vnd(20_001),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CREDIT_LIMIT_EXCEEDED");
      expect(result.error.details).toMatchObject({ projectedBalanceMinor: 100_001 });
    }
  });

  it("fails closed for modes without a complete approval or warning workflow", () => {
    const result = decideCreditLimit({
      definition: definition("approval_required", 100_000),
      policyVersionId,
      currentBalance: vnd(0),
      additionalDebt: vnd(1),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CREDIT_POLICY_UNAVAILABLE");
  });

  it("rejects a hard-block definition without an explicit limit", () => {
    expect(() => definition("hard_block", null)).toThrow();
  });
});

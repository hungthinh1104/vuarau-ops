import { describe, expect, it } from "vitest";
import { ExactMoneyArithmeticError, addMoney, subtractMoney, sumExactIntegers } from "./money.ts";

describe("exact money arithmetic", () => {
  const max = Number.MAX_SAFE_INTEGER;
  const vnd = (amountMinor: number) => ({ amountMinor, currency: "VND" as const });

  it("rejects an unsafe addition instead of returning an approximate amount", () => {
    expect(() => addMoney(vnd(max), vnd(1), "account.balance.amount_minor")).toThrow(
      ExactMoneyArithmeticError,
    );
    try {
      addMoney(vnd(max), vnd(1), "account.balance.amount_minor");
    } catch (error) {
      expect(error).toMatchObject({ field: "account.balance.amount_minor" });
    }
  });

  it("rejects an unsafe subtraction instead of returning an approximate amount", () => {
    expect(() => subtractMoney(vnd(-max), vnd(1))).toThrow(RangeError);
  });

  it("returns null instead of rounding an aggregate across the safe boundary", () => {
    expect(sumExactIntegers([max, 1])).toBeNull();
    expect(sumExactIntegers([max, -max])).toBe(0);
  });
});

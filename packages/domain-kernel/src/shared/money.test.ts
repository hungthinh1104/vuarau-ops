import { describe, expect, it } from "vitest";
import { addMoney, subtractMoney } from "./money.ts";

describe("exact money arithmetic", () => {
  const max = Number.MAX_SAFE_INTEGER;
  const vnd = (amountMinor: number) => ({ amountMinor, currency: "VND" as const });

  it("rejects an unsafe addition instead of returning an approximate amount", () => {
    expect(() => addMoney(vnd(max), vnd(1))).toThrow(RangeError);
  });

  it("rejects an unsafe subtraction instead of returning an approximate amount", () => {
    expect(() => subtractMoney(vnd(-max), vnd(1))).toThrow(RangeError);
  });
});

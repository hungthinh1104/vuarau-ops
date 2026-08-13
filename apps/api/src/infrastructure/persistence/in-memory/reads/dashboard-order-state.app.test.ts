import { describe, expect, it } from "vitest";
import { saleNextAction } from "./dashboard-order-state.ts";

describe("Operations Board in-memory sale actions", () => {
  it("keeps overdue receivables actionable after fulfilment is complete", () => {
    expect(
      saleNextAction({
        voided: false,
        physicalState: "delivered",
        returnedFulfilment: false,
        unallocatedPayment: false,
        financialState: "overdue",
      }),
    ).toBe("Thu tiền");
  });

  it("keeps an in-flight delivery actionable", () => {
    expect(
      saleNextAction({
        voided: false,
        physicalState: "in_delivery",
        returnedFulfilment: false,
        unallocatedPayment: false,
        financialState: "paid",
      }),
    ).toBe("Theo dõi giao hàng");
  });
});

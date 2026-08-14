import { describe, expect, it } from "vitest";
import { deriveOperationsBoardExceptions } from "./index.ts";

const saleFacts = {
  id: "sale-1",
  kind: "sale" as const,
  reference: "SALE-1",
  href: "/sales/sale-1",
  amountMinor: 1_000_000,
  physicalState: "needs_delivery",
  commercialState: "posted",
  financialState: "reconciliation_required",
  returnedFulfilment: true,
  unallocatedPayment: true,
  unallocatedPaymentAmountMinor: 300_000,
  fulfilmentRemainderUnresolved: false,
  returnSettlementResolved: false,
  reconciliationVariance: false,
  deliveryId: "delivery-1",
};

describe("operations unresolved-state derivation", () => {
  it("TC-OPS-025 — keeps ordinary delivery state out and exposes source-backed uncertainty", () => {
    const exceptions = deriveOperationsBoardExceptions(saleFacts);

    expect(exceptions.map((exception) => exception.kind)).toEqual([
      "return_settlement_unresolved",
      "unallocated_payment",
    ]);
    expect(exceptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "unallocated_payment",
          severity: "critical",
          closeImpact: "blocking",
          source: { kind: "sale", reference: "SALE-1", id: "sale-1" },
          sourceFacts: expect.arrayContaining([
            { key: "unallocated_payment_amount_minor", value: "300000" },
          ]),
          unknown: "Khoản tiền này sẽ được phân bổ vào Sale nào hoặc giữ thành tín dụng.",
          resolutionOptions: expect.arrayContaining([
            { code: "allocate_to_sale", label: "Phân bổ vào Sale" },
          ]),
          nextAction: {
            label: "Mở khoản thanh toán để phân bổ hoặc ghi nhận tín dụng.",
            href: "/sales/sale-1",
          },
        }),
      ]),
    );
  });

  it("TC-OPS-025 — requires an explicit remainder fact instead of treating in_delivery as uncertainty", () => {
    const ordinary = deriveOperationsBoardExceptions({
      ...saleFacts,
      returnedFulfilment: false,
      unallocatedPayment: false,
      unallocatedPaymentAmountMinor: null,
      financialState: "awaiting_payment",
    });
    expect(ordinary).toEqual([]);

    const unresolved = deriveOperationsBoardExceptions({
      ...saleFacts,
      returnedFulfilment: false,
      unallocatedPayment: false,
      unallocatedPaymentAmountMinor: null,
      financialState: "awaiting_payment",
      fulfilmentRemainderUnresolved: true,
    });
    expect(unresolved.map((exception) => exception.kind)).toEqual([
      "fulfilment_remainder_unresolved",
    ]);
  });

  it("TC-OPS-025 — keeps reconciliation variance distinct from an unallocated payment", () => {
    const stateOnly = deriveOperationsBoardExceptions({
      ...saleFacts,
      returnedFulfilment: false,
      unallocatedPayment: false,
      unallocatedPaymentAmountMinor: null,
      financialState: "reconciliation_required",
    });
    expect(stateOnly).toEqual([]);

    const variance = deriveOperationsBoardExceptions({
      ...saleFacts,
      returnedFulfilment: false,
      unallocatedPayment: false,
      unallocatedPaymentAmountMinor: null,
      financialState: "reconciliation_required",
      reconciliationVariance: true,
    });
    expect(variance.map((exception) => exception.kind)).toEqual(["reconciliation_variance"]);
    expect(variance[0]).toMatchObject({
      resolutionOptions: [{ code: "policy_blocked", label: "Chờ chính sách correction" }],
      nextAction: {
        label: "Chờ chính sách reconciliation được phê duyệt.",
      },
    });
  });
});

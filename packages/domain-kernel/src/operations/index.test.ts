import { describe, expect, it } from "vitest";
import { deriveOperationsBoardExceptions } from "./index.ts";

const saleFacts = {
  id: "sale-1",
  kind: "sale" as const,
  reference: "SALE-1",
  href: "/sales/sale-1",
  amountMinor: 1_000_000,
  dueAt: null,
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
  it("TC-OPS-025 — exposes returned and unallocated source-backed exceptions", () => {
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

  it("TC-OPS-025 — exposes outstanding delivery and preserves explicit remainder precedence", () => {
    const ordinary = deriveOperationsBoardExceptions({
      ...saleFacts,
      returnedFulfilment: false,
      unallocatedPayment: false,
      unallocatedPaymentAmountMinor: null,
      financialState: "awaiting_payment",
    });
    expect(ordinary.map((exception) => exception.kind)).toEqual(["outstanding_delivery"]);
    expect(ordinary[0]).toMatchObject({
      sourceFacts: expect.arrayContaining([{ key: "delivery_status", value: "needs_delivery" }]),
      nextAction: {
        label: "Mở Sale hoặc Delivery để tiếp tục giao phần còn lại.",
        href: "/deliveries/delivery-1",
      },
    });

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

  it("TC-OPS-025 — exposes incomplete receiving only for a purchase with a remaining quantity", () => {
    const exceptions = deriveOperationsBoardExceptions({
      ...saleFacts,
      id: "purchase-1",
      kind: "purchase",
      reference: "PUR-1",
      href: "/purchases/purchase-1",
      physicalState: "needs_receiving",
      commercialState: "confirmed",
      financialState: "payable",
      returnedFulfilment: false,
      unallocatedPayment: false,
      unallocatedPaymentAmountMinor: null,
      deliveryId: null,
    });
    expect(exceptions).toEqual([
      expect.objectContaining({
        kind: "incomplete_receiving",
        closeImpact: "acknowledgeable",
        source: { kind: "purchase", reference: "PUR-1", id: "purchase-1" },
        sourceFacts: expect.arrayContaining([
          { key: "receiving_status", value: "needs_receiving" },
        ]),
        nextAction: {
          label: "Mở Purchase để tiếp tục nhận và kiểm tra hàng.",
          href: "/purchases/purchase-1",
        },
      }),
    ]);
    expect(
      deriveOperationsBoardExceptions({
        ...saleFacts,
        id: "purchase-1",
        kind: "purchase",
        physicalState: "received",
        returnedFulfilment: false,
        unallocatedPayment: false,
        unallocatedPaymentAmountMinor: null,
        deliveryId: null,
      }),
    ).toEqual([]);
  });

  it("TC-OPS-025 — keeps reconciliation variance distinct from an unallocated payment", () => {
    const stateOnly = deriveOperationsBoardExceptions({
      ...saleFacts,
      returnedFulfilment: false,
      unallocatedPayment: false,
      unallocatedPaymentAmountMinor: null,
      financialState: "reconciliation_required",
      physicalState: "delivered",
    });
    expect(stateOnly).toEqual([]);

    const variance = deriveOperationsBoardExceptions({
      ...saleFacts,
      returnedFulfilment: false,
      unallocatedPayment: false,
      unallocatedPaymentAmountMinor: null,
      financialState: "reconciliation_required",
      physicalState: "delivered",
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

  it("TC-OPS-025 — exposes an overdue receivable with its due-date source fact", () => {
    const exceptions = deriveOperationsBoardExceptions({
      ...saleFacts,
      financialState: "overdue",
      dueAt: "2026-07-20T00:00:00.000Z",
      physicalState: "delivered",
      returnedFulfilment: false,
      unallocatedPayment: false,
      unallocatedPaymentAmountMinor: null,
    });

    expect(exceptions).toEqual([
      expect.objectContaining({
        kind: "overdue_receivable",
        severity: "high",
        closeImpact: "acknowledgeable",
        sourceFacts: expect.arrayContaining([
          { key: "due_at", value: "2026-07-20T00:00:00.000Z" },
          { key: "overdue_status", value: "overdue" },
        ]),
        nextAction: {
          label: "Mở Sale để thu hồi khoản phải thu quá hạn.",
          href: "/sales/sale-1",
        },
      }),
    ]);
  });
});

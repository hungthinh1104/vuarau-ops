import { describe, expect, it } from "vitest";
import { dashboardSummaryDtoSchema, operationsBoardDtoSchema } from "./index.ts";

describe("dashboard contracts", () => {
  it("allows an unavailable widget without blocking other operational facts", () => {
    const result = dashboardSummaryDtoSchema.safeParse({
      workspaceId: "00000000-0000-4000-8000-000000000001",
      asOf: "2026-08-04T00:00:00.000Z",
      sales: {
        availability: { state: "available", diagnostics: [], updatedAt: null },
        amount: { amountMinor: 100, currency: "VND" },
        count: 1,
      },
      purchases: {
        availability: { state: "available", diagnostics: [], updatedAt: null },
        amount: { amountMinor: 0, currency: "VND" },
        count: 0,
      },
      received: {
        availability: { state: "available", diagnostics: [], updatedAt: null },
        quantities: [],
        count: 0,
      },
      stock: {
        availability: {
          state: "unavailable",
          diagnostics: ["projection_unavailable"],
          updatedAt: null,
        },
        quantities: [],
        count: 0,
      },
      outstandingDelivery: {
        availability: { state: "available", diagnostics: [], updatedAt: null },
        quantities: [],
        count: 0,
      },
      receivables: {
        availability: { state: "available", diagnostics: [], updatedAt: null },
        amount: { amountMinor: 0, currency: "VND" },
        count: 0,
      },
      payables: {
        availability: { state: "available", diagnostics: [], updatedAt: null },
        amount: { amountMinor: 0, currency: "VND" },
        count: 0,
      },
      cash: {
        availability: { state: "available", diagnostics: [], updatedAt: null },
        amount: { amountMinor: 0, currency: "VND" },
        count: 0,
      },
    });
    expect(result.success).toBe(true);
  });

  it("requires separate commercial, physical and financial board states", () => {
    const result = operationsBoardDtoSchema.safeParse({
      workspaceId: "00000000-0000-4000-8000-000000000001",
      asOf: "2026-08-04T00:00:00.000Z",
      counts: {
        all: 1,
        needsReceiving: 0,
        needsDelivery: 1,
        inDelivery: 0,
        awaitingPayment: 1,
        overdue: 0,
        attention: 0,
      },
      page: {
        items: [
          {
            id: "sale-1",
            kind: "sale",
            reference: "SALE-1",
            counterparty: "Khách",
            amount: { amountMinor: 100, currency: "VND" },
            commercialState: "posted",
            physicalState: "needs_delivery",
            financialState: "awaiting_payment",
            ageSeconds: 60,
            nextAction: "Giao hàng",
            updatedAt: "2026-08-04T00:00:00.000Z",
            href: "/sales/sale-1",
            deliveryId: null,
          },
        ],
        nextCursor: null,
      },
    });
    expect(result.success).toBe(true);
  });
});

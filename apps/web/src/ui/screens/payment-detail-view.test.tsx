import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { paymentPage } from "@/fixtures/payment.fixtures.ts";
import { PaymentDetailView } from "./payment-detail-view.tsx";

describe("PaymentDetailView source evidence", () => {
  it("TC-PAYMENT-013 renders safe links and non-HTTP references as text", () => {
    const payment = {
      ...paymentPage[0]!,
      evidenceReferences: [
        "https://evidence.example.test/payments/receipt-1",
        "receipt://cashier/receipt-1",
      ],
    };

    render(
      <PaymentDetailView
        query={{ isPending: false, isError: false, error: null, data: payment }}
        onRetry={() => undefined}
        canReverse={false}
        balance={null}
      />,
    );

    expect(
      screen.getByRole("link", { name: "https://evidence.example.test/payments/receipt-1" }),
    ).toHaveAttribute("href", "https://evidence.example.test/payments/receipt-1");
    expect(screen.getByText("receipt://cashier/receipt-1")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  SupplierId,
  SupplierPaymentId,
  SupplierPaymentReversalId,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import { SupplierPaymentDetailView } from "./supplier-payment-detail-view.tsx";

const paymentId = "00000000-0000-4000-8000-000000000901" as SupplierPaymentId;
const workspaceId = "00000000-0000-4000-8000-000000000902" as WorkspaceId;
const supplierId = "00000000-0000-4000-8000-000000000903" as SupplierId;
const reversalId = "00000000-0000-4000-8000-000000000904" as SupplierPaymentReversalId;

describe("SupplierPaymentDetailView source evidence", () => {
  it("TC-SUPPLIER-005 renders payment and reversal evidence safely", () => {
    render(
      <SupplierPaymentDetailView
        query={{
          isPending: false,
          isError: false,
          error: null,
          data: {
            id: paymentId,
            workspaceId,
            supplierId,
            amount: { amountMinor: 150_000, currency: "VND" },
            method: "cash",
            cashAccountId: null,
            note: null,
            evidenceReferences: ["https://evidence.example.test/supplier-payment/1"],
            reversals: [
              {
                id: reversalId,
                workspaceId,
                supplierPaymentId: paymentId,
                amount: { amountMinor: 20_000, currency: "VND" },
                reason: "Ghi nhầm một phần",
                evidenceReferences: ["receipt://supplier-reversal/1"],
                transactionTime: "2026-08-03T08:00:00.000Z",
                recordedAt: "2026-08-03T08:00:01.000Z",
              },
            ],
            reversedAmount: { amountMinor: 20_000, currency: "VND" },
            status: "partially_reversed",
            version: 2,
            transactionTime: "2026-08-03T07:00:00.000Z",
            recordedAt: "2026-08-03T07:00:01.000Z",
          },
        }}
        onRetry={() => undefined}
        canReverse={false}
      />,
    );

    expect(
      screen.getByRole("link", {
        name: "https://evidence.example.test/supplier-payment/1",
      }),
    ).toHaveAttribute("href", "https://evidence.example.test/supplier-payment/1");
    expect(screen.getByText("receipt://supplier-reversal/1")).toBeInTheDocument();
  });
});

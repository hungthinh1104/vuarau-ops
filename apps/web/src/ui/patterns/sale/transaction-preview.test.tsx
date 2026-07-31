import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ResolvedLine, SaleLineDraft } from "./sale-line-editor.tsx";
import { TransactionPreview } from "./transaction-preview.tsx";

const line: SaleLineDraft = {
  lineId: "line-1",
  productId: null,
  productName: "Cà chua",
  qualityGradeId: null,
  qualityGradeName: "Loại 1",
  quantityText: "12,5",
  unit: "kg",
  unitPriceText: "18.000",
  priceOrigin: { kind: "manual" },
};

const resolved: ResolvedLine = {
  issues: {},
  quantity: { valueScaled: 12_500, unit: "kg" },
  unitPrice: { amountMinor: 18_000, currency: "VND" },
  total: { amountMinor: 225_000, currency: "VND" },
};

describe("TransactionPreview", () => {
  it("shows the exact lines, total and account consequence before posting", () => {
    render(
      <TransactionPreview
        customerName="Lan rau"
        lines={[line]}
        resolved={[resolved]}
        total={{ amountMinor: 225_000, currency: "VND" }}
        currentBalance={{ amountMinor: 100_000, currency: "VND" }}
        currentClassification="receivable"
      />,
    );
    expect(screen.getAllByText("Lan rau")).toHaveLength(2);
    expect(screen.getByText(/Cà chua/)).toHaveTextContent("Cà chua · Loại 1");
    expect(screen.getByText("12,5 kg").parentElement).toHaveTextContent("12,5 kg × 18.000 ₫");
    expect(screen.getAllByText("225.000 ₫").length).toBeGreaterThan(0);
    expect(screen.getByText("Còn nợ hiện tại")).toBeInTheDocument();
    expect(screen.getByText("Còn nợ sau giao dịch")).toBeInTheDocument();
  });

  it("does not invent a balance for a customer that is not yet on the server", () => {
    render(
      <TransactionPreview
        customerName="Khách mới"
        lines={[line]}
        resolved={[resolved]}
        total={{ amountMinor: 225_000, currency: "VND" }}
        currentBalance={null}
        currentClassification={null}
      />,
    );

    expect(screen.getByText(/Công nợ hiện tại chưa có trên máy chủ/)).toBeInTheDocument();
    expect(screen.queryByText(/sau giao dịch/)).not.toBeInTheDocument();
  });

  it("marks an unresolved line instead of guessing its values", () => {
    render(
      <TransactionPreview
        customerName="Lan rau"
        lines={[line]}
        resolved={[{ issues: { quantity: "Sai" }, quantity: null, unitPrice: null, total: null }]}
        total={{ amountMinor: 0, currency: "VND" }}
        currentBalance={{ amountMinor: 0, currency: "VND" }}
        currentClassification="settled"
      />,
    );

    expect(screen.getByText("Dữ liệu dòng chưa hợp lệ.")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EffectPreview } from "./effect-preview.tsx";
import { CertaintyStatus } from "./certainty-status.tsx";

describe("EffectPreview & CertaintyStatus", () => {
  it("renders financial effect consequence preview with correct classification labels", () => {
    render(
      <EffectPreview
        title="Dự kiến công nợ"
        entity={{ label: "Khách hàng", name: "Nguyễn Văn A" }}
        moneyEffect={{
          currentBalance: { amountMinor: 1_000_000, currency: "VND" },
          currentClassification: "receivable",
          change: { amountMinor: -400_000, currency: "VND" },
          changeLabel: "Khách trả",
          resultingBalance: { amountMinor: 600_000, currency: "VND" },
          resultingClassification: "receivable",
        }}
      />,
    );

    expect(screen.getByText("Dự kiến công nợ")).toBeInTheDocument();
    expect(screen.getByText(/Khách hàng:/)).toBeInTheDocument();
    expect(screen.getByText("Nguyễn Văn A")).toBeInTheDocument();
    expect(screen.getByText("Còn nợ hiện tại")).toBeInTheDocument();
    expect(screen.getByText("1.000.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("Khách trả")).toBeInTheDocument();
    expect(screen.getByText("−400.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("Còn nợ sau giao dịch")).toBeInTheDocument();
    expect(screen.getByText("600.000 ₫")).toBeInTheDocument();
  });

  it("renders physical/inventory consequence preview", () => {
    render(
      <EffectPreview
        title="Dự kiến thay đổi tồn kho"
        inventoryEffect={{
          productName: "Cà chua",
          gradeName: "Loại 1",
          currentQuantity: { valueScaled: 10_000, unit: "kg" },
          changeQuantity: { valueScaled: -2_000, unit: "kg" },
          changeLabel: "Xuất giao",
          resultingQuantity: { valueScaled: 8_000, unit: "kg" },
        }}
      />,
    );

    expect(screen.getByText(/Cà chua · Loại 1 \(Tồn hiện tại\)/)).toBeInTheDocument();
    expect(screen.getByText("10 kg")).toBeInTheDocument();
    expect(screen.getByText("Xuất giao")).toBeInTheDocument();
    expect(screen.getByText("−2 kg")).toBeInTheDocument();
    expect(screen.getByText("8 kg")).toBeInTheDocument();
  });

  it("renders CertaintyStatus with appropriate badge tones and descriptions", () => {
    const { rerender } = render(<CertaintyStatus status="confirmed" />);
    expect(screen.getByText("Đã xác nhận")).toBeInTheDocument();

    rerender(<CertaintyStatus status="queued" />);
    expect(screen.getByText("Chờ đồng bộ")).toBeInTheDocument();

    rerender(<CertaintyStatus status="stale" asOf="2026-08-16T08:00:00.000Z" />);
    expect(screen.getByText("Dữ liệu cũ")).toBeInTheDocument();
    expect(screen.getByText(/tính đến/)).toBeInTheDocument();
  });
});

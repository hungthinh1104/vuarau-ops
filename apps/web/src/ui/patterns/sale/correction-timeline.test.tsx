import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { saleReplacement, saleVoided } from "@/fixtures/sale.fixtures.ts";
import { CorrectionTimeline } from "./correction-timeline.tsx";

describe("CorrectionTimeline", () => {
  it("renders the original sale, void reason, and replacement in accounting order", () => {
    render(
      <CorrectionTimeline
        sale={saleVoided}
        replacedBySaleId={saleReplacement.id}
        currentLabel="Mã đơn A"
      />,
    );

    expect(screen.getByText("+ Đơn gốc: Mã đơn A")).toBeInTheDocument();
    expect(screen.getByText(/− Void:.*Ghi nhầm/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /\+ Đơn thay thế/ })).toHaveAttribute(
      "href",
      `/sales/${saleReplacement.id}`,
    );
  });

  it("renders both-way navigation from a replacement back to its source sale", () => {
    render(
      <CorrectionTimeline
        sale={saleReplacement}
        replacedBySaleId={null}
        currentLabel="Mã đơn B"
        replacedSale={saleVoided}
      />,
    );

    expect(screen.getByRole("link", { name: /\+ Đơn gốc/ })).toHaveAttribute(
      "href",
      `/sales/${saleVoided.id}`,
    );
    expect(screen.getByText(/− Void:.*Ghi nhầm/)).toBeInTheDocument();
    expect(screen.getByText("+ Đơn thay thế: Mã đơn B")).toBeInTheDocument();
  });
});

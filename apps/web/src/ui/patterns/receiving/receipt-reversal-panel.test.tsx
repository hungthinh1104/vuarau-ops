import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReceiptReversalPanel } from "./receipt-reversal-panel.tsx";

describe("ReceiptReversalPanel", () => {
  it("states that a recording correction is not a later supplier return", () => {
    render(
      <ReceiptReversalPanel locked={false} onSubmit={() => undefined} onCancel={() => undefined} />,
    );

    expect(
      screen.getByText(/không dùng cho hàng đã nhận đúng rồi mới trả nhà cung cấp/i),
    ).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CustomerCreditPreservationPanel } from "./customer-credit-preservation-panel.tsx";

describe("TC-PAYMENT-015 — CustomerCreditPreservationPanel", () => {
  it("requires a stated reason before sending a financial preservation intent", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CustomerCreditPreservationPanel onSubmit={onSubmit} />);

    await user.type(screen.getByRole("textbox", { name: "Số tiền giữ lại" }), "100.000");
    await user.click(screen.getByRole("button", { name: "Xác nhận giữ tín dụng" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Hãy ghi lý do giữ lại khoản tiền này.")).toBeInTheDocument();
  });

  it("sends a positive explicit preservation intent", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CustomerCreditPreservationPanel onSubmit={onSubmit} />);

    await user.type(screen.getByRole("textbox", { name: "Số tiền giữ lại" }), "200.000");
    await user.type(screen.getByRole("textbox", { name: "Lý do" }), "Khách để lại cho lần mua sau");
    await user.click(screen.getByRole("button", { name: "Xác nhận giữ tín dụng" }));

    expect(onSubmit).toHaveBeenCalledWith({
      amountMinor: 200_000,
      reason: "Khách để lại cho lần mua sau",
      evidenceReferences: [],
    });
  });
});

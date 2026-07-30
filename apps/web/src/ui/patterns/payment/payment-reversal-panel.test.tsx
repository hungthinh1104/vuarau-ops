import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PaymentReversalPanel } from "./payment-reversal-panel.tsx";

describe("PaymentReversalPanel", () => {
  it("requires an explanation before it asks to reverse a payment", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<PaymentReversalPanel remainingAmountMinor={500_000} onSubmit={onSubmit} />);

    await user.type(screen.getByRole("textbox", { name: "Số tiền hoàn" }), "100.000");
    await user.click(screen.getByRole("button", { name: "Xác nhận hoàn tác" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Hãy ghi lý do hoàn tác.")).toBeInTheDocument();
  });

  it("sends a positive amount and explanation explicitly", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<PaymentReversalPanel remainingAmountMinor={500_000} onSubmit={onSubmit} />);

    await user.type(screen.getByRole("textbox", { name: "Số tiền hoàn" }), "200.000");
    await user.type(screen.getByRole("textbox", { name: "Lý do hoàn tác" }), "Khách trả nhầm");
    await user.click(screen.getByRole("button", { name: "Xác nhận hoàn tác" }));

    expect(onSubmit).toHaveBeenCalledWith({ amountMinor: 200_000, reason: "Khách trả nhầm" });
  });
});

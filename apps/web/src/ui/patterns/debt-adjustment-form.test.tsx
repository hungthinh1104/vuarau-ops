import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DebtAdjustmentForm } from "./debt-adjustment-form.tsx";

describe("DebtAdjustmentForm", () => {
  it("requires a reason code and explanation before a manual balance change", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<DebtAdjustmentForm onSubmit={onSubmit} />);

    await user.type(screen.getByRole("textbox", { name: "Số tiền điều chỉnh" }), "20.000");
    await user.click(screen.getByRole("button", { name: "Xác nhận điều chỉnh" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Hãy ghi giải thích cho điều chỉnh này.")).toBeInTheDocument();
  });

  it("makes direction explicit and sends a positive amount", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<DebtAdjustmentForm onSubmit={onSubmit} />);

    await user.selectOptions(screen.getByLabelText("Hướng điều chỉnh"), "decrease");
    await user.selectOptions(screen.getByLabelText("Lý do"), "write_off");
    await user.type(screen.getByRole("textbox", { name: "Số tiền điều chỉnh" }), "20.000");
    await user.type(screen.getByRole("textbox", { name: "Giải thích" }), "Xoá nợ không thể thu");
    await user.click(screen.getByRole("button", { name: "Xác nhận điều chỉnh" }));

    expect(onSubmit).toHaveBeenCalledWith({
      direction: "decrease",
      reasonCode: "write_off",
      amountMinor: 20_000,
      reason: "Xoá nợ không thể thu",
    });
  });
});

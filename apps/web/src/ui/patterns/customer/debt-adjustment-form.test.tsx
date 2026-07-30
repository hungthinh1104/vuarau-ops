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

    await user.click(screen.getByRole("combobox", { name: "Hướng điều chỉnh" }));
    await user.click(screen.getByRole("option", { name: "Giảm công nợ" }));
    await user.click(screen.getByRole("combobox", { name: "Lý do" }));
    await user.click(screen.getByRole("option", { name: "Xoá nợ" }));
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

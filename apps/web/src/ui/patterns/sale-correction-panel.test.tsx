import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SaleCorrectionPanel } from "./sale-correction-panel.tsx";

describe("SaleCorrectionPanel", () => {
  it("requires a reason before a void-only correction can be submitted", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SaleCorrectionPanel onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Xác nhận void" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Hãy ghi lý do điều chỉnh.")).toBeInTheDocument();
  });

  it("sends the selected reason and void-only mode", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SaleCorrectionPanel onSubmit={onSubmit} />);

    await user.selectOptions(screen.getByLabelText("Loại điều chỉnh"), "wrong_amount");
    await user.type(screen.getByRole("textbox", { name: /Lý do điều chỉnh/ }), "Nhập sai giá bán");
    await user.click(screen.getByRole("button", { name: "Xác nhận void" }));

    expect(onSubmit).toHaveBeenCalledWith({
      reasonCode: "wrong_amount",
      reason: "Nhập sai giá bán",
      replacement: false,
    });
  });

  it("keeps the reason and explicitly requests a replacement draft", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SaleCorrectionPanel onSubmit={onSubmit} />);

    await user.click(screen.getByRole("checkbox", { name: /Tạo đơn thay thế sau khi void/ }));
    await user.type(screen.getByRole("textbox", { name: /Lý do điều chỉnh/ }), "Sai số lượng");
    await user.click(screen.getByRole("button", { name: "Void và tạo đơn thay thế" }));

    expect(onSubmit).toHaveBeenCalledWith({
      reasonCode: "wrong_amount",
      reason: "Sai số lượng",
      replacement: true,
    });
  });
});

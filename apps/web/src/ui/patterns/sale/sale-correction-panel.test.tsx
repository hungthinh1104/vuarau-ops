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

    await user.click(screen.getByRole("combobox", { name: "Loại điều chỉnh" }));
    await user.click(screen.getByRole("option", { name: "Sai số tiền hoặc giá" }));
    await user.type(screen.getByRole("textbox", { name: /Lý do điều chỉnh/ }), "Nhập sai giá bán");
    await user.click(screen.getByRole("button", { name: "Xác nhận void" }));

    expect(onSubmit).toHaveBeenCalledWith({
      reasonCode: "wrong_amount",
      reason: "Nhập sai giá bán",
      replacement: false,
      replacementCustomerId: null,
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
      replacementCustomerId: null,
    });
  });

  it("requires and sends a different customer for a wrong-customer replacement", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCustomerSearchChange = vi.fn();
    render(
      <SaleCorrectionPanel
        onSubmit={onSubmit}
        originalCustomerId="customer-old"
        customerSearchQuery="Tuấn"
        customerMatches={[{ id: "customer-new", displayName: "Anh Tuấn" }]}
        onCustomerSearchChange={onCustomerSearchChange}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Loại điều chỉnh" }));
    await user.click(screen.getByRole("option", { name: "Sai khách hàng" }));
    await user.click(screen.getByRole("checkbox", { name: /Tạo đơn thay thế sau khi void/ }));
    await user.type(screen.getByRole("textbox", { name: /Lý do điều chỉnh/ }), "Chọn nhầm khách");
    await user.click(screen.getByRole("button", { name: "Void và tạo đơn thay thế" }));
    expect(screen.getByText("Hãy chọn khách hàng đúng cho đơn thay thế.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Anh Tuấn" }));
    await user.click(screen.getByRole("button", { name: "Void và tạo đơn thay thế" }));
    expect(onSubmit).toHaveBeenCalledWith({
      reasonCode: "wrong_customer",
      reason: "Chọn nhầm khách",
      replacement: true,
      replacementCustomerId: "customer-new",
    });
  });
});

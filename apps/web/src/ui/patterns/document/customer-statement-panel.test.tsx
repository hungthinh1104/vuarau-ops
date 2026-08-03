import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CustomerStatementPanel } from "./customer-statement-panel.tsx";

describe("CustomerStatementPanel", () => {
  it("turns an inclusive Vietnam date range into one multi-day statement period", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CustomerStatementPanel locked={false} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Từ ngày"), "2026-07-20");
    await user.type(screen.getByLabelText("Đến ngày"), "2026-07-23");
    await user.click(screen.getByRole("button", { name: "Tạo sao kê để in" }));

    expect(onSubmit).toHaveBeenCalledWith({
      from: "2026-07-20T00:00:00.000+07:00",
      to: "2026-07-23T23:59:59.999+07:00",
    });
  });

  it("blocks a reversed range and permits all-history output", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { rerender } = render(<CustomerStatementPanel locked={false} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Từ ngày"), "2026-07-24");
    await user.type(screen.getByLabelText("Đến ngày"), "2026-07-20");
    expect(screen.getByRole("button", { name: "Tạo sao kê để in" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Ngày kết thúc");

    rerender(<CustomerStatementPanel locked={false} onSubmit={onSubmit} />);
  });

  it("submits null boundaries when both dates are blank", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CustomerStatementPanel locked={false} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Tạo sao kê để in" }));
    expect(onSubmit).toHaveBeenCalledWith({ from: null, to: null });
  });
});

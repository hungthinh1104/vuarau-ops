import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./primitives/button.tsx";
import { IconButton } from "./primitives/icon-button.tsx";
import { TextInput } from "./primitives/text-input.tsx";
import { MoneyInput } from "./primitives/money-input.tsx";
import { Select } from "./primitives/select.tsx";
import { Textarea } from "./primitives/textarea.tsx";
import { ErrorSummary } from "./primitives/error-summary.tsx";
import { BalanceCard } from "@/ui/patterns/finance/balance-card.tsx";
import { expectNoAccessibilityViolations } from "@/testing/accessibility.ts";
import { balanceReceivable } from "@/fixtures/account.fixtures.ts";
import { X } from "lucide-react";

/**
 * TC-WEB-013 — the interactive primitives are usable without a mouse or a screen.
 *
 * The users are roughly 40–60, often one-handed on a phone at a loading bay, and
 * the accountant works a form with Tab at a desk. Neither is an edge case here.
 */
describe("TC-WEB-013 — accessibility of interactive primitives", () => {
  it("a form of inputs has no axe violations", async () => {
    const { container } = render(
      <form>
        <TextInput label="Tên khách hàng" required defaultValue="Chị Lan" />
        <MoneyInput label="Số tiền" currency="VND" value="875.000" onChange={() => undefined} />
        <Select
          label="Lý do hoàn tác"
          placeholder="Chọn lý do"
          options={[{ value: "wrong_amount", label: "Sai số tiền" }]}
        />
        <Textarea label="Giải thích" />
        <Button>Ghi nhận thanh toán</Button>
        <IconButton label="Đóng">
          <X size={16} />
        </IconButton>
      </form>,
    );

    await expectNoAccessibilityViolations(container);
  });

  it("every input is reachable by its visible label", () => {
    render(<TextInput label="Số điện thoại" defaultValue="0903112233" />);
    // `getByLabelText` only finds it if `htmlFor`/`id` are actually wired.
    expect(screen.getByLabelText(/Số điện thoại/)).toHaveValue("0903112233");
  });

  it("an icon-only control has an accessible name", () => {
    render(
      <IconButton label="Xoá tìm kiếm">
        <X size={16} />
      </IconButton>,
    );
    expect(screen.getByRole("button", { name: "Xoá tìm kiếm" })).toBeInTheDocument();
  });

  /**
   * The error has to reach somebody who cannot see the red: announced as an
   * alert, and linked to the input by `aria-describedby`.
   */
  it("links a field error to its input and announces it", () => {
    render(<TextInput label="Số điện thoại" defaultValue="0903" error="Phải có 10 chữ số." />);

    const input = screen.getByLabelText(/Số điện thoại/);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Phải có 10 chữ số.");
    expect(screen.getByRole("alert")).toHaveTextContent("Phải có 10 chữ số.");
  });

  it("a disabled action is announced as disabled, with its reason", () => {
    render(<Button disabledReason="Đơn đã chốt nên không sửa được nữa.">Sửa đơn</Button>);
    const button = screen.getByRole("button", { name: "Sửa đơn" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("title", "Đơn đã chốt nên không sửa được nữa.");
  });

  it("the error summary is an alert and links to each field", () => {
    const { container } = render(
      <ErrorSummary
        issues={[
          { fieldId: "quantity", message: "Số lượng phải lớn hơn 0 kg." },
          { fieldId: "unitPrice", message: "Đơn giá không được để trống." },
        ]}
      />,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Số lượng phải lớn hơn 0 kg." })).toHaveAttribute(
      "href",
      "#quantity",
    );
    return expectNoAccessibilityViolations(container);
  });

  it("the balance card names whose balance it is", async () => {
    const { container } = render(
      <BalanceCard
        customerName="Chị Lan — chợ Bình Điền"
        balance={balanceReceivable.balance}
        classification={balanceReceivable.classification}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Công nợ của Chị Lan — chợ Bình Điền" }),
    ).toBeInTheDocument();
    await expectNoAccessibilityViolations(container);
  });

  it("keeps typed text after a validation failure re-renders the field", async () => {
    // design.md: "preserve value after validation error". The failure mode is a
    // worker retyping a customer's name because the phone number was wrong.
    const { rerender } = render(<TextInput label="Tên khách hàng" defaultValue="" />);
    const input = screen.getByLabelText(/Tên khách hàng/);
    await userEvent.type(input, "Chị Lan chợ Bình Điền");

    rerender(<TextInput label="Tên khách hàng" defaultValue="" error="Thiếu số điện thoại." />);
    expect(screen.getByLabelText(/Tên khách hàng/)).toHaveValue("Chị Lan chợ Bình Điền");
  });
});

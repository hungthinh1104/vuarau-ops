import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignIn } from "./patterns/sign-in.tsx";

/**
 * TC-WEB-025 — signing in with an emailed code.
 *
 * The screen a pilot starts at, and the first thing a depot worker who has never
 * seen the software touches. Two properties are worth a test rather than a
 * comment: the code stage never appears before a code was actually sent, and a
 * refusal keeps what was typed.
 */
describe("TC-WEB-025 — the sign-in screen", () => {
  const setup = (
    overrides: Partial<{
      requestCode: () => Promise<{ ok: true } | { ok: false; message: string }>;
      submitCode: () => Promise<{ ok: true } | { ok: false; message: string }>;
    }> = {},
  ) => {
    const requestCode = vi.fn(overrides.requestCode ?? (async () => ({ ok: true as const })));
    const submitCode = vi.fn(overrides.submitCode ?? (async () => ({ ok: true as const })));
    render(<SignIn requestCode={requestCode} submitCode={submitCode} />);
    return { requestCode, submitCode };
  };

  it("asks for an email first, and never for a password", () => {
    setup();
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
    // A depot phone is shared. A password on a shared phone gets written on the
    // wall next to it, and the recovery flow is a support call nobody staffs.
    expect(screen.queryByLabelText(/Mật khẩu/)).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it("moves to the code only after one was sent", async () => {
    const { requestCode } = setup();

    expect(screen.queryByLabelText(/Mã đăng nhập/)).toBeNull();

    await userEvent.type(screen.getByLabelText(/Email/), "chu.vua@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Gửi mã đăng nhập" }));

    expect(requestCode).toHaveBeenCalledWith("chu.vua@example.com");
    expect(await screen.findByLabelText(/Mã đăng nhập/)).toBeInTheDocument();
  });

  it("stays on the email when sending was refused, and says why", async () => {
    setup({
      requestCode: async () => ({
        ok: false,
        message: "Email này chưa được cấp quyền. Báo chủ vựa để được thêm vào.",
      }),
    });

    await userEvent.type(screen.getByLabelText(/Email/), "khach.la@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Gửi mã đăng nhập" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("chưa được cấp quyền");
    expect(screen.queryByLabelText(/Mã đăng nhập/)).toBeNull();
    // What was typed is still there. Retyping an email on a phone at a loading
    // bay is exactly the friction this product exists to remove.
    expect(screen.getByLabelText(/Email/)).toHaveValue("khach.la@example.com");
  });

  it("keeps the code on screen when it was wrong, and says what to do", async () => {
    setup({
      submitCode: async () => ({
        ok: false,
        message: "Mã không đúng hoặc đã hết hạn. Bấm gửi lại để nhận mã mới.",
      }),
    });

    await userEvent.type(screen.getByLabelText(/Email/), "chu.vua@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Gửi mã đăng nhập" }));
    await userEvent.type(await screen.findByLabelText(/Mã đăng nhập/), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Bấm gửi lại");
    expect(screen.getByLabelText(/Mã đăng nhập/)).toHaveValue("000000");
  });

  it("offers a way back when the email itself was wrong", async () => {
    setup();
    await userEvent.type(screen.getByLabelText(/Email/), "sai@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Gửi mã đăng nhập" }));
    await userEvent.click(await screen.findByRole("button", { name: "Đổi email" }));

    expect(screen.getByLabelText(/Email/)).toHaveValue("sai@example.com");
    expect(screen.queryByLabelText(/Mã đăng nhập/)).toBeNull();
  });

  it("refuses to submit an empty email or an empty code", async () => {
    setup();
    expect(screen.getByRole("button", { name: "Gửi mã đăng nhập" })).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/Email/), "chu.vua@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Gửi mã đăng nhập" }));

    expect(await screen.findByRole("button", { name: "Xác nhận" })).toBeDisabled();
  });
});

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignIn } from "./patterns/sign-in.tsx";

describe("TC-WEB-025 — password sign-in", () => {
  const setup = (
    signIn: (
      email: string,
      password: string,
    ) => Promise<{ ok: true } | { ok: false; message: string }> = async () => ({ ok: true }),
  ) => {
    const submit = vi.fn(signIn);
    render(<SignIn signIn={submit} />);
    return submit;
  };

  it("submits trimmed email and password with conventional autocomplete", async () => {
    const signIn = setup();
    const email = screen.getByLabelText(/Email/);
    const password = screen.getByLabelText(/Mật khẩu/);
    expect(email).toHaveAttribute("autocomplete", "username");
    expect(password).toHaveAttribute("autocomplete", "current-password");

    await userEvent.type(email, "  chu.vua@example.com  ");
    await userEvent.type(password, "secret");
    await userEvent.type(password, "{Enter}");

    expect(signIn).toHaveBeenCalledWith("chu.vua@example.com", "secret");
  });

  it("shows and hides the password without changing its value", async () => {
    setup();
    const password = screen.getByLabelText(/Mật khẩu/);
    await userEvent.type(password, "khong-duoc-mat");
    await userEvent.click(screen.getByRole("button", { name: "Hiện mật khẩu" }));
    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("khong-duoc-mat");
    await userEvent.click(screen.getByRole("button", { name: "Ẩn mật khẩu" }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("blocks a duplicate submit while authentication is pending", async () => {
    let finish: ((value: { ok: true }) => void) | undefined;
    const pending = new Promise<{ ok: true }>((resolve) => {
      finish = resolve;
    });
    const signIn = setup(() => pending);
    await userEvent.type(screen.getByLabelText(/Email/), "chu.vua@example.com");
    await userEvent.type(screen.getByLabelText(/Mật khẩu/), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(screen.getByRole("button", { name: "Đang đăng nhập…" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Đang đăng nhập…" }));
    expect(signIn).toHaveBeenCalledTimes(1);
    finish?.({ ok: true });
  });

  it("keeps credentials visible after a generic invalid-credential rejection", async () => {
    setup(async () => ({ ok: false, message: "Email hoặc mật khẩu không đúng." }));
    await userEvent.type(screen.getByLabelText(/Email/), "khong-co@example.com");
    await userEvent.type(screen.getByLabelText(/Mật khẩu/), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email hoặc mật khẩu không đúng");
    expect(screen.getByLabelText(/Email/)).toHaveValue("khong-co@example.com");
    expect(screen.getByLabelText(/Mật khẩu/)).toHaveValue("wrong");
  });

  it("does not submit until both fields have values", async () => {
    setup();
    const submit = screen.getByRole("button", { name: "Đăng nhập" });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Email/), "chu.vua@example.com");
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Mật khẩu/), "x");
    expect(submit).toBeEnabled();
  });
});

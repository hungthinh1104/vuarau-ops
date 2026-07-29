import { describe, expect, it, vi } from "vitest";
import { authenticateWithPassword, signInErrorMessage } from "./auth.tsx";

describe("TC-WEB-026 — Supabase password authentication adapter", () => {
  it("uses signInWithPassword and returns success for a valid account", async () => {
    const signInWithPassword = vi.fn(async () => ({ error: null }));
    await expect(
      authenticateWithPassword({ signInWithPassword }, "owner@example.com", "secret"),
    ).resolves.toEqual({ ok: true });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "secret",
    });
  });

  it("uses one generic message for unknown email and wrong password", async () => {
    const unknown = signInErrorMessage({ message: "Invalid login credentials", status: 400 });
    const wrong = signInErrorMessage({ message: "Invalid credentials", status: 400 });
    expect(unknown).toBe("Email hoặc mật khẩu không đúng.");
    expect(wrong).toBe(unknown);
  });

  it("distinguishes rate limiting from a network failure", () => {
    expect(signInErrorMessage({ message: "rate limit exceeded", status: 429 })).toMatch(
      /quá nhiều lần/,
    );
    expect(signInErrorMessage({ message: "Failed to fetch" })).toMatch(/Kiểm tra mạng/);
  });

  it("maps a thrown network failure without leaking provider details", async () => {
    const signInWithPassword = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(
      authenticateWithPassword({ signInWithPassword }, "owner@example.com", "secret"),
    ).resolves.toEqual({
      ok: false,
      message: "Không kết nối được dịch vụ đăng nhập. Kiểm tra mạng rồi thử lại.",
    });
  });

  it("reports missing Supabase configuration as an operator problem", async () => {
    await expect(authenticateWithPassword(null, "owner@example.com", "secret")).resolves.toEqual({
      ok: false,
      message: "Đăng nhập chưa được cấu hình. Báo người cài đặt hệ thống.",
    });
  });
});

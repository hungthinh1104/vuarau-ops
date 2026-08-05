"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/ui/primitives/button.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";

export type SignInProps = {
  readonly signIn: (
    email: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
};

/** Conventional password login for an account provisioned before the pilot. */
export function SignIn({ signIn }: SignInProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await signIn(email.trim(), password);
    setBusy(false);
    if (!result.ok) setError(result.message);
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-canvas p-4 selection:bg-brand-soft">
      <main className="w-full max-w-[440px]">
        <div className="rounded-card border border-border bg-surface p-6 sm:p-8">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-card border border-border bg-brand-soft p-2.5">
              <img
                src="/icon/cauliflower-svgrepo-com.svg"
                alt="Vựa Rau Logo"
                className="h-full w-full object-contain"
              />
            </div>
            <h1 className="text-heading font-bold text-ink">Đăng nhập</h1>
            <p className="mt-2 text-body-sm text-ink-muted">
              Vui lòng sử dụng tài khoản được cấp bởi người vận hành vựa.
            </p>
          </div>

          <form className="flex flex-col gap-5" onSubmit={(event) => void submit(event)}>
            <TextInput
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />

            <div className="flex flex-col gap-2">
              <TextInput
                label="Mật khẩu"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                {...(error !== null ? { error } : {})}
              />
              <div className="flex justify-end mt-1">
                <Button
                  type="button"
                  tone="link"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="min-h-8 text-caption font-medium text-ink-muted transition-colors hover:text-ink"
                >
                  {showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                </Button>
              </div>
            </div>

            <Button
              type="submit"
              fullWidth
              disabled={busy || email.trim().length === 0 || password.length === 0}
            >
              {busy ? "Đang đăng nhập…" : "Đăng nhập"}
            </Button>
          </form>

          <div className="mt-8 flex items-center justify-center gap-2 text-caption text-ink-muted">
            <ShieldCheck className="h-4 w-4" />
            <span>Kết nối an toàn & mã hóa đầu cuối</span>
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center gap-4 text-body-sm text-ink-muted">
          <p>
            Chưa có tài khoản?{" "}
            <span
              className="text-ink-muted"
              title="Chỉ người vận hành mới có quyền tạo tài khoản nội bộ"
            >
              Liên hệ quản lý
            </span>
          </p>
          <Link
            href="/"
            className="group flex items-center gap-1.5 text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            Về trang chủ
          </Link>
        </div>
      </main>
    </div>
  );
}

/**
 * The deployment has no Supabase project configured.
 */
export function SignInUnconfigured() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <main className="w-full max-w-[440px]">
        <div className="rounded-card border border-border bg-surface p-6 text-center sm:p-8">
          <EmptyState
            title="Chưa cấu hình đăng nhập"
            description="Bản triển khai này thiếu NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Báo người cài đặt hệ thống."
          />
        </div>
      </main>
    </div>
  );
}

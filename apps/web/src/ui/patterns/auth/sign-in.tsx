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
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center p-4 overflow-hidden bg-canvas selection:bg-primary/30">
      {/* Aurora Background (Adapts opacity for light/dark) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center dark:opacity-100 opacity-50">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-[100%] bg-primary/10 blur-[120px]" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-blue-500/10 blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full bg-emerald-500/10 blur-[120px]" />
      </div>

      <main className="relative w-full max-w-[440px] z-10">
        {/* Floating Glass Card */}
        <div className="rounded-[32px] border border-border bg-surface/80 p-8 sm:p-10 shadow-2xl backdrop-blur-2xl ring-1 ring-ink/5">
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-primary/10 dark:bg-primary/20 border border-primary/20 p-2.5 shadow-[0_0_30px_rgba(59,166,241,0.2)] mb-5">
              <img
                src="/icon/cauliflower-svgrepo-com.svg"
                alt="Vựa Rau Logo"
                className="h-full w-full object-contain"
              />
            </div>
            <h1 className="text-[28px] font-bold text-ink tracking-tight mb-2">Đăng nhập</h1>
            <p className="text-sm text-ink-muted">
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
              className="!h-12 !rounded-xl transition-all"
            />

            <div className="flex flex-col gap-2">
              <TextInput
                label="Mật khẩu"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="!h-12 !rounded-xl transition-all"
                {...(error !== null ? { error } : {})}
              />
              <div className="flex justify-end mt-1">
                <Button
                  type="button"
                  tone="link"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="min-h-8 text-[12px] font-medium text-ink-muted transition-colors hover:text-ink"
                >
                  {showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                </Button>
              </div>
            </div>

            <Button
              type="submit"
              className="mt-2 h-12 w-full rounded-xl bg-primary text-[15px] font-bold text-white shadow-[0_4px_14px_rgba(59,166,241,0.4)] hover:bg-primary/90 hover:shadow-[0_6px_20px_rgba(59,166,241,0.6)] transition-all disabled:opacity-50 disabled:shadow-none"
              disabled={busy || email.trim().length === 0 || password.length === 0}
            >
              {busy ? "Đang đăng nhập…" : "Đăng nhập"}
            </Button>
          </form>

          <div className="mt-8 flex items-center justify-center gap-2 text-[13px] text-ink-muted">
            <ShieldCheck className="h-4 w-4" />
            <span>Kết nối an toàn & mã hóa đầu cuối</span>
          </div>
        </div>

        {/* Floating links outside card */}
        <div className="mt-8 flex flex-col items-center gap-4 text-sm text-ink-muted">
          <p>
            Chưa có tài khoản?{" "}
            <span
              className="text-ink-muted/70 cursor-not-allowed"
              title="Chỉ người vận hành mới có quyền tạo tài khoản nội bộ"
            >
              Liên hệ quản lý
            </span>
          </p>
          <Link
            href="/"
            className="group flex items-center gap-1.5 text-ink-muted hover:text-ink transition-colors"
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
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-canvas">
      <main className="mx-auto max-w-md w-full">
        <div className="rounded-[32px] border border-border bg-surface/80 p-8 backdrop-blur-2xl text-center ring-1 ring-ink/5">
          <EmptyState
            title="Chưa cấu hình đăng nhập"
            description="Bản triển khai này thiếu NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Báo người cài đặt hệ thống."
          />
        </div>
      </main>
    </div>
  );
}

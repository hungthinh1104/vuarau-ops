"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/ui/primitives/button.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";

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
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 py-10">
      <div>
        <h1 className="text-heading font-bold">Đăng nhập</h1>
        <p className="mt-1 text-body-sm text-ink-muted">
          Dùng tài khoản đã được người vận hành cấp cho bạn.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
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
        <TextInput
          label="Mật khẩu"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          {...(error !== null ? { error } : {})}
        />
        <Button
          type="button"
          tone="secondary"
          disabled={busy}
          aria-pressed={showPassword}
          onClick={() => setShowPassword((visible) => !visible)}
        >
          {showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        </Button>
        <Button
          type="submit"
          fullWidth
          disabled={busy || email.trim().length === 0 || password.length === 0}
        >
          {busy ? "Đang đăng nhập…" : "Đăng nhập"}
        </Button>
      </form>
      <p className="text-body-sm text-ink-muted">
        Quên mật khẩu? Báo người vận hành để được đặt lại. Hệ thống chưa gửi email khôi phục.
      </p>
    </main>
  );
}

/**
 * The deployment has no Supabase project configured.
 *
 * Named as a distinct screen rather than folded into an error, because it is not
 * the worker's problem and nothing they do will fix it. It names the two variables
 * so a facilitator can act without reading the source.
 */
export function SignInUnconfigured() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <EmptyState
        title="Chưa cấu hình đăng nhập"
        description="Bản triển khai này thiếu NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Báo người cài đặt hệ thống."
      />
    </main>
  );
}

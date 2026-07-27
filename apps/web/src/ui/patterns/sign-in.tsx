"use client";

import { useState, type FormEvent } from "react";
import { Button } from "../primitives/button.tsx";
import { EmptyState } from "../primitives/empty-state.tsx";
import { TextInput } from "../primitives/text-input.tsx";

export type SignInProps = {
  readonly requestCode: (email: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  readonly submitCode: (
    email: string,
    code: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
};

/**
 * Sign in with a code sent to an email address.
 *
 * A code, not a magic link. A link means leaving the app for an email client and
 * coming back through a browser that may not be the one holding the session — on
 * a phone, at a loading bay, with one hand free. A six-digit code is read once and
 * typed once, and the tab never moves.
 *
 * No password, and none is coming. A depot phone is shared, a password gets
 * written on the wall next to it, and the recovery flow for a forgotten one is a
 * support conversation nobody is staffed for.
 */
export function SignIn({ requestCode, submitCode }: SignInProps) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await requestCode(email.trim());
    setBusy(false);
    if (result.ok) setStage("code");
    else setError(result.message);
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await submitCode(email.trim(), code.trim());
    setBusy(false);
    // On success the auth state changes and this component unmounts. There is
    // deliberately no "signed in!" state here — the next screen is the answer.
    if (!result.ok) setError(result.message);
  };

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 py-10">
      <div>
        <h1 className="text-heading font-bold">Đăng nhập</h1>
        <p className="mt-1 text-body-sm text-ink-muted">
          Nhập email đã được cấp quyền. Hệ thống sẽ gửi mã đăng nhập.
        </p>
      </div>

      {stage === "email" ? (
        <form className="flex flex-col gap-4" onSubmit={(event) => void send(event)}>
          <TextInput
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            {...(error !== null ? { error } : {})}
          />
          <Button type="submit" fullWidth disabled={busy || email.trim().length === 0}>
            {busy ? "Đang gửi mã…" : "Gửi mã đăng nhập"}
          </Button>
        </form>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={(event) => void verify(event)}>
          <TextInput
            label="Mã đăng nhập"
            /* `inputMode="numeric"` brings up the number pad; `type="text"` keeps
               a leading zero and stops the browser offering to increment it. */
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            hint={`Đã gửi tới ${email.trim()}. Kiểm tra cả hộp thư rác.`}
            onChange={(event) => setCode(event.target.value)}
            {...(error !== null ? { error } : {})}
          />
          <Button type="submit" fullWidth disabled={busy || code.trim().length === 0}>
            {busy ? "Đang kiểm tra…" : "Xác nhận"}
          </Button>
          <Button
            type="button"
            tone="secondary"
            fullWidth
            disabled={busy}
            onClick={() => {
              setStage("email");
              setCode("");
              setError(null);
            }}
          >
            Đổi email
          </Button>
        </form>
      )}
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

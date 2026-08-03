"use client";

import { SignIn, SignInUnconfigured } from "@/ui/patterns/auth/sign-in.tsx";
import { Skeleton } from "@/ui/primitives/skeleton.tsx";

type LoginStatus = "checking" | "unconfigured" | "signed_out" | "signed_in";

export type LoginViewProps = {
  readonly status: LoginStatus;
  readonly signIn: (
    email: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
};

export function LoginView({ status, signIn }: LoginViewProps) {
  if (status === "checking" || status === "signed_in") {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <Skeleton width="w-64" height="h-6" label="Đang mở phiên đăng nhập" />
      </main>
    );
  }
  if (status === "unconfigured") return <SignInUnconfigured />;
  return <SignIn signIn={signIn} />;
}
